import { Clapperboard, Plus } from 'lucide-react'
import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { VideoStudioProject } from '../../../../shared/video-studio/video-studio-project'
import { useVideoStudioStages } from './VideoStudioWorkflow'

export function VideoStudioProjectList({
  projects,
  selectedId,
  onSelect,
  onCreate,
  createRef,
  busy,
  className
}: {
  projects: readonly VideoStudioProject[]
  selectedId: string | null
  onSelect: (id: string, trigger: HTMLButtonElement) => void
  onCreate: () => void
  createRef: Ref<HTMLButtonElement>
  busy: boolean
  className?: string
}) {
  const t = useTranslate()
  const stages = useVideoStudioStages()
  const label = t('videoStudio.projects', 'Projects')
  return (
    <aside
      aria-label={label}
      className={cn(
        'flex min-h-0 min-w-0 flex-col @lg:w-60 @lg:shrink-0 @lg:border-r @lg:border-border',
        className
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 p-3">
        <Button
          type="button"
          ref={createRef}
          disabled={busy}
          onClick={onCreate}
          className="min-h-11 @lg:min-h-9"
        >
          <Plus aria-hidden="true" />
          {t('videoStudio.newProject', 'New project')}
        </Button>
        <h2 className="px-2 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </h2>
      </div>
      <div className="scrollbar-sleek min-h-0 overflow-y-auto px-3 pb-3">
        {projects.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">
            {t('videoStudio.noProjects', 'No video projects on this computer.')}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((project) => {
              const selected = selectedId === project.id
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    data-current={selected ? 'true' : undefined}
                    disabled={busy}
                    onClick={(event) => onSelect(project.id, event.currentTarget)}
                    className={cn(
                      'flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50',
                      selected && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <Clapperboard
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm">{project.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t('videoStudio.projectSummary', '{{stage}} · {{ratio}}', {
                          stage: stages[project.workflowStage],
                          ratio: project.aspectRatio
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
