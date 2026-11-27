import { randomUUID } from 'node:crypto'
import type {
  VideoStudioProject,
  VideoStudioRenderQuality
} from '../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCompositionState,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot
} from '../../shared/video-studio/video-studio-rpc-contract'
import type { VideoEngineCheckResult } from '../../shared/video-studio/video-studio-validation-contract'
import { computeProjectInputFingerprint } from './engines/project-input-fingerprint'
import type {
  VideoEngineProcessDeps,
  VideoRenderEngineAdapter
} from './engines/video-render-engine'
import type { VideoStudioCatalog } from './video-studio-catalog'
import {
  inspectVideoStudioCompositionState,
  resolveVideoStudioProjectDir
} from './video-studio-composition-paths'
import { runVideoStudioCheckTask, runVideoStudioRenderTask } from './video-studio-job-runner'
import {
  ACTIVE_JOB_STATUSES,
  appendJobLogLine,
  type ActiveJobEntry
} from './video-studio-job-state'
import type { VideoStudioPreviewManager } from './video-studio-preview-manager'
import {
  withExecutionVerifiedSnapshot,
  type VideoStudioTrustStore
} from './video-studio-trust-store'

export async function refreshStaleCheckOnExternalEdit(params: {
  profileDir: string
  projectId: string
  lastChecks: Map<string, VideoEngineCheckResult>
  jobs: Map<string, ActiveJobEntry>
  notify: () => void
}): Promise<void> {
  const { profileDir, projectId, lastChecks, jobs, notify } = params
  const lastCheck = lastChecks.get(projectId)
  if (!lastCheck || lastCheck.stale) {
    return
  }
  const projectDir = resolveVideoStudioProjectDir(profileDir, projectId)
  const live = await computeProjectInputFingerprint(projectDir).catch(() => null)
  if (live && lastCheck.inputFingerprint && live.inputFingerprint === lastCheck.inputFingerprint) {
    return
  }
  const staleCheck: VideoEngineCheckResult = { ...lastCheck, stale: true }
  lastChecks.set(projectId, staleCheck)
  const entry = jobs.get(projectId)
  if (entry?.snapshot.kind === 'check') {
    entry.snapshot = { ...entry.snapshot, checkResult: staleCheck }
  }
  notify()
}

export async function ensureProjectScaffoldReady(params: {
  disposed: boolean
  profileDir: string
  project: VideoStudioProject
  requireIdleJob: boolean
  jobs: Map<string, ActiveJobEntry>
  scaffoldComposition: (project: VideoStudioProject) => Promise<VideoStudioCompositionState>
}): Promise<string> {
  const { disposed, profileDir, project, requireIdleJob, jobs, scaffoldComposition } = params
  if (disposed) {
    throw new Error('video_studio_disposed')
  }
  if (project.engine === 'remotion') {
    throw new Error('video_studio_engine_unavailable')
  }
  if (requireIdleJob) {
    const existing = jobs.get(project.id)
    if (existing && ACTIVE_JOB_STATUSES.has(existing.snapshot.status)) {
      throw new Error('video_studio_job_already_running')
    }
  }
  const projectDir = resolveVideoStudioProjectDir(profileDir, project.id)
  const state = await inspectVideoStudioCompositionState(projectDir)
  if (!state.initialized) {
    await scaffoldComposition(project)
  }
  return projectDir
}

