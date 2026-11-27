import { AlertTriangle, FileWarning, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import type { VideoStudioCompositionState } from '../../../../shared/video-studio/video-studio-rpc-contract'
import type { ValidationStatus } from '../../../../shared/video-studio/video-studio-validation-contract'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'
import type { VideoStudioCheckResultView } from './video-studio-production-actions'

function validationBadgeVariant(
  status: ValidationStatus | undefined
): 'secondary' | 'warning' | 'destructive' | 'outline' {
  if (status === 'passed') {
    return 'secondary'
  }
  if (status === 'partial' || status === 'unsupported') {
    return 'warning'
  }
  if (status === 'failed' || status === 'error') {
    return 'destructive'
  }
  return 'outline'
}

export function VideoStudioValidationBanner({
  composition,
  checkResult,
  externalChangedPaths,
  onReloadExternal,
  inspector
}: {
  composition: VideoStudioCompositionState | null
  checkResult: VideoStudioCheckResultView | null
  externalChangedPaths: readonly string[]
  onReloadExternal: () => void
  inspector?: VideoStudioInspectorController
}) {
  const t = useTranslate()
  const docs = inspector?.documents
  const liveFingerprint = docs?.currentInputFingerprint ?? composition?.currentInputFingerprint
  const approvedFingerprint = docs?.approvedInputFingerprint
  const trustState = docs?.trustState
  const fingerprintChanged =
    Boolean(liveFingerprint && approvedFingerprint && liveFingerprint !== approvedFingerprint) ||
    (trustState === 'unapproved' && Boolean(liveFingerprint))
  const needsApproval =
    trustState === 'unapproved' || fingerprintChanged || Boolean(composition?.checkStale)

  const report = checkResult
  const isStale = Boolean(composition?.checkStale || report?.stale)

  return (
    <div className="grid min-w-0 gap-2.5">
      {externalChangedPaths.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-status-warning-border bg-status-warning-background p-2.5 text-xs text-status-warning-text"
        >
          <span className="flex items-center gap-1.5 wrap-anywhere">
            <FileWarning aria-hidden="true" className="size-3.5 shrink-0" />
            {t('videoStudio.externalEditConflictBanner', 'External edits detected on {{paths}}.', {
              paths: externalChangedPaths.join(', ')
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 @lg:min-h-8"
            onClick={onReloadExternal}
          >
            {t('videoStudio.reloadExternalChanges', 'Reload external changes')}
          </Button>
        </div>
      ) : null}

      {inspector && (trustState || liveFingerprint) ? (
        <div
          role={needsApproval ? 'status' : undefined}
          className={
            needsApproval
              ? 'flex flex-wrap items-center justify-between gap-2 rounded border border-status-warning-border bg-status-warning-background p-2.5 text-xs text-status-warning-text'
              : 'flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background p-2.5 text-xs'
          }
        >
          <div className="grid gap-0.5">
            <span className="flex items-center gap-1.5 font-medium">
              {needsApproval ? (
                <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
              )}
              {trustState === 'approved-render' && !fingerprintChanged
                ? t('videoStudio.trustApprovedRender', 'Host execution approved for render & check')
                : trustState === 'approved-preview' && !fingerprintChanged
                  ? t(
                      'videoStudio.trustApprovedPreview',
                      'Host execution approved for Chrome preview & check'
                    )
                  : t(
                      'videoStudio.trustApprovalRequired',
                      'Execution approval required before Chrome check, preview, or render'
                    )}
            </span>
            {liveFingerprint ? (
              <span className="font-mono text-2xs opacity-80">
                {t('videoStudio.trustFingerprintPrefix', 'SHA-256: {{hash}}', {
                  hash: liveFingerprint.slice(0, 12)
                })}
              </span>
            ) : null}
          </div>
          {needsApproval ? (
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={inspector.busyAction !== null}
                className="min-h-11 @lg:min-h-8"
                onClick={() => void inspector.approveExecution('approved-preview', liveFingerprint)}
              >
                {t('videoStudio.approvePreview', 'Approve preview')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={inspector.busyAction !== null}
                className="min-h-11 @lg:min-h-8"
                onClick={() => void inspector.approveExecution('approved-render', liveFingerprint)}
              >
                {t('videoStudio.approveRender', 'Approve render')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {report ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant={validationBadgeVariant(report.status)}>
            {t('videoStudio.validationStatusLabel', 'Validation: {{status}}', {
              status: report.status ?? (report.passed ? 'passed' : 'failed')
            })}
          </Badge>
          {isStale ? (
            <Badge variant="warning">
              <AlertTriangle aria-hidden="true" className="size-3" />
              {t('videoStudio.validationStale', 'Stale check — inputs modified')}
            </Badge>
          ) : null}
          {report.skippedChecks && report.skippedChecks.length > 0 ? (
            <Badge variant="outline">
              {t('videoStudio.skippedChecksBadge', 'Skipped: {{list}}', {
                list: report.skippedChecks.join(', ')
              })}
            </Badge>
          ) : null}
          {report.productionGate && !report.productionGate.allowed ? (
            <span className="text-muted-foreground wrap-anywhere">
              {report.productionGate.blockingReasons.join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
