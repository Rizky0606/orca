import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Play,
  RefreshCw,
  Square,
  Wrench
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useTranslate } from '@/i18n/use-translate'
import type { VideoStudioProject } from '../../../../shared/video-studio/video-studio-project'
import { VideoStudioRenderSection } from './VideoStudioRenderSection'
import type { VideoStudioProductionController } from './use-video-studio-production'

export function VideoStudioProductionPanel({
  project,
  production
}: {
  project: VideoStudioProject
  production: VideoStudioProductionController
}) {
  const t = useTranslate()
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  if (project.engine === 'remotion') {
    return (
      <section className="grid min-w-0 gap-2 rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {t('videoStudio.productionPipeline', 'Production pipeline')}
          </h3>
          <Badge variant="comingSoon">{t('videoStudio.phaseSix', 'Phase 6')}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            'videoStudio.remotionPlannedNotice',
            'Remotion rendering is reserved for Phase 6. Switch the project engine to HyperFrames to scaffold, preview, and render locally.'
          )}
        </p>
      </section>
    )
  }

  const hfStatus = production.engines?.find((item) => item.engine === 'hyperframes')
  const engineReady = hfStatus?.available === true
  const composition = production.composition
  const preview = production.preview
  const isJobRunning =
    production.job?.status === 'queued' ||
    production.job?.status === 'checking' ||
    production.job?.status === 'rendering'

  return (
    <section className="grid min-w-0 gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {t('videoStudio.productionPipeline', 'Production pipeline')}
            </h3>
            <Badge variant="outline">
              {t('videoStudio.engineHyperFrames', 'HyperFrames')}
              {hfStatus?.version ? ` ${hfStatus.version}` : ''}
            </Badge>
            {engineReady ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 aria-hidden="true" className="size-3" />
                {t('videoStudio.engineReady', 'Ready')}
              </Badge>
            ) : hfStatus ? (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle aria-hidden="true" className="size-3" />
                {t('videoStudio.toolsMissing', 'Tools required')}
              </Badge>
            ) : null}
          </div>
          {hfStatus && !engineReady ? (
            <p className="text-xs text-muted-foreground wrap-anywhere">{hfStatus.summary}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={production.probingEngines}
          className="min-h-11 @lg:min-h-8"
          onClick={production.recheckEngines}
        >
          {production.probingEngines ? (
            <LoadingSpinner className="size-3.5" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-3.5" />
          )}
          {t('videoStudio.recheckTools', 'Recheck')}
        </Button>
      </div>

      {production.error ? (
        <p role="alert" className="text-xs text-destructive wrap-anywhere">
          {production.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!composition?.entryExists ? (
          <Button
            type="button"
            variant="default"
            disabled={production.busyAction !== null}
            className="min-h-11 @lg:min-h-9"
            onClick={() => production.scaffoldComposition(false)}
          >
            <Wrench aria-hidden="true" className="size-4" />
            {t('videoStudio.scaffoldComposition', 'Scaffold composition')}
          </Button>
        ) : confirmOverwrite ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="min-h-11 @lg:min-h-9"
              onClick={() => {
                setConfirmOverwrite(false)
                production.scaffoldComposition(true)
              }}
            >
              {t('videoStudio.confirmRescaffold', 'Overwrite index.html')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11 @lg:min-h-9"
              onClick={() => setConfirmOverwrite(false)}
            >
              {t('videoStudio.cancel', 'Cancel')}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={production.busyAction !== null}
            className="min-h-11 @lg:min-h-9"
            onClick={() => setConfirmOverwrite(true)}
          >
            <Wrench aria-hidden="true" className="size-4" />
            {t('videoStudio.rescaffoldComposition', 'Re-scaffold')}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={production.busyAction !== null}
          className="min-h-11 @lg:min-h-9"
          onClick={production.openInWorkspace}
        >
          <FolderOpen aria-hidden="true" className="size-4" />
          {t('videoStudio.openInWorkspace', 'Open in workspace')}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={!engineReady || isJobRunning || production.busyAction !== null}
          className="min-h-11 @lg:min-h-9"
          onClick={production.runCheck}
        >
          {t('videoStudio.runCheck', 'Run check')}
        </Button>

        {preview.active ? (
          <>
            {preview.url ? (
              <Button type="button" variant="secondary" asChild className="min-h-11 @lg:min-h-9">
                <a href={preview.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" className="size-4" />
                  {t('videoStudio.openPreview', 'Open preview')}
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              disabled={production.busyAction !== null}
              className="min-h-11 @lg:min-h-9"
              onClick={production.stopPreview}
            >
              <Square aria-hidden="true" className="size-4" />
              {t('videoStudio.stopPreview', 'Stop preview')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={!engineReady || production.busyAction !== null}
            className="min-h-11 @lg:min-h-9"
            onClick={production.startPreview}
          >
            <Play aria-hidden="true" className="size-4" />
            {t('videoStudio.startPreview', 'Start preview')}
          </Button>
        )}
      </div>

      {production.checkResult ? (
        <div
          role={production.checkResult.passed ? 'status' : 'alert'}
          className="grid gap-1.5 rounded-md border border-border bg-background p-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2 font-medium">
            <span>{production.checkResult.summary}</span>
            {production.checkResult.durationMs !== undefined ? (
              <span className="font-mono text-muted-foreground">
                {`${Math.round(production.checkResult.durationMs)} ms`}
              </span>
            ) : null}
          </div>
          {production.checkResult.errors.map((issue, idx) => (
            <p key={`err-${idx}`} className="text-destructive wrap-anywhere">
              {issue.code ? `${issue.code}: ` : ''}
              {issue.message}
            </p>
          ))}
          {production.checkResult.warnings.map((issue, idx) => (
            <p key={`warn-${idx}`} className="text-muted-foreground wrap-anywhere">
              {issue.code ? `${issue.code}: ` : ''}
              {issue.message}
            </p>
          ))}
        </div>
      ) : null}

      <VideoStudioRenderSection
        project={project}
        production={production}
        engineReady={engineReady}
      />
    </section>
  )
}
