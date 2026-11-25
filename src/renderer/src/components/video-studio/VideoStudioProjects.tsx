import { ArrowLeft } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { VideoStudioProductionPanel } from './VideoStudioProductionPanel'
import { VideoStudioProjectForm } from './VideoStudioProjectForm'
import { VideoStudioProjectList } from './VideoStudioProjectList'
import type { useVideoStudioController } from './use-video-studio-controller'
import type { VideoStudioProductionController } from './use-video-studio-production'

export function VideoStudioProjects({
  controller,
  production
}: {
  controller: ReturnType<typeof useVideoStudioController>
  production?: VideoStudioProductionController
}) {
  const t = useTranslate()
  const { snapshot, loading, saving, error, projectId } = controller
  const [pane, setPane] = useState<'list' | 'detail' | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const createButton = useRef<HTMLButtonElement>(null)
  const invokingRow = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const deleted = useRef(false)
  const detailTitleId = useId()
  const project = snapshot?.projects.find(({ id }) => id === projectId)
  const editing = creating || project !== undefined
  const detail = editing && pane !== 'list'

  function focusDetail() {
    requestAnimationFrame(() => heading.current?.focus())
  }

  function showList() {
    setPane('list')
    requestAnimationFrame(() => {
      const row = invokingRow.current
      if (row?.isConnected && !row.disabled) {
        row.focus()
      } else {
        createButton.current?.focus()
      }
    })
  }

  if (!snapshot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoadingSpinner className="size-4" />
            {t('videoStudio.loadingProjects', 'Loading projects…')}
          </p>
        ) : (
          <>
            {error ? (
              <p role="alert" className="max-w-sm text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 @lg:min-h-9"
              onClick={controller.retry}
            >
              {t('videoStudio.retry', 'Retry')}
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" aria-busy={loading || saving}>
      {snapshot.invalidRecords > 0 ? (
        <p
          role="status"
          className="border-b border-border bg-card px-4 py-2 text-sm text-card-foreground"
        >
          {t(
            'videoStudio.invalidRecordsWarning',
            'Some project records could not be loaded ({{count}}). They remain in the catalog.',
            { count: snapshot.invalidRecords }
          )}
        </p>
      ) : null}
      {error && !confirmDelete ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <p role="alert" className="min-w-0 flex-1 text-sm text-destructive wrap-anywhere">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 @lg:min-h-8"
            disabled={loading || saving}
            onClick={controller.retry}
          >
            {t('videoStudio.reload', 'Reload projects')}
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <VideoStudioProjectList
          className={cn('w-full @lg:flex', detail && 'hidden')}
          projects={snapshot.projects}
          selectedId={creating ? null : projectId}
          busy={loading || saving}
          createRef={createButton}
          onCreate={() => {
            invokingRow.current = null
            setCreating(true)
            setPane('detail')
            focusDetail()
          }}
          onSelect={(id, trigger) => {
            invokingRow.current = trigger
            setCreating(false)
            controller.selectProject(id)
            setPane('detail')
            focusDetail()
          }}
        />
        <section
          aria-labelledby={detailTitleId}
          className={cn(
            'scrollbar-sleek min-w-0 flex-1 overflow-y-auto @lg:block',
            !detail && 'hidden'
          )}
        >
          {editing ? (
            <div className="mx-auto grid w-full max-w-2xl min-w-0 gap-5 p-4 @lg:p-6">
              <div className="grid min-w-0 gap-2">
                <div className="@lg:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={showList}
                    disabled={saving}
                  >
                    <ArrowLeft aria-hidden="true" />
                    {t('videoStudio.backToProjects', 'Back to projects')}
                  </Button>
                </div>
                <h2
                  ref={heading}
                  tabIndex={-1}
                  id={detailTitleId}
                  className="text-lg font-semibold wrap-anywhere"
                >
                  {creating ? t('videoStudio.newProject', 'New project') : project?.title}
                </h2>
              </div>
              {!creating && project && project.workflowStage === 'production' && production ? (
                <VideoStudioProductionPanel project={project} production={production} />
              ) : null}
              <VideoStudioProjectForm
                key={creating ? 'new' : `${project?.id}:${project?.updatedAt}`}
                project={creating ? undefined : project}
                busy={loading || saving}
                production={production}
                onSave={(fields) => {
                  void controller.saveProject(creating ? null : projectId, fields).then((saved) => {
                    if (saved) {
                      setCreating(false)
                      focusDetail()
                    }
                  })
                }}
                onCancel={() => {
                  setCreating(false)
                  showList()
                }}
                onDelete={(trigger) => {
                  deleteButton.current = trigger
                  deleted.current = false
                  setConfirmDelete(true)
                }}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <h2 id={detailTitleId} className="text-sm font-semibold">
                {snapshot.projects.length > 0
                  ? t('videoStudio.selectProject', 'Select a project')
                  : t('videoStudio.startProject', 'Create a video project')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {snapshot.projects.length > 0
                  ? t(
                      'videoStudio.selectProjectDescription',
                      'Review its brief or update its workflow stage.'
                    )
                  : t(
                      'videoStudio.startProjectDescription',
                      'Save a brief and track it from Research to Production.'
                    )}
              </p>
            </div>
          )}
        </section>
      </div>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          size="confirm"
          initialFocus="cancel"
          busy={saving}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const next = deleted.current ? createButton.current : deleteButton.current
            next?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('videoStudio.confirmDeleteTitle', 'Delete project?')}</DialogTitle>
            <DialogDescription>
              {t(
                'videoStudio.confirmDeleteDescription',
                '“{{title}}” will be removed from this computer.',
                { title: project?.title ?? '' }
              )}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11!"
                data-dialog-cancel
                disabled={saving}
              >
                {t('videoStudio.cancel', 'Cancel')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11!"
              disabled={saving}
              onClick={() => {
                if (project) {
                  void controller.deleteProject(project.id).then((removed) => {
                    if (removed) {
                      deleted.current = true
                      setPane('list')
                      setConfirmDelete(false)
                    }
                  })
                }
              }}
            >
              {t('videoStudio.deleteProject', 'Delete project')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
