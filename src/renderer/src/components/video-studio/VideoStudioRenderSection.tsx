import { ChevronDown, ChevronRight, Download, Film, Play, Square } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import {
  VideoStudioRenderQualitySchema,
  type VideoStudioProject,
  type VideoStudioRenderQuality
} from '../../../../shared/video-studio/video-studio-project'
import type { VideoStudioProductionController } from './use-video-studio-production'

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VideoStudioRenderSection({
  project,
  production,
  engineReady
}: {
  project: VideoStudioProject
  production: VideoStudioProductionController
  engineReady: boolean
}) {
  const t = useTranslate()
  const [quality, setQuality] = useState<VideoStudioRenderQuality>('looks')
  const [logsExpanded, setLogsExpanded] = useState(false)

  const job = production.job
  const isRunning =
    job?.status === 'queued' || job?.status === 'checking' || job?.status === 'rendering'
  const sortedRenders = [...project.renders].toReversed()

  return (
    <div className="grid min-w-0 gap-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-36 gap-1.5">
          <Label htmlFor="vs-render-quality">{t('videoStudio.renderQuality', 'Quality')}</Label>
          <Select
            value={quality}
            disabled={!engineReady || isRunning}
            onValueChange={(value) => {
              const parsed = VideoStudioRenderQualitySchema.safeParse(value)
              if (parsed.success) {
                setQuality(parsed.data)
              }
            }}
          >
            <SelectTrigger id="vs-render-quality" className="min-h-11 @lg:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="draft" className="min-h-11 sm:min-h-8">
                {t('videoStudio.qualityDraft', 'Draft (fast)')}
              </SelectItem>
              <SelectItem value="looks" className="min-h-11 sm:min-h-8">
                {t('videoStudio.qualityLooks', 'Looks (standard)')}
              </SelectItem>
              <SelectItem value="delivery" className="min-h-11 sm:min-h-8">
                {t('videoStudio.qualityDelivery', 'Delivery (high)')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isRunning ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 @lg:min-h-9"
            onClick={production.cancelRender}
          >
            <Square aria-hidden="true" className="size-4" />
            {t('videoStudio.cancelRender', 'Cancel')}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!engineReady || production.busyAction !== null}
            className="min-h-11 @lg:min-h-9"
            onClick={() => production.startRender(quality)}
          >
            <Film aria-hidden="true" className="size-4" />
            {t('videoStudio.renderMp4', 'Render MP4')}
          </Button>
        )}
      </div>

      {job ? (
        <div
          role="status"
          aria-live="polite"
          className="grid gap-2 rounded-md border border-border bg-background p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium">
              {isRunning ? <LoadingSpinner className="size-3.5" /> : null}
              <span>
                {job.stageLabel
                  ? t('videoStudio.jobStatusStage', '{{status}} · {{stage}}', {
                      status: job.status,
                      stage: job.stageLabel
                    })
                  : job.status}
              </span>
            </div>
            {job.progressPercent !== undefined ? (
              <span className="font-mono text-xs text-muted-foreground">
                {job.progressPercent}%
              </span>
            ) : null}
          </div>
          {job.progressPercent !== undefined ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${job.progressPercent}%` }}
              />
            </div>
          ) : null}
          {job.error ? <p className="text-xs text-destructive wrap-anywhere">{job.error}</p> : null}
          {job.logLines.length > 0 ? (
            <div className="grid gap-1">
              <button
                type="button"
                className="flex items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={logsExpanded}
                onClick={() => setLogsExpanded((prev) => !prev)}
              >
                {logsExpanded ? (
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                )}
                <span>
                  {t('videoStudio.renderLogs', 'Logs ({{count}} lines)', {
                    count: job.logLines.length
                  })}
                </span>
              </button>
              {logsExpanded ? (
                <pre className="scrollbar-sleek max-h-40 overflow-auto rounded bg-background p-2 font-mono text-xs text-muted-foreground">
                  {job.logLines.join('\n')}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {sortedRenders.length > 0 ? (
        <div className="grid gap-2">
          <h4 className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            {t('videoStudio.renderOutputs', 'Rendered outputs')}
          </h4>
          <ul className="grid gap-2">
            {sortedRenders.map((render) => {
              const selected = production.selectedRenderId === render.id
              return (
                <li
                  key={render.id}
                  data-current={selected ? 'true' : undefined}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs">{render.fileName}</span>
                      <Badge variant="outline">{render.quality}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t(
                        'videoStudio.renderMetadataSummary',
                        '{{dimensions}} · {{fps}} fps · {{seconds}}s · {{size}}',
                        {
                          dimensions: `${render.width}×${render.height}`,
                          fps: render.fps,
                          seconds: Math.round(render.durationSeconds),
                          size: formatBytes(render.sizeBytes)
                        }
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={selected ? 'secondary' : 'outline'}
                      className="min-h-11 @lg:min-h-8"
                      disabled={production.loadingVideo}
                      onClick={() => production.selectRender(render.id)}
                    >
                      <Play aria-hidden="true" className="size-3.5" />
                      {t('videoStudio.playOutput', 'Play')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11 @lg:min-h-8"
                      disabled={production.loadingVideo}
                      onClick={() => production.saveRender(render.id)}
                    >
                      <Download aria-hidden="true" className="size-3.5" />
                      {t('videoStudio.saveMp4', 'Save MP4')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
          {production.videoUrl ? (
            <video
              controls
              className="aspect-video w-full rounded-md border border-border bg-background"
              src={production.videoUrl}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
