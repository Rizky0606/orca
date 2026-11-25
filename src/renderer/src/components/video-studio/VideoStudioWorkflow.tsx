import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import type { VideoStudioProject } from '../../../../shared/video-studio/video-studio-project'
import type { VideoStudioProductionController } from './use-video-studio-production'

export type { VideoStudioProductionController }

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
  project,
  onChange
}: {
  stage: Stage
  project?: VideoStudioProject
  production?: VideoStudioProductionController
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
      {stage === 'production' && !project ? (
        <p className="rounded-md border border-border bg-card p-3 text-sm text-card-foreground">
          {t(
            'videoStudio.saveToProduceHint',
            'Save this project first to scaffold and render its HyperFrames composition.'
          )}
        </p>
      ) : null}
    </fieldset>
  )
}
