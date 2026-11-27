import { randomUUID } from 'node:crypto'
import type { VideoStudioPreviewState } from '../../shared/video-studio/video-studio-rpc-contract'
import { createHyperFramesEngineAdapter } from './engines/hyperframes-engine-adapter'
import type {
  VideoEngineAdapter,
  VideoEngineProcessDeps,
  VideoStudioPreviewHandle
} from './engines/video-render-engine'
import type { PreviewHttpIdentity } from './preview-http-identity'
import {
  createDefaultPreviewOsControl,
  resolveRealpathDefault,
  type LoopbackPortOwner,
  type ObservedPreviewProcess,
  type PreviewOsControl
} from './preview-os-control'
import { buildVerifiedPreviewRecord, PreviewSessionStore } from './preview-session-store'
import {
  PreviewSessionRecordSchema,
  verifyStoredPreviewSession,
  type PreviewSessionRecord,
  type PreviewSessionVerificationResult,
  type PreviewVerificationFailureReason
} from './preview-session-verifier'

export {
  PreviewSessionRecordSchema,
  createDefaultPreviewOsControl,
  type LoopbackPortOwner,
  type ObservedPreviewProcess,
  type PreviewHttpIdentity,
  type PreviewOsControl,
  type PreviewSessionRecord,
  type PreviewSessionVerificationResult,
  type PreviewVerificationFailureReason
}

export type VideoStudioPreviewManagerOptions = {
  osControl?: PreviewOsControl
}

export type StartPreviewParams = {
  projectId: string
  projectDir: string
  adapter?: VideoEngineAdapter
  deps: VideoEngineProcessDeps
  forceNew?: boolean
  onExit?: () => void
  signal?: AbortSignal
}

type ActivePreviewEntry = {
  projectId: string
  projectDir: string
  sessionId: string
  handle: VideoStudioPreviewHandle
  rawStop: () => Promise<void>
}

/** Manages host-verified HyperFrames preview sessions using 6-factor OS/port/HTTP identity checks and atomic host storage. */
export class VideoStudioPreviewManager {
  private readonly osControl: PreviewOsControl
  private readonly store: PreviewSessionStore
  private readonly activeHandles = new Map<string, ActivePreviewEntry>()
  private readonly projectLanes = new Map<string, Promise<unknown>>()
  private disposed = false

  constructor(
    private readonly profileDir: string,
    options: VideoStudioPreviewManagerOptions = {}
  ) {
    this.osControl = options.osControl ?? createDefaultPreviewOsControl()
    this.store = new PreviewSessionStore(this.profileDir)
  }

  static getSessionsFilePath(profileDir: string): string {
    return PreviewSessionStore.getSessionsFilePath(profileDir)
  }

  private resolvePath(targetPath: string): Promise<string> {
    return (this.osControl.resolveRealpath ?? resolveRealpathDefault)(targetPath)
  }

