import { AlertTriangle, ArrowDown, ArrowUp, Film, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
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
import type { VideoStudioCompositionDriftSummary } from '../../../../shared/video-studio/video-studio-rpc-contract'
import type { SceneStatus } from '../../../../shared/video-studio/video-studio-storyboard-contract'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

export function VideoStudioStoryboardPanel({
  projectId,
  inspector,
  drift
}: {
  projectId: string
  inspector: VideoStudioInspectorController
  drift?: VideoStudioCompositionDriftSummary
}) {
  const t = useTranslate()
  const docs = inspector.documents
  const frames = docs?.storyboard?.frames ?? []
  const [scriptText, setScriptText] = useState(docs?.scriptMarkdown ?? '')
  const [newTitle, setNewTitle] = useState('')
  const [newDuration, setNewDuration] = useState('4s')
  const [newVoiceover, setNewVoiceover] = useState('')
  const busy = inspector.busyAction !== null

  function moveFrame(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= frames.length) {
      return
    }
    const order = frames.map((f) => f.sceneId)
    const [moved] = order.splice(index, 1)
    if (moved) {
      order.splice(target, 0, moved)
      void inspector.reorderFrames(order)
    }
  }

  function handleAddFrame(event: FormEvent) {
    event.preventDefault()
    if (!newTitle.trim() || !newDuration.trim()) {
      return
    }
    void inspector
      .addFrame({
        title: newTitle.trim(),
        duration: newDuration.trim(),
        ...(newVoiceover.trim() ? { voiceover: newVoiceover.trim() } : {})
      })
      .then((ok) => {
        if (ok) {
          setNewTitle('')
          setNewVoiceover('')
        }
      })
  }

  return (
    <section className="grid min-w-0 gap-5 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Film aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t('videoStudio.storyboardAndScript', 'Storyboard & narration script')}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            {t('videoStudio.framesCount', '{{count}} frame(s)', { count: frames.length })}
          </Badge>
          {drift ? (
            <Badge variant={drift.inSync && !drift.hasWarnings ? 'secondary' : 'warning'}>
              {drift.inSync && !drift.hasWarnings ? (
                t('videoStudio.compositionInSync', 'In sync')
              ) : (
                <>
                  <AlertTriangle aria-hidden="true" className="size-3" />
                  {t('videoStudio.driftTiming', 'Drift ({{planned}}s vs {{actual}}s)', {
                    planned: drift.plannedTotalDurationSeconds,
                    actual: drift.actualTotalDurationSeconds
                  })}
                </>
              )}
            </Badge>
          ) : null}
        </div>
      </div>

      {drift && (!drift.inSync || drift.hasWarnings) ? (
        <div className="grid gap-1 rounded border border-status-warning-border bg-status-warning-background p-2.5 text-xs text-status-warning-text">
          {drift.unmountedScenes.length > 0 ? (
            <p className="wrap-anywhere">
              {t('videoStudio.unmountedScenes', 'Unmounted scenes in index.html: {{scenes}}', {
                scenes: drift.unmountedScenes.join(', ')
              })}
            </p>
          ) : null}
          {drift.missingFiles.length > 0 ? (
            <p className="wrap-anywhere">
              {t('videoStudio.missingSceneFiles', 'Missing files: {{files}}', {
                files: drift.missingFiles.join(', ')
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-2">
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {t('videoStudio.storyboardFramesHeading', 'STORYBOARD.md frames')}
        </h4>
        {frames.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('videoStudio.noStoryboardFrames', 'No storyboard frames defined yet.')}
          </p>
        ) : (
          <ul className="grid min-w-0 gap-2">
            {frames.map((frame, index) => (
              <li
                key={frame.sceneId}
                className="grid min-w-0 gap-2 rounded border border-border bg-background p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-muted-foreground">
                      {t('videoStudio.framePrefix', 'Frame {{num}}', { num: frame.frameNumber })}
                    </span>
                    <span className="font-semibold wrap-anywhere">{frame.title}</span>
                    <Badge variant="outline">{String(frame.duration)}</Badge>
                    <Badge variant="outline">{frame.sceneId}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select
                      value={frame.status}
                      disabled={busy}
                      onValueChange={(next) => {
                        if (next === 'outline' || next === 'built' || next === 'animated') {
                          void inspector.patchFrame(frame.sceneId, { status: next as SceneStatus })
                        }
                      }}
                    >
                      <SelectTrigger size="sm" className="min-h-11 w-28 @lg:min-h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="outline">outline</SelectItem>
                        <SelectItem value="built">built</SelectItem>
                        <SelectItem value="animated">animated</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || index === 0}
                      aria-label={t('videoStudio.moveFrameUp', 'Move frame up')}
                      className="min-h-11 @lg:min-h-8"
                      onClick={() => moveFrame(index, -1)}
                    >
                      <ArrowUp aria-hidden="true" className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || index === frames.length - 1}
                      aria-label={t('videoStudio.moveFrameDown', 'Move frame down')}
                      className="min-h-11 @lg:min-h-8"
                      onClick={() => moveFrame(index, 1)}
                    >
                      <ArrowDown aria-hidden="true" className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={t('videoStudio.deleteFrame', 'Delete frame')}
                      className="min-h-11 @lg:min-h-8"
                      onClick={() => void inspector.deleteFrame(frame.sceneId)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-muted-foreground">
                  {frame.src ? <span className="font-mono">{frame.src}</span> : null}
                  {frame.camera ? <span>· {frame.camera}</span> : null}
                  {frame.assets.length > 0 ? (
                    <span>
                      ·{' '}
                      {t('videoStudio.frameAssets', 'Assets: {{list}}', {
                        list: frame.assets.join(', ')
                      })}
                    </span>
                  ) : null}
                  {frame.motionPresets.length > 0 ? (
                    <span>
                      ·{' '}
                      {t('videoStudio.frameMotion', 'Motion: {{list}}', {
                        list: frame.motionPresets.join(', ')
                      })}
                    </span>
                  ) : null}
                </div>
                {frame.voiceover ? (
                  <p className="text-muted-foreground wrap-anywhere">“{frame.voiceover}”</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddFrame} className="flex flex-wrap items-center gap-2 pt-1">
          <Input
            aria-label={t('videoStudio.newFrameTitle', 'New frame title')}
            placeholder={t(
              'videoStudio.newFrameTitlePlaceholder',
              'New frame title (e.g. Fan airflow)'
            )}
            className="min-h-11 min-w-40 flex-1 @lg:min-h-9"
            value={newTitle}
            disabled={busy}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
          />
          <Input
            aria-label={t('videoStudio.newFrameDuration', 'Duration')}
            placeholder="4s"
            className="min-h-11 w-20 shrink-0 @lg:min-h-9"
            value={newDuration}
            disabled={busy}
            onChange={(e) => setNewDuration(e.currentTarget.value)}
          />
          <Input
            aria-label={t('videoStudio.newFrameVoiceover', 'Voiceover')}
            placeholder={t('videoStudio.newFrameVoiceoverPlaceholder', 'Voiceover line (optional)')}
            className="min-h-11 min-w-40 flex-1 @lg:min-h-9"
            value={newVoiceover}
            disabled={busy}
            onChange={(e) => setNewVoiceover(e.currentTarget.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={busy || !newTitle.trim()}
            className="min-h-11 shrink-0 @lg:min-h-9"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            {t('videoStudio.addFrame', 'Add frame')}
          </Button>
        </form>
      </div>

      <div className="grid min-w-0 gap-2 border-t border-border pt-4">
        <Label htmlFor={`script-md-${projectId}`}>
          {t('videoStudio.scriptMarkdownLabel', 'SCRIPT.md narration')}
        </Label>
        <Textarea
          id={`script-md-${projectId}`}
          rows={5}
          className="font-mono text-xs"
          value={scriptText}
          disabled={busy}
          onChange={(e) => setScriptText(e.currentTarget.value)}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className="min-h-11 @lg:min-h-8"
            onClick={() => void inspector.updateScript(scriptText)}
          >
            {t('videoStudio.saveScript', 'Save script')}
          </Button>
        </div>
      </div>
    </section>
  )
}
