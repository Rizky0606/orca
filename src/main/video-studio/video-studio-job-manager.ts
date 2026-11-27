import type {
  VideoStudioProject,
  VideoStudioRenderQuality
} from '../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCompositionState,
  VideoStudioEngineStatus,
  VideoStudioJobsEvent,
  VideoStudioPreviewState,
  VideoStudioProjectFilesChangedEvent,
  VideoStudioRenderJobSnapshot
} from '../../shared/video-studio/video-studio-rpc-contract'
import type { VideoEngineCheckResult } from '../../shared/video-studio/video-studio-validation-contract'
import { createRevisionClock, type RevisionClock } from '../runtime/events/revisioned-state'
import { createHostVideoEngineDeps } from './engines/host-video-engine-deps'
import type { VideoEngineProcessDeps } from './engines/video-render-engine'
import {
  getVideoRenderEngineAdapter,
  probeAllVideoRenderEngines
} from './engines/video-render-engine-registry'
import { openVideoStudioCatalog, type VideoStudioCatalog } from './video-studio-catalog'
import { resolveVideoStudioProjectDir } from './video-studio-composition-paths'
import {
  ensureProjectScaffoldReady,
  refreshStaleCheckOnExternalEdit,
  runVerifiedProjectCheck,
  startVerifiedProjectPreview,
  startVerifiedProjectRender
} from './video-studio-execution-tasks'
import {
  createVideoStudioHostServices,
  type VideoStudioHostServices
} from './video-studio-host-services'
import {
  ACTIVE_JOB_STATUSES,
  projectVideoStudioJobsEvent,
  type ActiveJobEntry
} from './video-studio-job-state'
import type { PreviewOsControl } from './video-studio-preview-manager'
import {
  disposeVideoStudioJobResources,
  refreshVideoStudioCompositionState,
  scaffoldProjectWithBaselineTrust
} from './video-studio-project-execution'

export type VideoStudioJobManagerOptions = {
  catalog?: VideoStudioCatalog
  engineDeps?: VideoEngineProcessDeps
  probeEngines?: (deps: VideoEngineProcessDeps) => Promise<VideoStudioEngineStatus[]>
  getAdapter?: typeof getVideoRenderEngineAdapter
  previewOsControl?: PreviewOsControl
  watcherDebounceMs?: number
  beforeExecutionSpawn?: (projectId: string, projectDir: string) => Promise<void>
}

export class VideoStudioJobManager {
  readonly revisions: RevisionClock = createRevisionClock()
  private readonly services: VideoStudioHostServices
  private readonly jobs = new Map<string, ActiveJobEntry>()
  private readonly lastChecks = new Map<string, VideoEngineCheckResult>()
  private readonly listeners = new Set<() => void>()
  private readonly engineDeps: VideoEngineProcessDeps
  private readonly probeAll: (deps: VideoEngineProcessDeps) => Promise<VideoStudioEngineStatus[]>
  private readonly getAdapter: typeof getVideoRenderEngineAdapter
  private readonly unwatchFilesListener: () => void
  private catalogPromise: Promise<VideoStudioCatalog> | null = null
  private lastEngines: VideoStudioEngineStatus[] | undefined
  private disposed = false

  constructor(
    private readonly profileDir: string,
    private readonly options: VideoStudioJobManagerOptions = {}
  ) {
    this.engineDeps = options.engineDeps ?? createHostVideoEngineDeps()
    this.probeAll = options.probeEngines ?? probeAllVideoRenderEngines
    this.getAdapter = options.getAdapter ?? getVideoRenderEngineAdapter
    this.services = createVideoStudioHostServices(profileDir, options)
    this.unwatchFilesListener = this.services.watcher.subscribe((event) => {
      void refreshStaleCheckOnExternalEdit({
        profileDir: this.profileDir,
        projectId: event.projectId,
        lastChecks: this.lastChecks,
        jobs: this.jobs,
        notify: () => this.notify()
      })
    })
  }

  get locks() {
    return this.services.locks
  }
  get watcher() {
    return this.services.watcher
  }
  get tx() {
    return this.services.tx
  }
  get trustStore() {
    return this.services.trustStore
  }
  get previewManager() {
    return this.services.previewManager
  }
  get styleStore() {
    return this.services.styleStore
  }
  get documents() {
    return this.services.documents
  }
  get assets() {
    return this.services.assets
  }

  private getCatalog(): Promise<VideoStudioCatalog> {
    if (this.options.catalog) {
      return Promise.resolve(this.options.catalog)
    }
    this.catalogPromise ??= openVideoStudioCatalog(this.profileDir)
    return this.catalogPromise
  }

