import { readFile, rm } from 'node:fs/promises'
import { SafeResourceIdSchema } from '../../shared/video-studio/video-studio-identifiers'
import type { VideoStudioLockCoordinator } from './video-studio-locks'
import { assertSafeRelativePath, resolveContainedPath } from './video-studio-path-containment'
import {
  readErrorCode,
  readFileWithSha256,
  sha256Bytes,
  TxJournalSchema,
  verifyTxJournalSignature,
  VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR,
  writeDurableContainedFile,
  writeTxConflictArtifact,
  type TxJournal,
  type TxJournalEntry
} from './video-studio-tx-journal'

export type TxRecoveryResult =
  | { recovered: false; action: 'none' }
  | {
      recovered: true
      action: 'discarded-uncommitted' | 'completed-commit' | 'rolled-back'
      txId: string
    }

export type TxRecoveryOptions = {
  lockCoordinator?: VideoStudioLockCoordinator
  projectId?: string
  onStep?: (step: string) => Promise<void> | void
}

type InspectedEntry = {
  index: number
  entry: TxJournalEntry
  targetAbs: string
  exists: boolean
  sha256: string | null
  matchesBefore: boolean
  matchesAfter: boolean
}

function validateJournalStructure(
  raw: string
): { ok: true; journal: TxJournal } | { ok: false; txId: string; detail: string } {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return { ok: false, txId: 'malformed', detail: 'Invalid JSON in .orca/tx.log' }
  }

  const candidateTxId =
    typeof parsedJson === 'object' &&
    parsedJson !== null &&
    'txId' in parsedJson &&
    typeof parsedJson.txId === 'string'
      ? parsedJson.txId
      : 'malformed'
  const safeTxId = SafeResourceIdSchema.safeParse(candidateTxId).success
    ? candidateTxId
    : 'malformed'

  const parsed = TxJournalSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return { ok: false, txId: safeTxId, detail: 'Schema validation failed for .orca/tx.log' }
  }

  const journal = parsed.data
  if (!verifyTxJournalSignature(journal)) {
    return { ok: false, txId: journal.txId, detail: 'Journal SHA-256 signature mismatch' }
  }

  const stagingPrefix = `.orca/.staging/${journal.txId}/`
  for (const entry of journal.entries) {
    try {
      assertSafeRelativePath(entry.relativePath)
      if (
        entry.relativePath === '.orca/tx.log' ||
        entry.relativePath.startsWith('.orca/.staging/')
      ) {
        return { ok: false, txId: journal.txId, detail: 'Unsafe journal target path' }
      }
      if (entry.backupRelativePath !== null) {
        assertSafeRelativePath(entry.backupRelativePath)
        if (!entry.backupRelativePath.startsWith(stagingPrefix)) {
          return { ok: false, txId: journal.txId, detail: 'Backup path outside tx staging dir' }
        }
      }
      if (entry.stagedRelativePath !== null) {
        assertSafeRelativePath(entry.stagedRelativePath)
        if (!entry.stagedRelativePath.startsWith(stagingPrefix)) {
          return { ok: false, txId: journal.txId, detail: 'Staged path outside tx staging dir' }
        }
      }
    } catch {
      return { ok: false, txId: journal.txId, detail: 'Path containment failed inside journal' }
    }
  }

  return { ok: true, journal }
}

async function inspectEntries(
  projectDir: string,
  entries: readonly TxJournalEntry[]
): Promise<InspectedEntry[]> {
  const inspected: InspectedEntry[] = []
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    const targetAbs = await resolveContainedPath(projectDir, entry.relativePath)
    const disk = await readFileWithSha256(targetAbs)
    const matchesAfter =
      entry.kind === 'write' ? disk.exists && disk.sha256 === entry.afterSha256 : !disk.exists
    const matchesBefore = entry.existed
      ? disk.exists && disk.sha256 === entry.beforeSha256
      : !disk.exists
    inspected.push({
      index: i,
      entry,
      targetAbs,
      exists: disk.exists,
      sha256: disk.sha256,
      matchesBefore,
      matchesAfter
    })
  }
  return inspected
}

