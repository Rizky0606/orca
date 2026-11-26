import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as z from 'zod'
import { SafeResourceIdSchema } from '../../shared/video-studio/video-studio-identifiers'
import {
  ProjectExecutionTrustStateSchema,
  type ProjectExecutionTrustState
} from '../../shared/video-studio/video-studio-storyboard-contract'
import { AtomicSnapshotWriter } from '../persistence/atomic-snapshot-writer'
import { HYPERFRAMES_PINNED_VERSION } from './engines/hyperframes-cli-parsers'
import { computeProjectInputFingerprint } from './engines/project-input-fingerprint'
import { resolveHostVideoSecurityDir } from './video-studio-composition-paths'
import { canonicalRealpath } from './video-studio-path-containment'

export const VIDEO_STUDIO_EXECUTION_APPROVAL_REQUIRED_ERROR =
  'video_studio_execution_approval_required'

export type ExecutionTrustMode = 'check' | 'preview' | 'render'

const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/i)

export const ProjectExecutionTrustRecordSchema = z.object({
  projectId: SafeResourceIdSchema,
  projectRootRealpath: z.string().min(1),
  trustState: ProjectExecutionTrustStateSchema,
  inputFingerprint: Sha256HexSchema,
  approvedAt: z.number().nonnegative(),
  runtimeIdentity: z.string().min(1)
})
export type ProjectExecutionTrustRecord = z.infer<typeof ProjectExecutionTrustRecordSchema>

const TrustStoreSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.record(z.string(), ProjectExecutionTrustRecordSchema)
})

export type VerifiedExecutionSnapshot = {
  projectId: string
  projectRootRealpath: string
  inputFingerprint: string
  record: ProjectExecutionTrustRecord
}

function defaultRuntimeIdentity(): string {
  return `hyperframes@${HYPERFRAMES_PINNED_VERSION}`
}

function assertValidProjectId(projectId: string): string {
  const parsed = SafeResourceIdSchema.safeParse(projectId)
  if (!parsed.success) {
    throw new Error('video_studio_invalid_project_id')
  }
  return parsed.data
}

function makeTrustRecordKey(projectId: string, projectRootRealpath: string): string {
  const normRoot =
    process.platform === 'win32' ? projectRootRealpath.toLowerCase() : projectRootRealpath
  return `${projectId}\0${normRoot}`
}

function isTrustStateSufficient(
  trustState: ProjectExecutionTrustState,
  mode: ExecutionTrustMode
): boolean {
  if (mode === 'render') {
    return trustState === 'approved-render'
  }
  return trustState === 'approved-preview' || trustState === 'approved-render'
}

/**
 * Host-managed execution trust store persisted strictly outside project directories
 * at `<profileDir>/video-studio/security/trust-store.json`.
 */