  private notify(): void {
    this.revisions.next()
    for (const listener of this.listeners) {
      listener()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeFilesChanged(
    listener: (event: VideoStudioProjectFilesChangedEvent) => void
  ): () => void {
    return this.services.watcher.subscribe(listener)
  }

  async watchProject(projectId: string): Promise<void> {
    if (!this.disposed) {
      await this.services.watcher.watchProject(
        projectId,
        resolveVideoStudioProjectDir(this.profileDir, projectId)
      )
    }
  }

  async unwatchProject(projectId: string): Promise<void> {
    await this.services.watcher.unwatchProject(projectId)
  }

  getJobSnapshot(projectId: string): VideoStudioRenderJobSnapshot | null {
    return this.jobs.get(projectId)?.snapshot ?? null
  }

  listSnapshots(projectIdFilter?: string): VideoStudioJobsEvent {
    return projectVideoStudioJobsEvent({
      jobs: this.jobs,
      previews: this.services.previewManager.listActivePreviewStates(),
      engines: this.lastEngines,
      revision: this.revisions.next(),
      projectIdFilter
    })
  }

  getPreviewState(projectId: string): VideoStudioPreviewState {
    return this.services.previewManager.getPreviewState(projectId)
  }

  async probeEngines(): Promise<VideoStudioEngineStatus[]> {
    const engines = await this.probeAll(this.engineDeps)
    this.lastEngines = engines
    this.notify()
    return engines
  }

  getCompositionState(projectId: string): Promise<VideoStudioCompositionState> {
    return refreshVideoStudioCompositionState({
      projectId,
      projectDir: resolveVideoStudioProjectDir(this.profileDir, projectId),
      previewState: this.getPreviewState(projectId),
      lastChecks: this.lastChecks,
      jobs: this.jobs
    })
  }

  scaffoldComposition(
    project: VideoStudioProject,
    options?: { overwrite?: boolean; styleProfileId?: string }
  ): Promise<VideoStudioCompositionState> {
    if (project.engine === 'remotion') {
      throw new Error('video_studio_engine_unavailable')
    }
    return scaffoldProjectWithBaselineTrust({
      projectDir: resolveVideoStudioProjectDir(this.profileDir, project.id),
      project,
      adapter: this.getAdapter(project.engine),
      styleStore: this.services.styleStore,
      trustStore: this.services.trustStore,
      watcher: this.services.watcher,
      previewState: this.getPreviewState(project.id),
      options
    })
  }

  async runCheck(
    project: VideoStudioProject,
    options?: { browser?: boolean }
  ): Promise<VideoEngineCheckResult> {
    const projectDir = await this.ensureScaffoldReady(project, true)
    return runVerifiedProjectCheck({
      project,
      projectDir,
      adapter: this.getAdapter(project.engine),
      engineDeps: this.engineDeps,
      trustStore: this.services.trustStore,
      browser: options?.browser,
      beforeExecutionSpawn: this.options.beforeExecutionSpawn,
      jobs: this.jobs,
      lastChecks: this.lastChecks,
      notify: () => this.notify()
    })
  }

  async startRender(
    project: VideoStudioProject,
    quality: VideoStudioRenderQuality,
    options?: { startSeconds?: number; endSeconds?: number }
  ): Promise<VideoStudioRenderJobSnapshot> {
    const projectDir = await this.ensureScaffoldReady(project, true)
    return startVerifiedProjectRender({
      project,
      projectDir,
      quality,
      options,
      adapter: this.getAdapter(project.engine),
      engineDeps: this.engineDeps,
      trustStore: this.services.trustStore,
      getCatalog: () => this.getCatalog(),
      beforeExecutionSpawn: this.options.beforeExecutionSpawn,
      jobs: this.jobs,
      notify: () => this.notify()
    })
  }

  async cancelProjectWork(projectId: string): Promise<VideoStudioRenderJobSnapshot | null> {
    const entry = this.jobs.get(projectId)
    if (entry?.abortController) {
      entry.abortController.abort()
      if (ACTIVE_JOB_STATUSES.has(entry.snapshot.status)) {
        entry.snapshot = { ...entry.snapshot, status: 'cancelled', completedAt: Date.now() }
        this.notify()
      }
      await entry.promise?.catch(() => {})
    }
    await this.stopPreview(projectId).catch(() => {})
    return this.jobs.get(projectId)?.snapshot ?? null
  }

  async startPreview(
    project: VideoStudioProject,
    options?: { forceNew?: boolean }
  ): Promise<VideoStudioPreviewState> {
    const projectDir = await this.ensureScaffoldReady(project, false)
    return startVerifiedProjectPreview({
      project,
      projectDir,
      forceNew: options?.forceNew,
      adapter: this.getAdapter(project.engine),
      engineDeps: this.engineDeps,
      trustStore: this.services.trustStore,
      previewManager: this.services.previewManager,
      beforeExecutionSpawn: this.options.beforeExecutionSpawn,
      notify: () => this.notify()
    })
  }

  async stopPreview(projectId: string): Promise<VideoStudioPreviewState> {
    const state = await this.services.previewManager.stopPreview(
      projectId,
      resolveVideoStudioProjectDir(this.profileDir, projectId)
    )
    this.notify()
    return state
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.unwatchFilesListener()
    await disposeVideoStudioJobResources({
      jobs: this.jobs.values(),
      previewManager: this.services.previewManager,
      watcher: this.services.watcher,
      trustStore: this.services.trustStore,
      listeners: this.listeners
    })
  }

  private ensureScaffoldReady(
    project: VideoStudioProject,
    requireIdleJob: boolean
  ): Promise<string> {
    return ensureProjectScaffoldReady({
      disposed: this.disposed,
      profileDir: this.profileDir,
      project,
      requireIdleJob,
      jobs: this.jobs,
      scaffoldComposition: (item) => this.scaffoldComposition(item)
    })
  }
}