async function verifyBackupsForRollback(
  projectDir: string,
  journal: TxJournal,
  inspected: readonly InspectedEntry[],
  journalRaw: string
): Promise<Map<number, Buffer>> {
  const backups = new Map<number, Buffer>()
  for (const item of inspected) {
    if (item.matchesBefore || !item.entry.existed) {
      continue
    }
    if (!item.entry.backupRelativePath || !item.entry.beforeSha256) {
      await writeTxConflictArtifact({
        projectDir,
        txId: journal.txId,
        reason: 'backup_integrity_failed',
        detail: `Missing backup metadata for ${item.entry.relativePath}`,
        journalRaw
      })
      throw new Error(VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR)
    }
    const backupAbs = await resolveContainedPath(projectDir, item.entry.backupRelativePath)
    const bytes = await readFile(backupAbs).catch(() => null)
    if (!bytes || sha256Bytes(bytes) !== item.entry.beforeSha256) {
      await writeTxConflictArtifact({
        projectDir,
        txId: journal.txId,
        reason: 'backup_integrity_failed',
        detail: `Backup missing or SHA-256 mismatch for ${item.entry.relativePath}`,
        journalRaw
      })
      throw new Error(VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR)
    }
    backups.set(item.index, bytes)
  }
  return backups
}

async function runRecoveryUnlocked(
  projectDir: string,
  options: TxRecoveryOptions
): Promise<TxRecoveryResult> {
  const txLogAbs = await resolveContainedPath(projectDir, '.orca/tx.log')
  let journalRaw: string
  try {
    journalRaw = await readFile(txLogAbs, 'utf8')
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') {
      return { recovered: false, action: 'none' }
    }
    throw error
  }

  const validated = validateJournalStructure(journalRaw)
  if (!validated.ok) {
    await writeTxConflictArtifact({
      projectDir,
      txId: validated.txId,
      reason: 'journal_tampered_or_malformed',
      detail: validated.detail,
      journalRaw
    })
    throw new Error(VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR)
  }

  const { journal } = validated
  const stagingAbs = await resolveContainedPath(projectDir, `.orca/.staging/${journal.txId}`)

  if (journal.state === 'preparing' || journal.state === 'staged-verified') {
    await rm(stagingAbs, { recursive: true, force: true })
    await rm(txLogAbs, { force: true })
    return { recovered: true, action: 'discarded-uncommitted', txId: journal.txId }
  }

  const inspected = await inspectEntries(projectDir, journal.entries)
  const unknownEntries = inspected.filter((item) => !item.matchesBefore && !item.matchesAfter)
  if (unknownEntries.length > 0) {
    await writeTxConflictArtifact({
      projectDir,
      txId: journal.txId,
      reason: 'external_modification',
      detail:
        'One or more target files contain external modifications not matching transaction hashes',
      journalRaw,
      observed: unknownEntries.map((item) => ({
        relativePath: item.entry.relativePath,
        exists: item.exists,
        sha256: item.sha256,
        beforeSha256: item.entry.beforeSha256,
        afterSha256: item.entry.afterSha256
      }))
    })
    throw new Error(VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR)
  }

  if (inspected.every((item) => item.matchesAfter)) {
    await rm(txLogAbs, { force: true })
    await rm(stagingAbs, { recursive: true, force: true })
    return { recovered: true, action: 'completed-commit', txId: journal.txId }
  }

  if (inspected.every((item) => item.matchesBefore)) {
    await rm(txLogAbs, { force: true })
    await rm(stagingAbs, { recursive: true, force: true })
    return { recovered: true, action: 'rolled-back', txId: journal.txId }
  }

  const backups = await verifyBackupsForRollback(projectDir, journal, inspected, journalRaw)
  for (const item of inspected) {
    if (item.matchesBefore) {
      continue
    }
    if (!item.entry.existed) {
      await rm(item.targetAbs, { force: true })
    } else {
      const backupBytes = backups.get(item.index)
      if (!backupBytes) {
        throw new Error(VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR)
      }
      await writeDurableContainedFile(item.targetAbs, backupBytes)
    }
    await options.onStep?.(`restored-entry:${item.index}`)
  }

  await rm(txLogAbs, { force: true })
  await rm(stagingAbs, { recursive: true, force: true })
  return { recovered: true, action: 'rolled-back', txId: journal.txId }
}

/** Recovers or safely quarantines an interrupted multi-file transaction for `projectDir`. */
export function recoverPendingProjectTransaction(
  projectDir: string,
  options: TxRecoveryOptions = {}
): Promise<TxRecoveryResult> {
  const { lockCoordinator, projectId } = options
  if (lockCoordinator && projectId && !lockCoordinator.isLockHeld(`project:${projectId}`)) {
    return lockCoordinator.withProjectLock(projectId, () =>
      runRecoveryUnlocked(projectDir, options)
    )
  }
  return runRecoveryUnlocked(projectDir, options)
}
