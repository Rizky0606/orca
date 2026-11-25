import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import type { VideoStudioProject } from '../../../../shared/video-studio/video-studio-project'

type Stage = VideoStudioProject['workflowStage']

export function useVideoStudioStages(): Record<Stage, string> {
  const t = useTranslate()
  return {
    research: t('videoStudio.research', 'Research'),
    script: t('videoStudio.script', 'Script'),
    production: t('videoStudio.production', 'Production')
  }
}

export function VideoStudioWorkflow({
  stage,
  onChange
}: {
  stage: Stage
  onChange: (stage: Stage) => void
}) {
  const t = useTranslate()
  const labels = useVideoStudioStages()
  const stages: Stage[] = ['research', 'script', 'production']
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 text-sm font-medium">
        {t('videoStudio.workflow', 'Workflow stage')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {stages.map((value) => (
          <Button
            key={value}
            type="button"
            variant={stage === value ? 'secondary' : 'outline'}
            aria-pressed={stage === value}
            className="min-h-11 flex-1 @lg:min-h-9"
            onClick={() => onChange(value)}
          >
            {labels[value]}
          </Button>
        ))}
      </div>
      {stage === 'production' ? (
        <p className="rounded-md border border-border bg-card p-3 text-sm text-card-foreground">
          {t(
            'videoStudio.renderUnavailable',
            'Rendering is not connected yet. You can still save this project in Production.'
          )}
        </p>
      ) : null}
    </fieldset>
  )
}
