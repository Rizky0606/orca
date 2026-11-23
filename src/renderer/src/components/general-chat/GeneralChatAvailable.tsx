import { useId, useLayoutEffect, useRef } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { chatUnavailableLabel } from '@/components/agent/launch-menu/agent-menu-row-presentation'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { NativeChatSettingsButton } from '@/components/native-chat/appearance/NativeChatSettingsButton'
import { NativeChatComposerEditorOwner } from '@/components/native-chat/composer/editor/native-chat-composer-editor-owner'
import { NativeChatHostOutageOwner } from '@/components/native-chat/host-access/native-chat-host-outage-owner'
import { NativeChatPaneLifetime } from '@/components/native-chat/pane/ownership/native-chat-pane-lifetime'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import { cn } from '@/lib/class-names'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GeneralChatConversationList } from './GeneralChatConversationList'
import { GeneralChatEmptyState } from './GeneralChatEmptyState'
import type { useGeneralChatController } from './use-general-chat-controller'

export function GeneralChatAvailable({
  controller,
  target,
  onOpenAgentSettings
}: {
  controller: ReturnType<typeof useGeneralChatController>
  target: RuntimeClientTarget
  onOpenAgentSettings: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const providerFieldId = useId()
  const transcriptTitleId = useId()
  const transcriptTitle = useRef<HTMLHeadingElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const newChatButton = useRef<HTMLButtonElement>(null)
  const listPane = useRef<HTMLElement>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const {
    home,
    launch,
    busy,
    conversations,
    conversation,
    selectConversation,
    provider,
    providerReady,
    providers,
    providersLoading,
    providerUnavailableReason,
    setProvider,
    newChat,
    retryHome
  } = controller
  const activeSessionId = conversation?.sessionId
  useLayoutEffect(() => {
    if (activeSessionId && returnFocus.current && backButton.current?.getClientRects().length) {
      transcriptTitle.current?.focus({ preventScroll: true })
    }
  }, [activeSessionId])

  const setupError =
    home.kind === 'failed'
      ? home
      : launch.kind === 'ensure-failed' || launch.kind === 'launch-failed'
        ? launch
        : null
  const preparing = home.kind === 'ensuring' || launch.kind === 'ensuring'
  const unavailable = home.kind === 'ready' && !providersLoading && !providerReady
  const canStart = home.kind === 'ready' && providerReady && !busy && !setupError?.unsupported
  const providerIssueTitle = provider
    ? t('generalChat.selectedProviderUnavailable', '{{provider}} is unavailable', {
        provider: structuredAgentLabel(provider)
      })
    : t('generalChat.providerUnavailable', 'No chat provider available')
  const errorTitle = setupError?.unsupported
    ? t('generalChat.updateServer', 'Update Orca on this computer to use General Chat')
    : launch.kind === 'launch-failed'
      ? t('generalChat.launchFailed', 'Couldn’t start the chat')
      : t('generalChat.ensureFailed', 'Couldn’t prepare the chat workspace')
  const progress = preparing
    ? t('generalChat.ensuring', 'Preparing the chat workspace…')
    : launch.kind === 'launching'
      ? t('generalChat.launching', 'Starting the chat…')
      : null
  const start = (): void => {
    returnFocus.current = newChatButton.current
    void newChat()
  }
  const setup = setupError ? (
    <GeneralChatEmptyState
      title={errorTitle}
      description={setupError.unsupported ? undefined : setupError.detail}
      state="error"
      action={
        setupError.unsupported ? undefined : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={home.kind === 'ready' && !canStart}
            className="motion-reduce:transition-none"
            onClick={home.kind === 'failed' ? retryHome : start}
          >
            {t('common.retry', 'Retry')}
          </Button>
        )
      }
    />
  ) : progress ? (
    <GeneralChatEmptyState state="working" title={progress} />
  ) : unavailable ? (
    <GeneralChatEmptyState
      title={providerIssueTitle}
      description={
        providerUnavailableReason
          ? chatUnavailableLabel(providerUnavailableReason, t)
          : t(
              'generalChat.providerSetup',
              'Set up a supported agent on this computer to start a chat.'
            )
      }
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="motion-reduce:transition-none"
          onClick={onOpenAgentSettings}
        >
          {t('generalChat.agentSettings', 'Agent settings')}
        </Button>
      }
    />
  ) : providersLoading && conversations.length === 0 ? (
    <GeneralChatEmptyState
      state="working"
      title={t('generalChat.checkingProviders', 'Checking chat providers…')}
    />
  ) : (
    <GeneralChatEmptyState
      title={
        conversations.length > 0
          ? t('generalChat.chooseConversation', 'Select a conversation')
          : t('generalChat.noConversations', 'Start a conversation')
      }
      description={
        conversations.length === 0
          ? t(
              'generalChat.emptyDescription',
              'Conversations here are independent of your projects.'
            )
          : undefined
      }
      className={conversations.length > 0 ? 'hidden @2xl:flex' : undefined}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col @2xl:flex-row">
      <aside
        ref={listPane}
        tabIndex={-1}
        className={cn(
          'min-h-0 min-w-0 flex-col @2xl:flex @2xl:w-60 @2xl:flex-none @2xl:border-r @2xl:border-border',
          conversations.length > 0 ? 'flex-1' : 'shrink-0',
          conversation ? 'hidden' : 'flex'
        )}
      >
        <form
          className="flex shrink-0 flex-col gap-3 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            start()
          }}
        >
          <Button
            ref={newChatButton}
            type="submit"
            className="w-full motion-reduce:transition-none"
            disabled={!canStart}
          >
            <Plus aria-hidden="true" />
            {t('generalChat.newChat', 'New chat')}
          </Button>
          {providers.length > 0 || provider ? (
            <div className="flex min-w-0 items-center gap-3">
              <Label htmlFor={providerFieldId} className="text-xs text-muted-foreground">
                {t('generalChat.providerLabel', 'Provider')}
              </Label>
              <Select
                value={provider ?? ''}
                disabled={busy || providersLoading}
                onValueChange={(value) => {
                  const agent = providers.find((entry) => entry === value)
                  if (agent) {
                    setProvider(agent)
                  }
                }}
              >
                <SelectTrigger
                  id={providerFieldId}
                  size="sm"
                  className="min-w-0 flex-1 motion-reduce:transition-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="motion-reduce:animate-none">
                  {provider && !providerReady ? (
                    <SelectItem value={provider} disabled>
                      {structuredAgentLabel(provider)}
                    </SelectItem>
                  ) : null}
                  {providers.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {structuredAgentLabel(agent)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {conversation && (progress || unavailable) ? (
            <p role="status" className="text-xs text-muted-foreground">
              {progress ?? providerIssueTitle}
            </p>
          ) : null}
        </form>
        <GeneralChatConversationList
          conversations={conversations}
          selectedSessionId={activeSessionId}
          onSelect={(id, button) => {
            returnFocus.current = button
            selectConversation(id)
          }}
        />
      </aside>
      {conversation ? (
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          aria-labelledby={transcriptTitleId}
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 @2xl:px-4">
            <Button
              ref={backButton}
              type="button"
              size="sm"
              variant="ghost"
              className="motion-reduce:transition-none @2xl:hidden"
              onClick={() => {
                selectConversation(null)
                requestAnimationFrame(() => {
                  const previous = returnFocus.current
                  const fallback = newChatButton.current?.disabled
                    ? listPane.current
                    : newChatButton.current
                  const focusTarget =
                    previous?.isConnected && !previous.disabled ? previous : fallback
                  focusTarget?.focus()
                })
              }}
            >
              <ArrowLeft aria-hidden="true" />
              {t('common.back', 'Back')}
            </Button>
            <h2
              id={transcriptTitleId}
              ref={transcriptTitle}
              tabIndex={-1}
              className="min-w-0 flex-1 truncate rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus:outline-none"
            >
              {conversation.title}
            </h2>
            <NativeChatSettingsButton standalone />
          </header>
          {setupError ? <div className="shrink-0 border-b border-border">{setup}</div> : null}
          <div className="min-h-0 flex-1">
            <NativeChatPaneLifetime key={conversation.sessionId} isVisible>
              <NativeChatHostOutageOwner target={target}>
                <NativeChatComposerEditorOwner>
                  <NativeChatView
                    allowWorkspaceIndependentAttachments
                    mode="structured"
                    tabId={conversation.tabId}
                    sessionId={conversation.sessionId}
                    worktreeId={conversation.worktreeId}
                    target={target}
                    agent={conversation.agent}
                    isVisible
                    isFocusedGroup
                  />
                </NativeChatComposerEditorOwner>
              </NativeChatHostOutageOwner>
            </NativeChatPaneLifetime>
          </div>
        </section>
      ) : (
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-auto @2xl:flex',
            conversations.length > 0 && !setupError && !progress && !unavailable && 'hidden'
          )}
        >
          {setup}
        </div>
      )}
    </div>
  )
}