export function recordProjectJobFailure(params: {
  projectId: string
  entry: ActiveJobEntry
  cancelled: boolean
  error: unknown
  jobs: Map<string, ActiveJobEntry>
  notify: () => void
}): void {
  const { projectId, entry, cancelled, error, jobs, notify } = params
  if (jobs.get(projectId) !== entry) {
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
  notify()
}

export async function runVerifiedProjectCheck(params: {
  project: VideoStudioProject
  projectDir: string
  adapter: VideoRenderEngineAdapter
  engineDeps: VideoEngineProcessDeps
  trustStore: VideoStudioTrustStore
  browser?: boolean
  beforeExecutionSpawn?: (projectId: string, projectDir: string) => Promise<void>
  jobs: Map<string, ActiveJobEntry>
  lastChecks: Map<string, VideoEngineCheckResult>
  notify: () => void
}): Promise<VideoEngineCheckResult> {
  const {
    project,
    projectDir,
    adapter,
    engineDeps,
    trustStore,
    browser,
    jobs,
    lastChecks,
    notify
  } = params
  if (browser !== false) {
    await trustStore.assertApprovedForExecution({
      projectId: project.id,
      projectDir,
      mode: 'check'
    })
  }
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
  jobs.set(project.id, entry)
  notify()

  const result = await runVideoStudioCheckTask({
    projectId: project.id,
    projectDir,
    adapter,
    engineDeps,
    trustStore,
    browser,
    beforeExecutionSpawn: params.beforeExecutionSpawn
      ? () => params.beforeExecutionSpawn!(project.id, projectDir)
      : undefined,
    entry,
    abortController,
    isCurrent: () => jobs.get(project.id) === entry,
    onUpdate: notify,
    onFail: (error) =>
      recordProjectJobFailure({
        projectId: project.id,
        entry,
        cancelled: abortController.signal.aborted,
        error,
        jobs,
        notify
      })
  })
  lastChecks.set(project.id, result)
  return result
}

export async function startVerifiedProjectRender(params: {
  project: VideoStudioProject
  projectDir: string
  quality: VideoStudioRenderQuality
  options?: { startSeconds?: number; endSeconds?: number }
  adapter: VideoRenderEngineAdapter
  engineDeps: VideoEngineProcessDeps
  trustStore: VideoStudioTrustStore
  getCatalog: () => Promise<VideoStudioCatalog>
  beforeExecutionSpawn?: (projectId: string, projectDir: string) => Promise<void>
  jobs: Map<string, ActiveJobEntry>
  notify: () => void
}): Promise<VideoStudioRenderJobSnapshot> {
  const { project, projectDir, quality, options, adapter, engineDeps, trustStore, jobs, notify } =
    params
  const renderId = randomUUID()
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
  jobs.set(project.id, entry)
  let catalog!: VideoStudioCatalog
  try {
    await withExecutionVerifiedSnapshot(
      trustStore,
      {
        projectId: project.id,
        projectDir,
        mode: 'render',
        prepare: async () => {
          catalog = await params.getCatalog()
          await params.beforeExecutionSpawn?.(project.id, projectDir)
        }
      },
      async () => {
        notify()
        entry.promise = runVideoStudioRenderTask({
          project,
          projectDir,
          renderId,
          fileName: `${renderId}.mp4`,
          quality,
          startSeconds: options?.startSeconds,
          endSeconds: options?.endSeconds,
          adapter,
          engineDeps,
          catalog,
          entry,
          abortController,
          isCurrent: () => jobs.get(project.id) === entry,
          onUpdate: notify,
          onFail: (error) =>
            recordProjectJobFailure({
              projectId: project.id,
              entry,
              cancelled: abortController.signal.aborted,
              error,
              jobs,
              notify
            })
        })
      }
    )
  } catch (error) {
    if (jobs.get(project.id) === entry) {
      jobs.delete(project.id)
    }
    throw error
  }
  return entry.snapshot
}

export async function startVerifiedProjectPreview(params: {
  project: VideoStudioProject
  projectDir: string
  forceNew?: boolean
  adapter: VideoRenderEngineAdapter
  engineDeps: VideoEngineProcessDeps
  trustStore: VideoStudioTrustStore
  previewManager: VideoStudioPreviewManager
  beforeExecutionSpawn?: (projectId: string, projectDir: string) => Promise<void>
  notify: () => void
}): Promise<VideoStudioPreviewState> {
  const { project, projectDir, forceNew, adapter, engineDeps, trustStore, previewManager, notify } =
    params
  const handle = await withExecutionVerifiedSnapshot(
    trustStore,
    {
      projectId: project.id,
      projectDir,
      mode: 'preview',
      prepare: async () => {
        if (forceNew) {
          await previewManager.stopPreview(project.id, projectDir).catch(() => {})
        }
        await params.beforeExecutionSpawn?.(project.id, projectDir)
      }
    },
    () =>
      previewManager.startPreview({
        projectId: project.id,
        projectDir,
        adapter,
        deps: engineDeps,
        forceNew,
        onExit: notify
      })
  )
  notify()
  return handle.state
}
