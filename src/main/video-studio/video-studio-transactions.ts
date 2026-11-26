import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { renameDurable } from '../filesystem/durable-file-write'
import { VideoStudioLockCoordinator } from './video-studio-locks'
import { resolveCanonicalRoot, resolveContainedPath } from './video-studio-path-containment'
import {
  readFileWithSha256,
  sha256Bytes,
  signTxJournal,
  VIDEO_STUDIO_FILE_CONFLICT_ERROR,
  VIDEO_STUDIO_INVALID_TX_OPERATIONS_ERROR,
  VIDEO_STUDIO_TX_STAGING_FAILED_ERROR,
  writeDurableContainedFile,
  type TxJournal,
  type TxJournalEntry,
  type TxPhase
} from './video-studio-tx-journal'
import { recoverPendingProjectTransaction } from './video-studio-tx-recovery'

export {
  VideoStudioLockCoordinator,
  VIDEO_STUDIO_LOCK_ORDER_VIOLATION_ERROR,
  type VideoStudioLockKey
} from './video-studio-locks'
export {
  sha256Bytes,
  signTxJournal,
  VIDEO_STUDIO_FILE_CONFLICT_ERROR,
  VIDEO_STUDIO_INVALID_TX_OPERATIONS_ERROR,
  VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR,
  VIDEO_STUDIO_TX_STAGING_FAILED_ERROR,
  type TxJournal,
  type TxJournalEntry,
  type TxPhase
} from './video-studio-tx-journal'
export {
  recoverPendingProjectTransaction,
  type TxRecoveryOptions,
  type TxRecoveryResult
} from './video-studio-tx-recovery'

export type TransactionFileOperation =
  | {
      kind?: 'write'
      relativePath: string
      content: string | Uint8Array
      expectedSha256?: string | null
    }
  | {
      kind: 'delete'
      relativePath: string
      expectedSha256?: string
    }

export type ProjectTransactionParams = {
  projectDir: string
  projectId?: string
  operations: readonly TransactionFileOperation[]
  onPhase?: (phase: TxPhase, txId: string) => Promise<void> | void
}

export type ProjectTransactionResult = {
  txId: string
  revisions: Record<string, string | null>
}

type PreparedOperation = {
  op: TransactionFileOperation
  kind: 'write' | 'delete'
  targetAbs: string
  backupAbs: string | null
  stagedAbs: string | null
  payloadBytes: Uint8Array | null
  beforeBytes: Buffer | null
  entry: TxJournalEntry
}

function sanitizeLeafName(relativePath: string): string {
  const leaf = basename(relativePath).replace(/[^a-zA-Z0-9._-]/g, '_')
  return leaf || 'file'
}

function toPayloadBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? Buffer.from(content, 'utf8') : content
}

async function prepareOperations(params: {
  projectDir: string
  txId: string
  operations: readonly TransactionFileOperation[]
}): Promise<PreparedOperation[]> {
  const { projectDir, txId, operations } = params
  if (operations.length === 0) {
    throw new Error(VIDEO_STUDIO_INVALID_TX_OPERATIONS_ERROR)
  }

  const seenPaths = new Set<string>()
  const prepared: PreparedOperation[] = []

  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i]
    const kind = op.kind ?? 'write'
    const targetAbs = await resolveContainedPath(projectDir, op.relativePath)
    const canonicalRel = op.relativePath.replaceAll('\\', '/')
    if (
      seenPaths.has(canonicalRel) ||
      canonicalRel === '.orca/tx.log' ||
      canonicalRel.startsWith('.orca/.staging/')
    ) {
      throw new Error(VIDEO_STUDIO_INVALID_TX_OPERATIONS_ERROR)
    }
    seenPaths.add(canonicalRel)

    const disk = await readFileWithSha256(targetAbs)
    if (op.expectedSha256 === null && disk.exists) {
      throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
    }
    if (
      typeof op.expectedSha256 === 'string' &&
      (!disk.exists || disk.sha256 !== op.expectedSha256)
    ) {
      throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
    }

    const leaf = sanitizeLeafName(canonicalRel)
    const backupRelativePath = disk.exists ? `.orca/.staging/${txId}/backups/${i}-${leaf}` : null
    const backupAbs = backupRelativePath
      ? await resolveContainedPath(projectDir, backupRelativePath)
      : null

    const payloadBytes =
      kind === 'write' && op.kind !== 'delete' ? toPayloadBytes(op.content) : null
    const stagedRelativePath =
      kind === 'write' ? `.orca/.staging/${txId}/staged/${i}-${leaf}` : null
    const stagedAbs = stagedRelativePath
      ? await resolveContainedPath(projectDir, stagedRelativePath)
      : null

    prepared.push({
      op,
      kind,
      targetAbs,
      backupAbs,
      stagedAbs,
      payloadBytes,
      beforeBytes: disk.bytes,
      entry: {
        relativePath: canonicalRel,
        kind,
        existed: disk.exists,
        beforeSha256: disk.sha256,
        afterSha256: payloadBytes ? sha256Bytes(payloadBytes) : null,
        backupRelativePath,
        stagedRelativePath
      }
    })
  }

  return prepared
}

