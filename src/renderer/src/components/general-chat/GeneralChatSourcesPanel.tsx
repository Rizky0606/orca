import { useState } from 'react'
import { ExternalLink, Globe, Search, Trash2, Video, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslate } from '@/i18n/use-translate'
import type { GeneralChatSource } from '../../../../shared/general-chat/general-chat-contract'

export function GeneralChatSourcesPanel({
  sources,
  searching,
  busyAction,
  error,
  onSearch,
  onDeleteSource,
  onClearSources,
  onHandoffToVideoStudio,
  onClose
}: {
  sources: readonly GeneralChatSource[]
  searching: boolean
  busyAction: string | null
  error: string | null
  onSearch: (query: string) => Promise<void>
  onDeleteSource: (sourceId: string) => Promise<void>
  onClearSources: () => Promise<void>
  onHandoffToVideoStudio: () => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [query, setQuery] = useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed || searching) {
      return
    }
    void onSearch(trimmed)
  }

  return (
    <section
      aria-label={t('generalChat.sources.panelTitle', 'Web Search Sources')}
      className="shrink-0 border-b border-border bg-card px-3 py-3 @2xl:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <Globe aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold">
            {t('generalChat.sources.heading', 'Verified Web Sources ({{count}})', {
              count: sources.length
            })}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {sources.length > 0 ? (
            <>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void onHandoffToVideoStudio()}
              >
                <Video aria-hidden="true" />
                <span>{t('generalChat.handoff.createVideo', 'Send to Video Studio')}</span>
              </Button>
              <Button
                type="button"
                size="xs"
                variant="muted-field-icon"
                disabled={busyAction !== null}
                onClick={() => void onClearSources()}
              >
                {t('generalChat.sources.clear', 'Clear')}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t('common.close', 'Close')}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mb-2.5 flex items-center gap-2">
        <Input
          density="compact"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={searching}
          placeholder={t(
            'generalChat.sources.searchPlaceholder',
            'Search the web (DuckDuckGo built-in, or configured API keys)…'
          )}
        />
        <Button type="submit" size="xs" variant="secondary" disabled={searching || !query.trim()}>
          <Search aria-hidden="true" />
          <span>
            {searching
              ? t('generalChat.sources.searching', 'Searching…')
              : t('generalChat.sources.searchAction', 'Search')}
          </span>
        </Button>
      </form>

      {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}

      {sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            'generalChat.sources.empty',
            'Switch to Web Search mode or run a query above to ground answers in cited web sources.'
          )}
        </p>
      ) : (
        <div className="scrollbar-sleek grid max-h-52 gap-2 overflow-y-auto @2xl:grid-cols-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex flex-col justify-between gap-1.5 rounded-md border border-border bg-background p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="line-clamp-1 flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                >
                  <span className="truncate">{source.title}</span>
                  <ExternalLink
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground"
                  />
                </a>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="muted-field-icon"
                  aria-label={t('generalChat.sources.remove', 'Remove source')}
                  onClick={() => void onDeleteSource(source.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {source.extractedText || source.snippet}
              </p>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{source.domain}</span>
                <Badge variant="outline">{source.provider}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
