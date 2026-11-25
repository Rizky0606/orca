import { randomUUID } from 'node:crypto'
import type {
  VideoStudioEngine,
  VideoStudioProject,
  VideoStudioRenderQuality
} from '../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioCompositionState,
  VideoStudioEngineStatus,
  VideoStudioJobsEvent,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot
} from '../../shared/video-studio/video-studio-rpc-contract'
import { createRevisionClock, type RevisionClock } from '../runtime/events/revisioned-state'
import { openVideoStudioCatalog, type VideoStudioCatalog } from './video-studio-catalog'
import {
  inspectVideoStudioCompositionState,
  resolveVideoStudioProjectDir
} from './video-studio-composition-paths'
import { createHostVideoEngineDeps } from './engines/host-video-engine-deps'
import type {
  VideoEngineProcessDeps,
  VideoStudioPreviewHandle
} from './engines/video-render-engine'
import {
  getVideoRenderEngineAdapter,
  probeAllVideoRenderEngines
} from './engines/video-render-engine-registry'
import { runVideoStudioCheckTask, runVideoStudioRenderTask } from './video-studio-job-runner'
import {
  ACTIVE_JOB_STATUSES,
  appendJobLogLine,
  projectVideoStudioJobsEvent,
  type ActiveJobEntry
} from './video-studio-job-state'

export type VideoStudioJobManagerOptions = {
  catalog?: VideoStudioCatalog
  engineDeps?: VideoEngineProcessDeps
  probeEngines?: (deps: VideoEngineProcessDeps) => Promise<VideoStudioEngineStatus[]>
  getAdapter?: typeof getVideoRenderEngineAdapter
}

export class VideoStudioJobManager {
  readonly revisions: RevisionClock = createRevisionClock()
  private readonly jobs = new Map<string, ActiveJobEntry>()
  private readonly previews = new Map<string, VideoStudioPreviewHandle>()
  private readonly listeners = new Set<() => void>()
  private readonly engineDeps: VideoEngineProcessDeps
  private readonly probeAll: (deps: VideoEngineProcessDeps) => Promise<VideoStudioEngineStatus[]>
  private readonly getAdapter: typeof getVideoRenderEngineAdapter
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

  getJobSnapshot(projectId: string): VideoStudioRenderJobSnapshot | null {
    return this.jobs.get(projectId)?.snapshot ?? null
  }

  listSnapshots(projectIdFilter?: string): VideoStudioJobsEvent {
    return projectVideoStudioJobsEvent({
      jobs: this.jobs,
      previews: this.previews,
      engines: this.lastEngines,
      revision: this.revisions.next(),
      projectIdFilter
    })
  }

  getPreviewState(projectId: string): VideoStudioPreviewState {
    return this.previews.get(projectId)?.state ?? { active: false }
  }

  async probeEngines(): Promise<VideoStudioEngineStatus[]> {
    const engines = await this.probeAll(this.engineDeps)
    this.lastEngines = engines
    this.notify()
    return engines
  }

  async getCompositionState(projectId: string): Promise<VideoStudioCompositionState> {
    const projectDir = resolveVideoStudioProjectDir(this.profileDir, projectId)
    return inspectVideoStudioCompositionState(projectDir, this.getPreviewState(projectId))
  }

  async scaffoldComposition(
    project: VideoStudioProject,
    options?: { overwrite?: boolean }
  ): Promise<VideoStudioCompositionState> {
    this.assertEngineUsable(project.engine)
    const projectDir = resolveVideoStudioProjectDir(this.profileDir, project.id)
    const state = await this.getAdapter(project.engine).scaffoldProject(
      projectDir,
      project,
      options
    )
    const preview = this.getPreviewState(project.id)
    return {
      ...state,
      previewActive: preview.active,
      ...(preview.url ? { previewUrl: preview.url } : {})
    }
  }

  async runCheck(project: VideoStudioProject): Promise<VideoStudioCheckResult> {
    const projectDir = await this.ensureScaffoldReady(project, true)
    const abortController = new AbortController()
    const entry: ActiveJobEntry = {
      abortController,
      snapshot: {
        projectId: project.id,
        kind: 'check',
        engine: project.engine,
        status: 'checking',
        logLines: [],
        startedAt: Date.now()
      }
    }
    this.jobs.set(project.id, entry)
    this.notify()

    return runVideoStudioCheckTask({
      projectDir,
      adapter: this.getAdapter(project.engine),
      engineDeps: this.engineDeps,
      entry,
      abortController,
      isCurrent: () => this.jobs.get(project.id) === entry,
      onUpdate: () => this.notify(),
      onFail: (error) =>
        this.recordJobFailure(project.id, entry, abortController.signal.aborted, error)
    })
  }

