import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { VideoStudioPreviewState } from '../../shared/video-studio/video-studio-rpc-contract'
import { AtomicSnapshotWriter } from '../persistence/atomic-snapshot-writer'
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

const PreviewSessionsStoreSchema = z.object({
  schemaVersion: z.literal(1),
  sessions: z.record(z.string(), PreviewSessionRecordSchema)
})

export type VideoStudioPreviewManagerOptions = {
  osControl?: PreviewOsControl
}

type ActivePreviewEntry = {
  projectId: string
  projectDir: string
  sessionId: string
  handle: VideoStudioPreviewHandle
}

/** Manages host-verified HyperFrames preview sessions using 6-factor OS/port/HTTP identity checks and atomic host storage. */
export class VideoStudioPreviewManager {
  private readonly osControl: PreviewOsControl
  private readonly writer: AtomicSnapshotWriter
  private readonly activeHandles = new Map<string, ActivePreviewEntry>()
  private storeQueue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly profileDir: string,
    options: VideoStudioPreviewManagerOptions = {}
  ) {
    this.osControl = options.osControl ?? createDefaultPreviewOsControl()
    this.writer = new AtomicSnapshotWriter(
      () => VideoStudioPreviewManager.getSessionsFilePath(this.profileDir),
      { fileMode: 0o600, directoryMode: 0o700, skipUnchanged: true }
    )
  }

  static getSessionsFilePath(profileDir: string): string {
    return join(resolve(profileDir), 'video-studio', 'security', 'preview-sessions.json')
  }

  private resolvePath(targetPath: string): Promise<string> {
    return (this.osControl.resolveRealpath ?? resolveRealpathDefault)(targetPath)
  }

  private enqueueStoreOp<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.storeQueue.then(fn, fn)
    this.storeQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async readStoredSessionsRaw(): Promise<Record<string, PreviewSessionRecord>> {
    const raw = await readFile(
      VideoStudioPreviewManager.getSessionsFilePath(this.profileDir),
      'utf8'
    ).catch(() => null)
    if (!raw) {
      return {}
    }
    try {
      const parsed = PreviewSessionsStoreSchema.safeParse(JSON.parse(raw))
      return parsed.success ? { ...parsed.data.sessions } : {}
    } catch {
      return {}
    }
  }

  async listStoredSessions(): Promise<Record<string, PreviewSessionRecord>> {
    return this.enqueueStoreOp(() => this.readStoredSessionsRaw())
  }

  private async upsertStoredSession(record: PreviewSessionRecord): Promise<void> {
    await this.enqueueStoreOp(async () => {
      const sessions = await this.readStoredSessionsRaw()
      sessions[record.projectId] = record
      await this.writer.write(() => JSON.stringify({ schemaVersion: 1, sessions }, null, 2))
    })
  }

  private async removeStoredSession(projectId: string): Promise<void> {
    await this.enqueueStoreOp(async () => {
      const sessions = await this.readStoredSessionsRaw()
      if (!Object.hasOwn(sessions, projectId)) {
        return
      }
      delete sessions[projectId]
      await this.writer.write(() => JSON.stringify({ schemaVersion: 1, sessions }, null, 2))
    })
  }

  getPreviewState(projectId: string): VideoStudioPreviewState {
    return this.activeHandles.get(projectId)?.handle.state ?? { active: false }
  }

  async verifySession(
    projectId: string,
    projectDir: string,
    options: { expectedSessionId?: string } = {}
  ): Promise<PreviewSessionVerificationResult> {
    const sessions = await this.listStoredSessions()
    return verifyStoredPreviewSession({
      record: sessions[projectId],
      projectDir,
      expectedSessionId: options.expectedSessionId ?? this.activeHandles.get(projectId)?.sessionId,
      osControl: this.osControl
    })
  }

  async startPreview(params: {
    projectId: string
    projectDir: string
    adapter?: VideoEngineAdapter
    deps: VideoEngineProcessDeps
    onExit?: () => void
    signal?: AbortSignal
  }): Promise<VideoStudioPreviewHandle> {
    const adapter = params.adapter ?? createHyperFramesEngineAdapter()
    const verification = await this.verifySession(params.projectId, params.projectDir)

    if (verification.status === 'healthy') {
      const existing = this.activeHandles.get(params.projectId)
      if (existing) {
        return existing.handle
      }
      const reusedHandle: VideoStudioPreviewHandle = {
        state: { active: true, url: verification.record.url, port: verification.record.port },
        pid: verification.record.pid,
        projectName: verification.record.projectName,
        executablePath: verification.record.executablePath,
        sessionId: verification.record.sessionId,
        stop: async () => {
          await this.stopPreview(params.projectId, params.projectDir, {
            expectedSessionId: verification.record.sessionId
          })
        }
      }
      this.activeHandles.set(params.projectId, {
        projectId: params.projectId,
        projectDir: params.projectDir,
        sessionId: verification.record.sessionId,
        handle: reusedHandle
      })
      return reusedHandle
    }

    let forceNew = false
    if (verification.status === 'unhealthy' && verification.belongsToProject) {
      await this.osControl.terminateProcessTree(verification.record.pid).catch(() => false)
      await this.removeStoredSession(params.projectId)
      this.activeHandles.delete(params.projectId)
      forceNew = true
    } else if (verification.status === 'stale') {
      await this.removeStoredSession(params.projectId)
      this.activeHandles.delete(params.projectId)
    }

    const projectDirRealpath = await this.resolvePath(params.projectDir)
    const sessionId = randomUUID()
    const rawHandle = await adapter.startPreview(
      projectDirRealpath,
      params.deps,
      () => {
        const current = this.activeHandles.get(params.projectId)
        if (current?.sessionId === sessionId) {
          this.activeHandles.delete(params.projectId)
          void this.removeStoredSession(params.projectId)
          params.onExit?.()
        }
      },
      { forceNew, signal: params.signal }
    )

    const pid = rawHandle.pid ?? 0
    const observed = pid > 0 ? await this.osControl.inspectProcess(pid) : null
    const executablePath = observed?.executablePath ?? rawHandle.executablePath ?? ''
    const creationTimeMs = observed?.creationTimeMs ?? Date.now()
    const port = rawHandle.state.port ?? 3002
    const url = rawHandle.state.url ?? `http://127.0.0.1:${port}/#project/${params.projectId}`
    const host = new URL(url).hostname.toLowerCase() === 'localhost' ? 'localhost' : '127.0.0.1'

    if (pid > 0 && executablePath) {
      await this.upsertStoredSession({
        sessionId,
        projectId: params.projectId,
        projectDirRealpath,
        pid,
        creationTimeMs,
        executablePath,
        port,
        host,
        url,
        projectName: rawHandle.projectName ?? params.projectId,
        startedAt: Date.now()
      })
    }

    const managedHandle: VideoStudioPreviewHandle = {
      ...rawHandle,
      sessionId,
      stop: async () => {
        const stored = await this.listStoredSessions()
        if (stored[params.projectId]) {
          await this.stopPreview(params.projectId, params.projectDir, {
            expectedSessionId: sessionId
          })
        } else {
          this.activeHandles.delete(params.projectId)
          await rawHandle.stop().catch(() => {})
        }
      }
    }

    this.activeHandles.set(params.projectId, {
      projectId: params.projectId,
      projectDir: params.projectDir,
      sessionId,
      handle: managedHandle
    })
    return managedHandle
  }

  async stopPreview(
    projectId: string,
    projectDir: string,
    options: { expectedSessionId?: string } = {}
  ): Promise<VideoStudioPreviewState> {
    const verification = await this.verifySession(projectId, projectDir, options)
    if (verification.status === 'healthy' || verification.status === 'unhealthy') {
      await this.osControl.terminateProcessTree(verification.record.pid).catch(() => false)
    }

    const active = this.activeHandles.get(projectId)
    if (active && verification.status === 'none') {
      await active.handle.stop().catch(() => {})
    }
    this.activeHandles.delete(projectId)
    await this.removeStoredSession(projectId)
    return { active: false }
  }

  async dispose(): Promise<void> {
    const entries = [...this.activeHandles.values()]
    await Promise.all(
      entries.map((entry) =>
        this.stopPreview(entry.projectId, entry.projectDir, {
          expectedSessionId: entry.sessionId
        }).catch(() => {})
      )
    )
    this.writer.close()
  }
}
