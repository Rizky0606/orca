import { AlertTriangle, Copy, Palette, RefreshCw, Save } from 'lucide-react'
import { useState } from 'react'
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
import { useTranslate } from '@/i18n/use-translate'
import type { StyleProfile } from '../../../../shared/video-studio/video-studio-style-contract'
import { VideoStudioMotionPresetsSection } from './VideoStudioMotionPresetsSection'
import { VideoStudioStyleTokenForm } from './VideoStudioStyleTokenForm'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

export function VideoStudioStyleMotionPanel({
  projectId,
  inspector
}: {
  projectId: string
  inspector: VideoStudioInspectorController
}) {
  const t = useTranslate()
  const styleState = inspector.styleState
  const profile = styleState?.profile ?? inspector.libraryStyles[0] ?? null
  const diff = inspector.styleDiff
  const hasDrift = Boolean(styleState?.markdownDrift || (diff && !diff.inSync))
  const busy = inspector.busyAction !== null

  const [selectedId, setSelectedId] = useState(profile?.id ?? 'technical-explainer-01')
  const [dupName, setDupName] = useState('')
  const [dupId, setDupId] = useState('')

  return (
    <section
      key={`${projectId}:${styleState?.revision ?? profile?.id ?? ''}`}
      className="grid min-w-0 gap-5 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Palette aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t('videoStudio.styleAndMotionTitle', 'Style Profile & Motion Inspector')}
          </h3>
          {profile ? (
            <Badge variant="outline">
              {t('videoStudio.styleProfileVersionBadge', '{{name}} · v{{version}} ({{tier}})', {
                name: profile.name,
                version: profile.version,
                tier: profile.tier
              })}
            </Badge>
          ) : null}
        </div>
        {profile?.provenance ? (
          <Badge variant="referenceLabel">
            {t('videoStudio.styleSourceBadge', 'From {{id}} v{{ver}}', {
              id: profile.provenance.sourceStyleId,
              ver: profile.provenance.sourceVersion
            })}
          </Badge>
        ) : null}
      </div>

      {hasDrift ? (
        <div
          role="status"
          className="grid gap-2 rounded border border-status-warning-border bg-status-warning-background p-3 text-xs text-status-warning-text"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
              {t(
                'videoStudio.markdownDriftBanner',
                'Markdown drift detected between style-profile.json and {{files}}',
                { files: styleState?.driftedFiles.join(', ') || 'frame.md' }
              )}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                className="min-h-11 @lg:min-h-8"
                onClick={() => void inspector.reconcileStyle('import-from-markdown', 'frame.md')}
              >
                {t('videoStudio.importMarkdownToJson', 'Import Markdown -> JSON')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                className="min-h-11 @lg:min-h-8"
                onClick={() => void inspector.reconcileStyle('reapply-json')}
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                {t('videoStudio.overwriteMarkdownWithJson', 'Sync JSON -> Markdown')}
              </Button>
            </div>
          </div>
          {diff?.diffs.map((entry) => (
            <p key={`${entry.file}:${entry.tokenPath}`} className="font-mono wrap-anywhere">
              {t(
                'videoStudio.styleDriftEntry',
                '{{file}} · {{tokenPath}}: JSON={{jsonValue}} vs MD={{markdownValue}}',
                {
                  file: entry.file,
                  tokenPath: entry.tokenPath,
                  jsonValue: JSON.stringify(entry.jsonValue),
                  markdownValue: JSON.stringify(entry.markdownValue)
                }
              )}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-3 @sm:grid-cols-12">
        <div className="grid min-w-0 gap-1.5 @sm:col-span-5">
          <Label htmlFor={`style-preset-${projectId}`}>
            {t('videoStudio.styleLibrarySelect', 'Preset or Host Library profile')}
          </Label>
          <Select value={selectedId} disabled={busy} onValueChange={setSelectedId}>
            <SelectTrigger id={`style-preset-${projectId}`} className="min-h-11 @lg:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {inspector.libraryStyles.map((item: StyleProfile) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.tier})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-2 @sm:col-span-7">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !selectedId}
            className="min-h-11 @lg:min-h-9"
            onClick={() => void inspector.applyStyle(selectedId)}
          >
            {t('videoStudio.applyStyleToProject', 'Apply to project')}
          </Button>
          {profile && profile.tier !== 'built-in' ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              className="min-h-11 @lg:min-h-9"
              onClick={() => void inspector.saveLibraryStyle(profile)}
            >
              <Save aria-hidden="true" className="size-3.5" />
              {t('videoStudio.saveStyleToLibrary', 'Save to Host Library')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-background p-2.5">
        <Input
          aria-label={t('videoStudio.duplicateStyleIdLabel', 'Duplicate ID')}
          placeholder={t('videoStudio.duplicateStyleIdPlaceholder', 'custom-explainer-01')}
          className="min-h-11 w-44 @lg:min-h-8"
          value={dupId}
          disabled={busy}
          onChange={(e) => setDupId(e.currentTarget.value)}
        />
        <Input
          aria-label={t('videoStudio.duplicateStyleNameLabel', 'Duplicate name')}
          placeholder={t('videoStudio.duplicateStyleNamePlaceholder', 'Custom Explainer')}
          className="min-h-11 flex-1 @lg:min-h-8"
          value={dupName}
          disabled={busy}
          onChange={(e) => setDupName(e.currentTarget.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !dupId.trim()}
          className="min-h-11 @lg:min-h-8"
          onClick={() =>
            void inspector.duplicateStyle(
              profile?.id ?? selectedId,
              dupId.trim(),
              dupName.trim() || undefined
            )
          }
        >
          <Copy aria-hidden="true" className="size-3.5" />
          {t('videoStudio.duplicateStyleButton', 'Duplicate to library')}
        </Button>
      </div>

      <VideoStudioStyleTokenForm
        projectId={projectId}
        profile={profile}
        busy={busy}
        onSave={inspector.updateStyleTokens}
      />

      <VideoStudioMotionPresetsSection presets={inspector.motionPresets} />
    </section>
  )
}
