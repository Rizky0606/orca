import { useState, type FormEvent } from 'react'
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
import type {
  StyleCamera,
  StyleMotion,
  StyleProfile,
  StyleProfileTokensPatch,
  StyleSubtitle,
  StyleTypography
} from '../../../../shared/video-studio/video-studio-style-contract'

export function VideoStudioStyleTokenForm({
  projectId,
  profile,
  busy,
  onSave
}: {
  projectId: string
  profile: StyleProfile | null
  busy: boolean
  onSave: (tokens: StyleProfileTokensPatch) => Promise<boolean>
}) {
  const t = useTranslate()
  const [background, setBackground] = useState(profile?.visual.palette.background ?? '#F7F3E9')
  const [surface, setSurface] = useState(profile?.visual.palette.surface ?? '#EFE7D6')
  const [primaryText, setPrimaryText] = useState(profile?.visual.palette.primaryText ?? '#1E242B')
  const [accentPrimary, setAccentPrimary] = useState(
    profile?.visual.palette.accentPrimary ?? '#2563EB'
  )
  const [highlight, setHighlight] = useState(profile?.visual.palette.highlight ?? '#FACC15')
  const [renderingStyle, setRenderingStyle] = useState(
    profile?.visual.renderingStyle ?? '2.5d-semi-realistic'
  )
  const [displayFont, setDisplayFont] = useState(profile?.typography.displayFont ?? 'Space Grotesk')
  const [bodyFont, setBodyFont] = useState(profile?.typography.bodyFont ?? 'Inter')
  const [headingScale, setHeadingScale] = useState<StyleTypography['headingScale']>(
    profile?.typography.headingScale ?? 'balanced'
  )
  const [projection, setProjection] = useState<StyleCamera['projection']>(
    profile?.camera.projection ?? 'orthographic'
  )
  const [pacing, setPacing] = useState<StyleMotion['pacing']>(profile?.motion.pacing ?? 'snappy')
  const [defaultEasing, setDefaultEasing] = useState(
    profile?.motion.defaultEasing ?? 'cubic-bezier(0.22, 1, 0.36, 1)'
  )
  const [allowedEffects, setAllowedEffects] = useState(
    profile?.effects.allowedEffects.join(', ') ?? ''
  )
  const [actionSafePercent, setActionSafePercent] = useState(
    String(profile?.composition.actionSafePercent ?? 90)
  )
  const [subtitleMode, setSubtitleMode] = useState<StyleSubtitle['mode']>(
    profile?.subtitle.mode ?? 'word-highlight'
  )
  const [openMotionId, setOpenMotionId] = useState(profile?.openMotionPackageRef?.packageId ?? '')
  const [openMotionVersion, setOpenMotionVersion] = useState(
    profile?.openMotionPackageRef?.version ?? ''
  )

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void onSave({
      visual: {
        palette: { background, surface, primaryText, accentPrimary, highlight },
        renderingStyle
      },
      typography: { displayFont, bodyFont, headingScale },
      camera: { projection },
      motion: { pacing, defaultEasing },
      effects: {
        allowedEffects: allowedEffects
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      },
      composition: { actionSafePercent: Number(actionSafePercent) || 90 },
      subtitle: { mode: subtitleMode },
      openMotionPackageRef:
        openMotionId.trim() && openMotionVersion.trim()
          ? { packageId: openMotionId.trim(), version: openMotionVersion.trim() }
          : null
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid min-w-0 gap-3 border-t border-border pt-4">
      <div className="grid min-w-0 gap-3 @sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor={`st-bg-${projectId}`}>
            {t('videoStudio.tokenBackground', 'Background')}
          </Label>
          <Input
            id={`st-bg-${projectId}`}
            variant="code"
            className="min-h-11 @lg:min-h-9"
            value={background}
            disabled={busy}
            onChange={(e) => setBackground(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-surface-${projectId}`}>
            {t('videoStudio.tokenSurface', 'Surface')}
          </Label>
          <Input
            id={`st-surface-${projectId}`}
            variant="code"
            className="min-h-11 @lg:min-h-9"
            value={surface}
            disabled={busy}
            onChange={(e) => setSurface(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-ink-${projectId}`}>
            {t('videoStudio.tokenPrimaryText', 'Primary ink')}
          </Label>
          <Input
            id={`st-ink-${projectId}`}
            variant="code"
            className="min-h-11 @lg:min-h-9"
            value={primaryText}
            disabled={busy}
            onChange={(e) => setPrimaryText(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-acc-${projectId}`}>
            {t('videoStudio.tokenAccent', 'Accent primary')}
          </Label>
          <Input
            id={`st-acc-${projectId}`}
            variant="code"
            className="min-h-11 @lg:min-h-9"
            value={accentPrimary}
            disabled={busy}
            onChange={(e) => setAccentPrimary(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-hi-${projectId}`}>
            {t('videoStudio.tokenHighlight', 'Highlight')}
          </Label>
          <Input
            id={`st-hi-${projectId}`}
            variant="code"
            className="min-h-11 @lg:min-h-9"
            value={highlight}
            disabled={busy}
            onChange={(e) => setHighlight(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-render-${projectId}`}>
            {t('videoStudio.tokenRenderStyle', 'Rendering style')}
          </Label>
          <Input
            id={`st-render-${projectId}`}
            className="min-h-11 @lg:min-h-9"
            value={renderingStyle}
            disabled={busy}
            onChange={(e) => setRenderingStyle(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-3 @sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor={`st-dfont-${projectId}`}>
            {t('videoStudio.tokenDisplayFont', 'Display font')}
          </Label>
          <Input
            id={`st-dfont-${projectId}`}
            className="min-h-11 @lg:min-h-9"
            value={displayFont}
            disabled={busy}
            onChange={(e) => setDisplayFont(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-bfont-${projectId}`}>
            {t('videoStudio.tokenBodyFont', 'Body font')}
          </Label>
          <Input
            id={`st-bfont-${projectId}`}
            className="min-h-11 @lg:min-h-9"
            value={bodyFont}
            disabled={busy}
            onChange={(e) => setBodyFont(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label>{t('videoStudio.tokenHeadingScale', 'Heading scale')}</Label>
          <Select
            value={headingScale}
            disabled={busy}
            onValueChange={(v) => {
              if (v === 'compact' || v === 'balanced' || v === 'poster') {
                setHeadingScale(v)
              }
            }}
          >
            <SelectTrigger className="min-h-11 @lg:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="compact">
                {t('videoStudio.headingScaleCompact', 'compact')}
              </SelectItem>
              <SelectItem value="balanced">
                {t('videoStudio.headingScaleBalanced', 'balanced')}
              </SelectItem>
              <SelectItem value="poster">
                {t('videoStudio.headingScalePoster', 'poster')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('videoStudio.tokenProjection', 'Camera projection')}</Label>
          <Select
            value={projection}
            disabled={busy}
            onValueChange={(v) => {
              if (v === 'orthographic' || v === '2.5d' || v === '2d-flat' || v === 'perspective') {
                setProjection(v)
              }
            }}
          >
            <SelectTrigger className="min-h-11 @lg:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="orthographic">
                {t('videoStudio.projectionOrthographic', 'orthographic')}
              </SelectItem>
              <SelectItem value="2.5d">{t('videoStudio.projection25d', '2.5d')}</SelectItem>
              <SelectItem value="2d-flat">
                {t('videoStudio.projection2dFlat', '2d-flat')}
              </SelectItem>
              <SelectItem value="perspective">
                {t('videoStudio.projectionPerspective', 'perspective')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('videoStudio.tokenPacing', 'Motion pacing')}</Label>
          <Select
            value={pacing}
            disabled={busy}
            onValueChange={(v) => {
              if (v === 'snappy' || v === 'measured' || v === 'calm' || v === 'energetic') {
                setPacing(v)
              }
            }}
          >
            <SelectTrigger className="min-h-11 @lg:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="snappy">{t('videoStudio.pacingSnappy', 'snappy')}</SelectItem>
              <SelectItem value="measured">
                {t('videoStudio.pacingMeasured', 'measured')}
              </SelectItem>
              <SelectItem value="calm">{t('videoStudio.pacingCalm', 'calm')}</SelectItem>
              <SelectItem value="energetic">
                {t('videoStudio.pacingEnergetic', 'energetic')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('videoStudio.tokenSubtitleMode', 'Subtitle mode')}</Label>
          <Select
            value={subtitleMode}
            disabled={busy}
            onValueChange={(v) => {
              if (v === 'word-highlight' || v === 'anchor-rail' || v === 'none') {
                setSubtitleMode(v)
              }
            }}
          >
            <SelectTrigger className="min-h-11 @lg:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="word-highlight">
                {t('videoStudio.subtitleModeWordHighlight', 'word-highlight')}
              </SelectItem>
              <SelectItem value="anchor-rail">
                {t('videoStudio.subtitleModeAnchorRail', 'anchor-rail')}
              </SelectItem>
              <SelectItem value="none">{t('videoStudio.subtitleModeNone', 'none')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 @sm:grid-cols-4">
        <div className="grid gap-1 @sm:col-span-2">
          <Label htmlFor={`st-eff-${projectId}`}>
            {t('videoStudio.tokenEffects', 'Allowed effects')}
          </Label>
          <Input
            id={`st-eff-${projectId}`}
            className="min-h-11 @lg:min-h-9"
            value={allowedEffects}
            disabled={busy}
            onChange={(e) => setAllowedEffects(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-ease-${projectId}`}>
            {t('videoStudio.tokenEasing', 'Default easing')}
          </Label>
          <Input
            id={`st-ease-${projectId}`}
            variant="code"
            className="min-h-11 @lg:min-h-9"
            value={defaultEasing}
            disabled={busy}
            onChange={(e) => setDefaultEasing(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-safe-${projectId}`}>
            {t('videoStudio.tokenActionSafe', 'Action safe (%)')}
          </Label>
          <Input
            id={`st-safe-${projectId}`}
            type="number"
            className="min-h-11 @lg:min-h-9"
            value={actionSafePercent}
            disabled={busy}
            onChange={(e) => setActionSafePercent(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-3 @sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`st-omid-${projectId}`}>
            {t('videoStudio.openMotionPackageId', 'OpenMotion package ID (planned)')}
          </Label>
          <Input
            id={`st-omid-${projectId}`}
            variant="code"
            placeholder={t('videoStudio.openMotionPackageIdPlaceholder', 'optional-openmotion-pkg')}
            className="min-h-11 @lg:min-h-9"
            value={openMotionId}
            disabled={busy}
            onChange={(e) => setOpenMotionId(e.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`st-omver-${projectId}`}>
            {t('videoStudio.openMotionVersion', 'OpenMotion version')}
          </Label>
          <Input
            id={`st-omver-${projectId}`}
            variant="code"
            placeholder="1.0.0"
            className="min-h-11 @lg:min-h-9"
            value={openMotionVersion}
            disabled={busy}
            onChange={(e) => setOpenMotionVersion(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy} className="min-h-11 @lg:min-h-8">
          {t('videoStudio.saveStyleTokens', 'Save style tokens')}
        </Button>
      </div>
    </form>
  )
}
