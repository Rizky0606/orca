import { useState } from 'react'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Send,
  Sparkles,
  Square,
  Video,
  X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslate } from '@/i18n/use-translate'
import {
  canCancelDeepResearch,
  canPauseDeepResearch,
  canResumeDeepResearch,
  type DeepResearchJob,
  type GeneralChatSource
} from '../../../../shared/general-chat/general-chat-contract'

function StepIcon({ status }: { status: DeepResearchJob['steps'][number]['status'] }) {
  if (status === 'completed') {
    return <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
  }
  if (status === 'running') {
    return <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-primary" />
  }
  return <Circle aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
}

export function GeneralChatDeepResearchPanel({
  jobs,
  selectedJob,
  selectedCitations,
  busyAction,
  error,
  onSelectJob,
  onStartResearch,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  onSendReportToChat,
  onHandoffToVideoStudio,
  onClose
}: {
  jobs: readonly DeepResearchJob[]
  selectedJob: DeepResearchJob | null
  selectedCitations: readonly GeneralChatSource[]
  busyAction: string | null
  error: string | null
  onSelectJob: (jobId: string) => void
  onStartResearch: (topic: string) => Promise<void>
  onPauseJob: (jobId: string) => Promise<void>
  onResumeJob: (jobId: string) => Promise<void>
  onCancelJob: (jobId: string) => Promise<void>
  onSendReportToChat: (job: DeepResearchJob) => Promise<void>
  onHandoffToVideoStudio: (job: DeepResearchJob) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [topic, setTopic] = useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const clean = topic.trim()
    if (!clean || busyAction !== null) {
      return
    }
    setTopic('')
    void onStartResearch(clean)
  }

  return (
    <section
      aria-label={t('generalChat.research.panelTitle', 'Deep Research')}
      className="scrollbar-sleek max-h-72 shrink-0 overflow-y-auto border-b border-border bg-card px-3 py-3 @2xl:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold">
            {t('generalChat.research.heading', 'Deep Research')}
          </h3>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t('common.close', 'Close')}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="mb-2.5 flex items-center gap-2">
        <Input
          density="compact"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          disabled={busyAction !== null}
          placeholder={t(
            'generalChat.research.topicPlaceholder',
            'Enter a research topic to plan, search, read sources, and synthesize a cited brief…'
          )}
        />
        <Button type="submit" size="xs" disabled={busyAction !== null || !topic.trim()}>
          <Sparkles aria-hidden="true" />
          <span>{t('generalChat.research.startAction', 'Start Research')}</span>
        </Button>
      </form>

      {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}

      {jobs.length > 1 ? (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {jobs.slice(0, 6).map((job) => (
            <Button
              key={job.id}
              type="button"
              size="xs"
              variant={selectedJob?.id === job.id ? 'secondary' : 'outline'}
              onClick={() => onSelectJob(job.id)}
            >
              <span className="max-w-44 truncate">{job.topic}</span>
            </Button>
          ))}
        </div>
      ) : null}

      {selectedJob ? (
        <div className="space-y-2.5 rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-semibold">{selectedJob.topic}</span>
                <Badge variant="secondary">{selectedJob.status}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {t(
                  'generalChat.research.metrics',
                  '{{queries}} queries · {{sources}} sources · {{pages}} pages read',
                  {
                    queries: selectedJob.queriesExecuted,
                    sources: selectedJob.sourcesCollected,
                    pages: selectedJob.pagesRead
                  }
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {canPauseDeepResearch(selectedJob.status) ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => void onPauseJob(selectedJob.id)}
                >
                  <Pause aria-hidden="true" />
                  <span>{t('generalChat.research.pause', 'Pause')}</span>
                </Button>
              ) : null}
              {canResumeDeepResearch(selectedJob.status) ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => void onResumeJob(selectedJob.id)}
                >
                  <Play aria-hidden="true" />
                  <span>{t('generalChat.research.resume', 'Resume')}</span>
                </Button>
              ) : null}
              {canCancelDeepResearch(selectedJob.status) ? (
                <Button
                  type="button"
                  size="xs"
                  variant="muted-field-icon"
                  disabled={busyAction !== null}
                  onClick={() => void onCancelJob(selectedJob.id)}
                >
                  <Square aria-hidden="true" />
                  <span>{t('common.cancel', 'Cancel')}</span>
                </Button>
              ) : null}
              {selectedJob.reportMarkdown ? (
                <>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() => void onSendReportToChat(selectedJob)}
                  >
                    <Send aria-hidden="true" />
                    <span>{t('generalChat.research.sendToChat', 'Send to Chat')}</span>
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="default"
                    disabled={busyAction !== null}
                    onClick={() => void onHandoffToVideoStudio(selectedJob)}
                  >
                    <Video aria-hidden="true" />
                    <span>{t('generalChat.handoff.createVideo', 'Send to Video Studio')}</span>
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {selectedJob.steps.length > 0 ? (
            <ul className="space-y-1">
              {selectedJob.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-2 text-xs">
                  <StepIcon status={step.status} />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{step.title}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{step.query}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {selectedJob.errorMessage ? (
            <p className="text-xs text-destructive">{selectedJob.errorMessage}</p>
          ) : null}

          {selectedJob.reportMarkdown ? (
            <div className="scrollbar-sleek max-h-48 overflow-y-auto rounded-md border border-border bg-muted/20 p-2.5 text-xs whitespace-pre-wrap">
              {selectedJob.reportMarkdown}
            </div>
          ) : null}

          {selectedCitations.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedCitations.slice(0, 8).map((citation) => (
                <a
                  key={citation.id}
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span className="max-w-36 truncate">{citation.title}</span>
                  <ExternalLink aria-hidden="true" className="size-2.5" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t(
            'generalChat.research.empty',
            'Start a Deep Research job above or switch the composer to Deep Research mode.'
          )}
        </p>
      )}
    </section>
  )
}
