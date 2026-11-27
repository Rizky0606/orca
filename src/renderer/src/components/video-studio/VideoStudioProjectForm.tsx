import { useId, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import {
  VIDEO_STUDIO_FPS_OPTIONS,
  VideoStudioEngineSchema,
  VideoStudioProjectFields,
  type VideoStudioProject
} from '../../../../shared/video-studio/video-studio-project'
import type { VideoStudioCreateProjectParams } from '../../../../shared/video-studio/video-studio-rpc-contract'
import type { StyleProfile } from '../../../../shared/video-studio/video-studio-style-contract'
import { VideoStudioWorkflow, type VideoStudioProductionController } from './VideoStudioWorkflow'
import {
  parseVideoStudioDraft,
  videoStudioDraft,
  type VideoStudioDraft
} from './video-studio-draft'

export function VideoStudioProjectForm({
  project,
  busy,
  production,
  styleProfiles,
  activeStage,
  hideWorkflow,
  onSave,
  onCancel,
  onDelete
}: {
  project?: VideoStudioProject
  busy: boolean
  production?: VideoStudioProductionController
  styleProfiles?: readonly StyleProfile[]
  activeStage?: VideoStudioProject['workflowStage']
  hideWorkflow?: boolean
  onSave: (fields: VideoStudioCreateProjectParams) => void
  onCancel: () => void
  onDelete: (trigger: HTMLButtonElement) => void
}) {
  const t = useTranslate()
  const formId = useId()
  const [draft, setDraft] = useState(() => videoStudioDraft(project))
  const [submitted, setSubmitted] = useState(false)
  const parsed = parseVideoStudioDraft(draft)
  const titleError = submitted && parsed.errors?.includes('title')
  const durationError = submitted && parsed.errors?.includes('durationSeconds')

  function change<Field extends keyof VideoStudioDraft>(
    field: Field,
    value: VideoStudioDraft[Field]
  ) {
    setDraft((state) => ({ ...state, [field]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    const effective =
      activeStage && activeStage !== draft.workflowStage
        ? parseVideoStudioDraft({ ...draft, workflowStage: activeStage })
        : parsed
    if (effective.project) {
      onSave(effective.project)
      return
    }
    const field = effective.errors?.[0]
    if (typeof field === 'string') {
      document.getElementById(`${formId}-${field}`)?.focus()
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <fieldset className="grid min-w-0 gap-5" disabled={busy}>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${formId}-title`}>
            {t('videoStudio.projectTitle', 'Project title')}
          </Label>
          <Input
            id={`${formId}-title`}
            required
            className="min-h-11 @lg:min-h-9"
            value={draft.title}
            aria-invalid={titleError || undefined}
            aria-describedby={titleError ? `${formId}-title-error` : undefined}
            onChange={(event) => change('title', event.currentTarget.value)}
          />
          {titleError ? (
            <p id={`${formId}-title-error`} className="text-xs text-destructive">
              {t('videoStudio.titleRequired', 'Enter a project title.')}
            </p>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${formId}-prompt`}>{t('videoStudio.prompt', 'Prompt')}</Label>
          <Textarea
            id={`${formId}-prompt`}
            rows={4}
            value={draft.prompt}
            onChange={(event) => change('prompt', event.currentTarget.value)}
          />
        </div>
        <div className="grid min-w-0 gap-4 @sm:grid-cols-2">
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={`${formId}-ratio`}>
              {t('videoStudio.aspectRatio', 'Aspect ratio')}
            </Label>
            <Select
              value={draft.aspectRatio}
              disabled={busy}
              onValueChange={(value) => {
                const ratio = VideoStudioProjectFields.shape.aspectRatio.safeParse(value)
                if (ratio.success) {
                  change('aspectRatio', ratio.data)
                }
              }}
            >
              <SelectTrigger id={`${formId}-ratio`} className="min-h-11 w-full @lg:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {VideoStudioProjectFields.shape.aspectRatio.options.map((ratio) => (
                  <SelectItem key={ratio} value={ratio} className="min-h-11 sm:min-h-8">
                    {ratio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={`${formId}-durationSeconds`}>
              {t('videoStudio.durationSeconds', 'Duration (seconds)')}
            </Label>
            <Input
              id={`${formId}-durationSeconds`}
              type="number"
              min={5}
              max={3600}
              step={1}
              required
              className="min-h-11 @lg:min-h-9"
              value={draft.durationSeconds}
              aria-invalid={durationError || undefined}
              aria-describedby={durationError ? `${formId}-duration-error` : undefined}
              onChange={(event) => change('durationSeconds', event.currentTarget.value)}
            />
            {durationError ? (
              <p id={`${formId}-duration-error`} className="text-xs text-destructive">
                {t('videoStudio.durationInvalid', 'Enter a whole number from 5 to 3,600.')}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid min-w-0 gap-4 @sm:grid-cols-2">
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={`${formId}-engine`}>{t('videoStudio.engine', 'Render engine')}</Label>
            <Select
              value={draft.engine}
              disabled={busy}
              onValueChange={(value) => {
                const engine = VideoStudioEngineSchema.safeParse(value)
                if (engine.success) {
                  change('engine', engine.data)
                }
              }}
            >
              <SelectTrigger id={`${formId}-engine`} className="min-h-11 w-full @lg:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="hyperframes" className="min-h-11 sm:min-h-8">
                  {t('videoStudio.engineHyperFrames', 'HyperFrames')}
                </SelectItem>
                <SelectItem value="remotion" disabled className="min-h-11 sm:min-h-8">
                  <span className="flex items-center gap-2">
                    <span>{t('videoStudio.engineRemotion', 'Remotion')}</span>
                    <Badge variant="comingSoon">{t('videoStudio.phaseSix', 'Phase 6')}</Badge>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={`${formId}-fps`}>{t('videoStudio.fps', 'Frame rate (FPS)')}</Label>
            <Select
              value={String(draft.fps)}
              disabled={busy}
              onValueChange={(value) => {
                const parsedFps = VideoStudioProjectFields.shape.fps.safeParse(Number(value))
                if (parsedFps.success) {
                  change('fps', parsedFps.data)
                }
              }}
            >
              <SelectTrigger id={`${formId}-fps`} className="min-h-11 w-full @lg:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {VIDEO_STUDIO_FPS_OPTIONS.map((fpsOption) => (
                  <SelectItem
                    key={fpsOption}
                    value={String(fpsOption)}
                    className="min-h-11 sm:min-h-8"
                  >
                    {t('videoStudio.fpsOption', '{{fps}} fps', { fps: fpsOption })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {!project ? (
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={`${formId}-style`}>
              {t('videoStudio.initialStyleProfile', 'Visual style profile')}
            </Label>
            <Select
              value={draft.styleProfileId ?? 'technical-explainer-01'}
              disabled={busy}
              onValueChange={(value) => change('styleProfileId', value)}
            >
              <SelectTrigger id={`${formId}-style`} className="min-h-11 w-full @lg:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {(styleProfiles && styleProfiles.length > 0
                  ? styleProfiles
                  : [
                      { id: 'technical-explainer-01', name: 'Technical Explainer 01' },
                      { id: 'clean-editorial-01', name: 'Clean Editorial 01' }
                    ]
                ).map((item) => (
                  <SelectItem key={item.id} value={item.id} className="min-h-11 sm:min-h-8">
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {!hideWorkflow ? (
          <VideoStudioWorkflow
            stage={draft.workflowStage}
            project={project}
            production={production}
            onChange={(stage) => change('workflowStage', stage)}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          {project ? (
            <Button
              className="min-h-11 @lg:min-h-9"
              type="button"
              variant="ghost-destructive"
              onClick={(event) => onDelete(event.currentTarget)}
            >
              {t('videoStudio.deleteProject', 'Delete project')}
            </Button>
          ) : (
            <Button
              className="min-h-11 @lg:min-h-9"
              type="button"
              variant="ghost"
              onClick={onCancel}
            >
              {t('videoStudio.cancel', 'Cancel')}
            </Button>
          )}
          <Button className="min-h-11 @lg:min-h-9" type="submit">
            {project
              ? t('videoStudio.saveChanges', 'Save changes')
              : t('videoStudio.createProject', 'Create project')}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
