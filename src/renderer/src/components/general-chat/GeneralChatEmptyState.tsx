import { CircleAlert, MessageSquare } from 'lucide-react'
import type { ReactNode } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { cn } from '@/lib/class-names'

export function GeneralChatEmptyState({
  title,
  description,
  state = 'empty',
  action,
  className
}: {
  title: string
  description?: string
  state?: 'empty' | 'working' | 'error'
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center',
        className
      )}
    >
      <div
        role={state === 'error' ? 'alert' : state === 'working' ? 'status' : undefined}
        className="flex max-w-sm flex-col items-center gap-2"
      >
        <div className="mb-1 flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground">
          {state === 'working' ? (
            <LoadingSpinner className="size-4" />
          ) : state === 'error' ? (
            <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
          ) : (
            <MessageSquare aria-hidden="true" className="size-4" />
          )}
        </div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground wrap-anywhere">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