  async startRender(
    project: VideoStudioProject,
    quality: VideoStudioRenderQuality
  ): Promise<VideoStudioRenderJobSnapshot> {
    const projectDir = await this.ensureScaffoldReady(project, true)
    const renderId = randomUUID()
    const fileName = `${renderId}.mp4`
    const abortController = new AbortController()
    const entry: ActiveJobEntry = {
      abortController,
      snapshot: {
        projectId: project.id,
        renderId,
        kind: 'render',
        engine: project.engine,
        quality,
        status: 'rendering',
        progressPercent: 0,
        logLines: [],
        startedAt: Date.now()
      }
    }
    this.jobs.set(project.id, entry)
    this.notify()

    const initialSnapshot = entry.snapshot
    const catalog = await this.getCatalog()
    entry.promise = runVideoStudioRenderTask({
      project,
      projectDir,
      renderId,
      fileName,
      quality,
      adapter: this.getAdapter(project.engine),
      engineDeps: this.engineDeps,
      catalog,
      entry,
      abortController,
      isCurrent: () => this.jobs.get(project.id) === entry,
      onUpdate: () => this.notify(),
      onFail: (error) =>
        this.recordJobFailure(project.id, entry, abortController.signal.aborted, error)
    })
    return initialSnapshot
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

  async startPreview(project: VideoStudioProject): Promise<VideoStudioPreviewState> {
    const projectDir = await this.ensureScaffoldReady(project, false)
    await this.stopPreview(project.id).catch(() => {})
    const handle = await this.getAdapter(project.engine).startPreview(
      projectDir,
      this.engineDeps,
      () => {
        if (this.previews.get(project.id) === handle) {
          this.previews.delete(project.id)
          this.notify()
        }
      }
    )
    this.previews.set(project.id, handle)
    this.notify()
    return handle.state
  }

  async stopPreview(projectId: string): Promise<VideoStudioPreviewState> {
    const handle = this.previews.get(projectId)
    if (handle) {
      this.previews.delete(projectId)
      await handle.stop().catch(() => {})
      this.notify()
    }
    return { active: false }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const stops: Promise<unknown>[] = []
    for (const entry of this.jobs.values()) {
      entry.abortController?.abort()
      if (entry.promise) {
        stops.push(entry.promise.catch(() => {}))
      }
    }
    for (const handle of this.previews.values()) {
      stops.push(handle.stop().catch(() => {}))
    }
    this.previews.clear()
    await Promise.all(stops)
    this.listeners.clear()
  }

  private async ensureScaffoldReady(
    project: VideoStudioProject,
    requireIdleJob: boolean
  ): Promise<string> {
    if (this.disposed) {
      throw new Error('video_studio_manager_disposed')
    }
    this.assertEngineUsable(project.engine)
    if (requireIdleJob) {
      const existing = this.jobs.get(project.id)
      if (existing && ACTIVE_JOB_STATUSES.has(existing.snapshot.status)) {
        throw new Error('video_studio_job_already_running')
      }
    }
    const projectDir = resolveVideoStudioProjectDir(this.profileDir, project.id)
    if (!(await inspectVideoStudioCompositionState(projectDir)).initialized) {
      await this.getAdapter(project.engine).scaffoldProject(projectDir, project)
    }
    return projectDir
  }

  private recordJobFailure(
    projectId: string,
    entry: ActiveJobEntry,
    cancelled: boolean,
    error: unknown
  ): void {
    if (this.jobs.get(projectId) !== entry) {
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    entry.snapshot = {
      ...entry.snapshot,
      status: cancelled ? 'cancelled' : 'failed',
      completedAt: Date.now(),
      ...(cancelled ? {} : { error: message }),
      logLines: appendJobLogLine(entry.snapshot.logLines, message)
    }
    entry.abortController = undefined
    this.notify()
  }

  private assertEngineUsable(engine: VideoStudioEngine): void {
    if (engine === 'remotion') {
      throw new Error('video_studio_engine_unavailable')
    }
  }
}
