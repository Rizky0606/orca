import type { RefObject } from 'react'
import { ArrowLeft } from 'lucide-react'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { NativeChatSettingsButton } from '@/components/native-chat/appearance/NativeChatSettingsButton'
import { NativeChatComposerEditorOwner } from '@/components/native-chat/composer/editor/native-chat-composer-editor-owner'
import { NativeChatHostOutageOwner } from '@/components/native-chat/host-access/native-chat-host-outage-owner'
import { NativeChatPaneLifetime } from '@/components/native-chat/pane/ownership/native-chat-pane-lifetime'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { isActiveDeepResearchStatus } from '../../../../shared/general-chat/general-chat-contract'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GeneralChatDeepResearchPanel } from './GeneralChatDeepResearchPanel'
import { GeneralChatModeSwitcher } from './GeneralChatModeSwitcher'
import { GeneralChatSourcesPanel } from './GeneralChatSourcesPanel'
import type { GeneralChatConversation } from './use-general-chat-controller'
import type { GeneralChatResearchController } from './use-general-chat-research'

export function GeneralChatTranscriptPane({
  conversation,
  target,
  research,
  transcriptTitleId,
  transcriptTitleRef,
  backButtonRef,
  setupErrorBanner,
  onBack
}: {
  conversation: GeneralChatConversation
  target: RuntimeClientTarget
  research: GeneralChatResearchController
  transcriptTitleId: string
  transcriptTitleRef: RefObject<HTMLHeadingElement | null>
  backButtonRef: RefObject<HTMLButtonElement | null>
  setupErrorBanner: React.ReactNode
  onBack: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const activeResearchCount = research.jobs.filter((job) =>
    isActiveDeepResearchStatus(job.status)
  ).length

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby={transcriptTitleId}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 @2xl:px-4">
        <Button
          ref={backButtonRef}
          type="button"
          size="sm"
          variant="ghost"
          className="@2xl:hidden"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          {t('common.back', 'Back')}
        </Button>
        <h2
          id={transcriptTitleId}
          ref={transcriptTitleRef}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus:outline-none"
        >
          {conversation.title}
        </h2>
        <NativeChatSettingsButton standalone />
      </header>

      <GeneralChatModeSwitcher
        mode={research.mode}
        onModeChange={research.setMode}
        sourcesCount={research.sources.length}
        activeResearchCount={activeResearchCount}
        openPanel={research.openPanel}
        onTogglePanel={research.togglePanel}
      />

      {research.openPanel === 'sources' ? (
        <GeneralChatSourcesPanel
          sources={research.sources}
          searching={research.searching}
          busyAction={research.busyAction}
          error={research.error}
          onSearch={research.searchWeb}
          onDeleteSource={research.deleteSource}
          onClearSources={research.clearSources}
          onHandoffToVideoStudio={() => research.handoffToVideoStudio()}
          onClose={() => research.togglePanel('sources')}
        />
      ) : null}

      {research.openPanel === 'research' ? (
        <GeneralChatDeepResearchPanel
          jobs={research.jobs}
          selectedJob={research.selectedJob}
          selectedCitations={research.selectedCitations}
          busyAction={research.busyAction}
          error={research.error}
          onSelectJob={research.selectJob}
          onStartResearch={research.startResearch}
          onPauseJob={research.pauseJob}
          onResumeJob={research.resumeJob}
          onCancelJob={research.cancelJob}
          onSendReportToChat={research.sendReportToChat}
          onHandoffToVideoStudio={(job) => research.handoffToVideoStudio(job)}
          onClose={() => research.togglePanel('research')}
        />
      ) : null}

      {setupErrorBanner}

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
                prepareTurn={research.prepareTurn}
                isVisible
                isFocusedGroup
              />
            </NativeChatComposerEditorOwner>
          </NativeChatHostOutageOwner>
        </NativeChatPaneLifetime>
      </div>
    </section>
  )
}
