import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { GeneralChatConversation } from './use-general-chat-controller'

export function GeneralChatConversationList({
  conversations,
  selectedSessionId,
  onSelect
}: {
  conversations: readonly GeneralChatConversation[]
  selectedSessionId?: string
  onSelect: (sessionId: string, button: HTMLButtonElement) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  if (conversations.length === 0) {
    return null
  }
  const label = t('generalChat.recentConversations', 'Recent conversations')
  return (
    <nav aria-label={label} className="scrollbar-sleek min-h-0 overflow-y-auto px-3 pb-3">
      <h2 className="px-2 py-2 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </h2>
      <ul className="space-y-0.5">
        {conversations.map(({ sessionId, title }) => {
          const current = sessionId === selectedSessionId
          return (
            <li key={sessionId}>
              <Button
                type="button"
                variant="ghost-inset"
                aria-current={current ? 'true' : undefined}
                data-current={current ? 'true' : undefined}
                className={cn(
                  'w-full min-w-0 justify-start px-2 text-sm font-normal motion-reduce:transition-none',
                  current && 'bg-accent text-accent-foreground'
                )}
                onClick={(event) => onSelect(sessionId, event.currentTarget)}
              >
                <MessageSquare aria-hidden="true" className="text-muted-foreground" />
                <span className="truncate">{title}</span>
              </Button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
