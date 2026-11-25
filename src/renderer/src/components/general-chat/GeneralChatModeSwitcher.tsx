import { BookOpen, Globe, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { GeneralChatMode } from '../../../../shared/general-chat/general-chat-contract'

type ModeOption = {
  id: GeneralChatMode
  labelKey: string
  defaultLabel: string
  Icon: typeof Globe
}

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    id: 'normal',
    labelKey: 'generalChat.mode.normal',
    defaultLabel: 'Chat',
    Icon: BookOpen
  },
  {
    id: 'web-search',
    labelKey: 'generalChat.mode.webSearch',
    defaultLabel: 'Web Search',
    Icon: Globe
  },
  {
    id: 'deep-research',
    labelKey: 'generalChat.mode.deepResearch',
    defaultLabel: 'Deep Research',
    Icon: Sparkles
  }
]

export function GeneralChatModeSwitcher({
  mode,
  onModeChange,
  sourcesCount,
  activeResearchCount,
  openPanel,
  onTogglePanel
}: {
  mode: GeneralChatMode
  onModeChange: (mode: GeneralChatMode) => void
  sourcesCount: number
  activeResearchCount: number
  openPanel: 'sources' | 'research' | null
  onTogglePanel: (panel: 'sources' | 'research') => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1.5 @2xl:px-4">
      <div
        role="tablist"
        aria-label={t('generalChat.mode.ariaLabel', 'Chat mode')}
        className="inline-flex items-center rounded-md border border-border bg-muted p-0.5"
      >
        {MODE_OPTIONS.map(({ id, labelKey, defaultLabel, Icon }) => {
          const active = mode === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onModeChange(id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              <span>{t(labelKey, defaultLabel)}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="xs"
          variant={openPanel === 'sources' ? 'secondary' : 'ghost'}
          onClick={() => onTogglePanel('sources')}
        >
          <Globe aria-hidden="true" />
          <span>{t('generalChat.sources.button', 'Sources')}</span>
          {sourcesCount > 0 ? <Badge variant="secondary">{sourcesCount}</Badge> : null}
        </Button>

        <Button
          type="button"
          size="xs"
          variant={openPanel === 'research' ? 'secondary' : 'ghost'}
          onClick={() => onTogglePanel('research')}
        >
          <Sparkles aria-hidden="true" />
          <span>{t('generalChat.research.button', 'Research')}</span>
          {activeResearchCount > 0 ? (
            <Badge variant="secondary">{activeResearchCount}</Badge>
          ) : null}
        </Button>
      </div>
    </div>
  )
}