async function verifyStagedAndBackupFilesOnDisk(
  prepared: readonly PreparedOperation[]
): Promise<boolean> {
  for (const item of prepared) {
    if (item.entry.existed) {
      if (!item.backupAbs || !item.entry.beforeSha256) {
        return false
      }
      const backupBytes = await readFile(item.backupAbs).catch(() => null)
      if (!backupBytes || sha256Bytes(backupBytes) !== item.entry.beforeSha256) {
        return false
      }
    }
    if (item.kind === 'write') {
      if (!item.stagedAbs || !item.entry.afterSha256) {
        return false
      }
      const stagedBytes = await readFile(item.stagedAbs).catch(() => null)
      if (!stagedBytes || sha256Bytes(stagedBytes) !== item.entry.afterSha256) {
        return false
      }
    }
  }
  return true
}

async function deriveFallbackProjectLockId(projectDir: string): Promise<string> {
  const canonicalRoot = await resolveCanonicalRoot(projectDir)
  const normalized = process.platform === 'win32' ? canonicalRoot.toLowerCase() : canonicalRoot
  return `dir-${sha256Bytes(normalized).slice(0, 32)}`
}

/** Coordinates hash-verified, lock-ordered multi-file transactions under `<projectDir>/.orca/`. */
export class VideoStudioTransactionCoordinator {
  constructor(private readonly lockCoordinator = new VideoStudioLockCoordinator()) {}

  async runProjectTransaction(params: ProjectTransactionParams): Promise<ProjectTransactionResult> {
    const lockId = params.projectId ?? (await deriveFallbackProjectLockId(params.projectDir))
    if (this.lockCoordinator.isLockHeld(`project:${lockId}`)) {
      return this.executeTransaction(params)
    }
    return this.lockCoordinator.withProjectLock(lockId, () => this.executeTransaction(params))
  }

  private async executeTransaction(
    params: ProjectTransactionParams
  ): Promise<ProjectTransactionResult> {
    const { projectDir, operations, onPhase } = params
    await recoverPendingProjectTransaction(projectDir)

    const txId = `tx-${randomUUID()}`
    const prepared = await prepareOperations({ projectDir, txId, operations })
    const txLogAbs = await resolveContainedPath(projectDir, '.orca/tx.log')
    const stagingAbs = await resolveContainedPath(projectDir, `.orca/.staging/${txId}`)
    const createdAt = Date.now()
    const entries = prepared.map((item) => item.entry)

    const writeJournal = async (state: TxPhase): Promise<void> => {
      const journal: TxJournal = signTxJournal({
        schemaVersion: 1,
        txId,
        state,
        createdAt,
        entries
      })
      await writeDurableContainedFile(txLogAbs, JSON.stringify(journal, null, 2))
    }

    for (const item of prepared) {
      if (item.entry.existed && item.backupAbs && item.beforeBytes) {
        await writeDurableContainedFile(item.backupAbs, item.beforeBytes)
      }
    }
    await writeJournal('preparing')
    await onPhase?.('preparing', txId)

    for (const item of prepared) {
      if (item.kind === 'write' && item.stagedAbs && item.payloadBytes) {
        await writeDurableContainedFile(item.stagedAbs, item.payloadBytes)
      }
    }

    const verified = await verifyStagedAndBackupFilesOnDisk(prepared)
    if (!verified) {
      await rm(stagingAbs, { recursive: true, force: true }).catch(() => {})
      await rm(txLogAbs, { force: true }).catch(() => {})
      throw new Error(VIDEO_STUDIO_TX_STAGING_FAILED_ERROR)
    }

    await writeJournal('staged-verified')
    await onPhase?.('staged-verified', txId)

    await writeJournal('committing')
    await onPhase?.('committing', txId)

    for (const item of prepared) {
      if (item.kind === 'write' && item.stagedAbs) {
        await mkdir(dirname(item.targetAbs), { recursive: true })
        await renameDurable(item.stagedAbs, item.targetAbs)
      } else if (item.kind === 'delete') {
        await rm(item.targetAbs, { force: true })
      }
    }
    await onPhase?.('committed', txId)

    await rm(txLogAbs, { force: true })
    await rm(stagingAbs, { recursive: true, force: true })

    const revisions: Record<string, string | null> = {}
    for (const item of prepared) {
      revisions[item.entry.relativePath] = item.entry.afterSha256
    }
    return { txId, revisions }
  }
}
