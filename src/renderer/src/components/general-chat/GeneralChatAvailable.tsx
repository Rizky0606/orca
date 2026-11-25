import { useId, useLayoutEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { chatUnavailableLabel } from '@/components/agent/launch-menu/agent-menu-row-presentation'
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
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GeneralChatConversationList } from './GeneralChatConversationList'
import { GeneralChatEmptyState } from './GeneralChatEmptyState'
import { GeneralChatTranscriptPane } from './GeneralChatTranscriptPane'
import type { useGeneralChatController } from './use-general-chat-controller'
import {
  useGeneralChatResearch,
  type GeneralChatResearchController
} from './use-general-chat-research'

export function GeneralChatAvailable({
  controller,
  target,
  hostId,
  pairingRevision,
  researchOverride,
  onOpenAgentSettings
}: {
  controller: ReturnType<typeof useGeneralChatController>
  target: RuntimeClientTarget
  hostId?: ExecutionHostId
  pairingRevision?: number
  researchOverride?: GeneralChatResearchController
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
  const liveResearch = useGeneralChatResearch({
    sessionId: activeSessionId,
    agent: conversation?.agent,
    target,
    hostId,
    pairingRevision,
    enabled: !researchOverride
  })
  const research = researchOverride ?? liveResearch
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
        <Button type="button" size="sm" variant="outline" onClick={onOpenAgentSettings}>
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
          <Button ref={newChatButton} type="submit" className="w-full" disabled={!canStart}>
            <Plus aria-hidden="true" />
            {t('generalChat.newChat', 'New chat')}
          </Button>
          {providers.length > 0 || provider ? (
            <div className="flex min-w-0 items-center gap-3">
              <Label htmlFor={providerFieldId} variant="settings">
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
                <SelectTrigger id={providerFieldId} size="sm" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
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
        <GeneralChatTranscriptPane
          conversation={conversation}
          target={target}
          research={research}
          transcriptTitleId={transcriptTitleId}
          transcriptTitleRef={transcriptTitle}
          backButtonRef={backButton}
          setupErrorBanner={
            setupError ? <div className="shrink-0 border-b border-border">{setup}</div> : null
          }
          onBack={() => {
            selectConversation(null)
            requestAnimationFrame(() => {
              const previous = returnFocus.current
              const fallback = newChatButton.current?.disabled
                ? listPane.current
                : newChatButton.current
              const focusTarget = previous?.isConnected && !previous.disabled ? previous : fallback
              focusTarget?.focus()
            })
          }}
        />
      ) : (
        <div
          className={cn(
            'scrollbar-sleek flex min-h-0 min-w-0 flex-1 flex-col overflow-auto @2xl:flex',
            conversations.length > 0 && !setupError && !progress && !unavailable && 'hidden'
          )}
        >
          {setup}
        </div>
      )}
    </div>
  )
}