export class VideoStudioTrustStore {
  private readonly writer: AtomicSnapshotWriter
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly profileDir: string) {
    this.writer = new AtomicSnapshotWriter(
      () => VideoStudioTrustStore.getTrustStorePath(this.profileDir),
      { fileMode: 0o600, directoryMode: 0o700, skipUnchanged: true }
    )
  }

  static getTrustStorePath(profileDir: string): string {
    return join(resolveHostVideoSecurityDir(profileDir), 'trust-store.json')
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async readRecords(): Promise<Record<string, ProjectExecutionTrustRecord>> {
    const raw = await readFile(
      VideoStudioTrustStore.getTrustStorePath(this.profileDir),
      'utf8'
    ).catch(() => null)
    if (!raw) {
      return {}
    }
    try {
      const parsed = TrustStoreSnapshotSchema.safeParse(JSON.parse(raw))
      return parsed.success ? { ...parsed.data.records } : {}
    } catch {
      return {}
    }
  }

  private async writeRecords(records: Record<string, ProjectExecutionTrustRecord>): Promise<void> {
    await this.writer.write(() => JSON.stringify({ schemaVersion: 1, records }, null, 2))
  }

  getTrustRecord(
    projectId: string,
    projectDir: string
  ): Promise<ProjectExecutionTrustRecord | null> {
    const safeProjectId = assertValidProjectId(projectId)
    return this.enqueue(async () => {
      const projectRootRealpath = await canonicalRealpath(projectDir).catch(() => null)
      if (!projectRootRealpath) {
        return null
      }
      const records = await this.readRecords()
      return records[makeTrustRecordKey(safeProjectId, projectRootRealpath)] ?? null
    })
  }

  approveProjectExecution(params: {
    projectId: string
    projectDir: string
    trustState: 'approved-preview' | 'approved-render'
    inputFingerprint?: string
    engineConfig?: unknown
    runtimeIdentity?: string
  }): Promise<ProjectExecutionTrustRecord> {
    const safeProjectId = assertValidProjectId(params.projectId)
    const runtimeIdentity = params.runtimeIdentity ?? defaultRuntimeIdentity()
    return this.enqueue(async () => {
      const projectRootRealpath = await canonicalRealpath(params.projectDir)
      const fingerprint =
        params.inputFingerprint ??
        (
          await computeProjectInputFingerprint(projectRootRealpath, {
            engineConfig: params.engineConfig,
            runtimeIdentity
          })
        ).inputFingerprint
      if (!Sha256HexSchema.safeParse(fingerprint).success) {
        throw new Error('video_studio_invalid_input_fingerprint')
      }

      const record: ProjectExecutionTrustRecord = {
        projectId: safeProjectId,
        projectRootRealpath,
        trustState: params.trustState,
        inputFingerprint: fingerprint.toLowerCase(),
        approvedAt: Date.now(),
        runtimeIdentity
      }
      const records = await this.readRecords()
      records[makeTrustRecordKey(safeProjectId, projectRootRealpath)] = record
      await this.writeRecords(records)
      return record
    })
  }

  revokeProjectExecution(projectId: string, projectDir: string): Promise<void> {
    const safeProjectId = assertValidProjectId(projectId)
    return this.enqueue(async () => {
      const projectRootRealpath = await canonicalRealpath(projectDir).catch(() => null)
      if (!projectRootRealpath) {
        return
      }
      const records = await this.readRecords()
      const key = makeTrustRecordKey(safeProjectId, projectRootRealpath)
      if (!Object.hasOwn(records, key)) {
        return
      }
      delete records[key]
      await this.writeRecords(records)
    })
  }

  assertApprovedForExecution(params: {
    projectId: string
    projectDir: string
    mode: ExecutionTrustMode
    engineConfig?: unknown
    runtimeIdentity?: string
  }): Promise<VerifiedExecutionSnapshot> {
    const safeProjectId = assertValidProjectId(params.projectId)
    const runtimeIdentity = params.runtimeIdentity ?? defaultRuntimeIdentity()
    return this.enqueue(async () => {
      const projectRootRealpath = await canonicalRealpath(params.projectDir).catch(() => null)
      if (!projectRootRealpath) {
        throw new Error(VIDEO_STUDIO_EXECUTION_APPROVAL_REQUIRED_ERROR)
      }
      const records = await this.readRecords()
      const record = records[makeTrustRecordKey(safeProjectId, projectRootRealpath)]
      if (
        !record ||
        !isTrustStateSufficient(record.trustState, params.mode) ||
        record.runtimeIdentity !== runtimeIdentity
      ) {
        throw new Error(VIDEO_STUDIO_EXECUTION_APPROVAL_REQUIRED_ERROR)
      }

      const live = await computeProjectInputFingerprint(projectRootRealpath, {
        engineConfig: params.engineConfig,
        runtimeIdentity
      }).catch(() => null)
      if (!live || live.inputFingerprint.toLowerCase() !== record.inputFingerprint.toLowerCase()) {
        throw new Error(VIDEO_STUDIO_EXECUTION_APPROVAL_REQUIRED_ERROR)
      }

      return {
        projectId: safeProjectId,
        projectRootRealpath,
        inputFingerprint: live.inputFingerprint,
        record
      }
    })
  }

  close(): void {
    this.writer.close()
  }
}

/**
 * Re-verifies host trust approval both before pre-flight preparation and immediately
 * prior to spawning Chrome so TOCTOU edits cannot bypass trust gates.
 */
export async function withExecutionVerifiedSnapshot<T>(
  trustStore: VideoStudioTrustStore,
  params: {
    projectId: string
    projectDir: string
    mode: ExecutionTrustMode
    engineConfig?: unknown
    runtimeIdentity?: string
    prepare?: () => Promise<void>
  },
  execute: (verified: VerifiedExecutionSnapshot) => Promise<T>
): Promise<T> {
  await trustStore.assertApprovedForExecution(params)
  if (params.prepare) {
    await params.prepare()
  }
  const verified = await trustStore.assertApprovedForExecution(params)
  return execute(verified)
}

export const withVerifiedExecutionSnapshot = withExecutionVerifiedSnapshot