  private enqueueProjectOp<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.projectLanes.get(projectId) ?? Promise.resolve()
    const run = previous.then(fn, fn)
    const tail = run.then(
      () => undefined,
      () => undefined
    )
    this.projectLanes.set(projectId, tail)
    void tail.then(() => {
      if (this.projectLanes.get(projectId) === tail) {
        this.projectLanes.delete(projectId)
      }
    })
    return run
  }

  listStoredSessions(): Promise<Record<string, PreviewSessionRecord>> {
    return this.store.list()
  }

  getPreviewState(projectId: string): VideoStudioPreviewState {
    return this.activeHandles.get(projectId)?.handle.state ?? { active: false }
  }

  listActivePreviewStates(): ReadonlyMap<string, VideoStudioPreviewState> {
    const out = new Map<string, VideoStudioPreviewState>()
    for (const [projectId, entry] of this.activeHandles.entries()) {
      out.set(projectId, entry.handle.state)
    }
    return out
  }

  async verifySession(
    projectId: string,
    projectDir: string,
    options: { expectedSessionId?: string } = {}
  ): Promise<PreviewSessionVerificationResult> {
    const sessions = await this.store.list()
    return verifyStoredPreviewSession({
      record: sessions[projectId],
      projectDir,
      expectedSessionId: options.expectedSessionId ?? this.activeHandles.get(projectId)?.sessionId,
      osControl: this.osControl
    })
  }

  private buildManagedHandle(params: {
    projectId: string
    projectDir: string
    sessionId: string
    rawHandle: VideoStudioPreviewHandle
  }): VideoStudioPreviewHandle {
    const { projectId, projectDir, sessionId, rawHandle } = params
    return {
      ...rawHandle,
      sessionId,
      stop: async () => {
        await this.stopPreview(projectId, projectDir, { expectedSessionId: sessionId })
      }
    }
  }

  startPreview(params: StartPreviewParams): Promise<VideoStudioPreviewHandle> {
    return this.enqueueProjectOp(params.projectId, () => this.startPreviewSerialized(params))
  }

  private async startPreviewSerialized(
    params: StartPreviewParams
  ): Promise<VideoStudioPreviewHandle> {
    if (this.disposed) {
      throw new Error('video_studio_preview_disposed')
    }
    const existingActive = this.activeHandles.get(params.projectId)
    const verification = await this.verifySession(params.projectId, params.projectDir)

    if (verification.status === 'healthy' && !params.forceNew) {
      if (existingActive && existingActive.sessionId === verification.record.sessionId) {
        return existingActive.handle
      }
      const reusedHandle = this.buildManagedHandle({
        projectId: params.projectId,
        projectDir: params.projectDir,
        sessionId: verification.record.sessionId,
        rawHandle: {
          state: { active: true, url: verification.record.url, port: verification.record.port },
          pid: verification.record.pid,
          projectName: verification.record.projectName,
          executablePath: verification.record.executablePath,
          stop: async () => {}
        }
      })
      this.activeHandles.set(params.projectId, {
        projectId: params.projectId,
        projectDir: params.projectDir,
        sessionId: verification.record.sessionId,
        handle: reusedHandle,
        rawStop: async () => {
          await this.osControl.terminateProcessTree(verification.record.pid).catch(() => false)
        }
      })
      return reusedHandle
    }

    let forceNew = params.forceNew === true
    if (verification.status === 'healthy' && params.forceNew) {
      await this.osControl.terminateProcessTree(verification.record.pid).catch(() => false)
      await this.store.remove(params.projectId)
    } else if (verification.status === 'unhealthy' && verification.belongsToProject) {
      await this.osControl.terminateProcessTree(verification.record.pid).catch(() => false)
      await this.store.remove(params.projectId)
      forceNew = true
    } else if (verification.status === 'stale') {
      await this.store.remove(params.projectId)
    }
    if (existingActive) {
      await existingActive.rawStop().catch(() => {})
      this.activeHandles.delete(params.projectId)
    }

    const adapter = params.adapter ?? createHyperFramesEngineAdapter()
    const projectDirRealpath = await this.resolvePath(params.projectDir)
    const sessionId = randomUUID()
    let exitedEarly = false
    let exitNotified = false

    const notifyExitOnce = () => {
      if (!exitNotified) {
        exitNotified = true
        params.onExit?.()
      }
    }

    const rawHandle = await adapter.startPreview(
      projectDirRealpath,
      params.deps,
      () => {
        exitedEarly = true
        const current = this.activeHandles.get(params.projectId)
        if (current?.sessionId === sessionId) {
          this.activeHandles.delete(params.projectId)
          void this.store.remove(params.projectId)
        }
        notifyExitOnce()
      },
      { forceNew, signal: params.signal }
    )

    let registered = false
    const assertStillActive = async (): Promise<void> => {
      const current = this.activeHandles.get(params.projectId)
      const owned = registered ? current?.sessionId === sessionId : true
      if (!exitedEarly && !this.disposed && owned) {
        return
      }
      if (registered && current?.sessionId === sessionId) {
        this.activeHandles.delete(params.projectId)
      }
      if (!exitedEarly || this.disposed) {
        await rawHandle.stop().catch(() => {})
      }
      await this.store.remove(params.projectId)
      throw new Error(
        this.disposed ? 'video_studio_preview_disposed' : 'video_studio_preview_exited'
      )
    }

    await assertStillActive()

    const managedHandle = this.buildManagedHandle({
      projectId: params.projectId,
      projectDir: params.projectDir,
      sessionId,
      rawHandle
    })

    // Register handle before async OS inspection / persistence so early child exit cleans up deterministically.
    this.activeHandles.set(params.projectId, {
      projectId: params.projectId,
      projectDir: params.projectDir,
      sessionId,
      handle: managedHandle,
      rawStop: () => rawHandle.stop()
    })
    registered = true

    const pid = rawHandle.pid ?? 0
    const observed = pid > 0 ? await this.osControl.inspectProcess(pid) : null
    await assertStillActive()

    const record = buildVerifiedPreviewRecord({
      sessionId,
      projectId: params.projectId,
      projectDirRealpath,
      pid,
      creationTimeMs: observed?.creationTimeMs ?? null,
      executablePath: observed?.executablePath ?? rawHandle.executablePath ?? '',
      rawHandle
    })
    if (record) {
      await this.store.upsert(record)
      await assertStillActive()
    }

    return managedHandle
  }

  stopPreview(
    projectId: string,
    projectDir: string,
    options: { expectedSessionId?: string } = {}
  ): Promise<VideoStudioPreviewState> {
    return this.enqueueProjectOp(projectId, async () => {
      const verification = await this.verifySession(projectId, projectDir, options)
      if (verification.status === 'healthy' || verification.status === 'unhealthy') {
        await this.osControl.terminateProcessTree(verification.record.pid).catch(() => false)
      }

      const active = this.activeHandles.get(projectId)
      const sessionMatches =
        !options.expectedSessionId || active?.sessionId === options.expectedSessionId
      if (active && verification.status === 'none' && sessionMatches) {
        await active.rawStop().catch(() => {})
        this.activeHandles.delete(projectId)
      } else if (verification.status !== 'none') {
        this.activeHandles.delete(projectId)
      }
      await this.store.remove(projectId)
      return { active: false }
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all(this.projectLanes.values())
    const entries = [...this.activeHandles.values()]
    await Promise.all(
      entries.map((entry) =>
        this.stopPreview(entry.projectId, entry.projectDir, {
          expectedSessionId: entry.sessionId
        }).catch(() => {})
      )
    )
    this.store.close()
  }
}
