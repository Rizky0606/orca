import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useTranslate } from '@/i18n/use-translate'
import type { MotionPresetMetadata } from '../../../../shared/video-studio/motion-registry-contract'

export function VideoStudioMotionPresetsSection({
  presets
}: {
  presets: readonly MotionPresetMetadata[]
}) {
  const t = useTranslate()
  return (
    <div className="grid min-w-0 gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Sparkles aria-hidden="true" className="size-3.5" />
          {t('videoStudio.universalMotionRegistry', 'Universal Motion Registry')}
        </h4>
        <span className="text-2xs text-muted-foreground">
          {t(
            'videoStudio.motionHonestyHint',
            'Knowledge-only presets guide AI authoring; only executable presets run automatically.'
          )}
        </span>
      </div>
      {presets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('videoStudio.noMotionPresets', 'No motion presets available.')}
        </p>
      ) : (
        <ul className="grid min-w-0 gap-2 @sm:grid-cols-2">
          {presets.map((preset) => {
            const hfStatus = preset.implementations.hyperframes?.status ?? preset.executionKind
            const badgeVariant =
              preset.executionKind === 'executable'
                ? 'secondary'
                : preset.executionKind === 'knowledge-only'
                  ? 'warning'
                  : 'comingSoon'
            const label =
              preset.executionKind === 'executable'
                ? t('videoStudio.motionExecutable', 'Executable')
                : preset.executionKind === 'knowledge-only'
                  ? t('videoStudio.motionKnowledgeOnly', 'Knowledge-only guidance')
                  : t('videoStudio.motionPlanned', 'Planned')
            return (
              <li
                key={preset.id}
                className="grid gap-1 rounded border border-border bg-background p-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-mono font-medium wrap-anywhere">{preset.id}</span>
                  <Badge variant={badgeVariant}>{label}</Badge>
                </div>
                <p className="text-2xs text-muted-foreground">
                  {preset.category} · v{preset.version} · hyperframes: {hfStatus}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
