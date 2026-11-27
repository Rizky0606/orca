import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import * as z from 'zod'
import { SafeResourceIdSchema } from '../../shared/video-studio/video-studio-identifiers'
import { durableWriteTempPath, writeFileDurable } from '../filesystem/durable-file-write'
import { resolveContainedPath } from './video-studio-path-containment'

export const VIDEO_STUDIO_FILE_CONFLICT_ERROR = 'video_studio_file_conflict'
export const VIDEO_STUDIO_TX_RECOVERY_CONFLICT_ERROR = 'video_studio_tx_recovery_conflict'
export const VIDEO_STUDIO_TX_STAGING_FAILED_ERROR = 'video_studio_tx_staging_verification_failed'
export const VIDEO_STUDIO_INVALID_TX_OPERATIONS_ERROR = 'video_studio_invalid_tx_operations'

export const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const TxPhaseSchema = z.enum(['preparing', 'staged-verified', 'committing', 'committed'])
export type TxPhase = z.infer<typeof TxPhaseSchema>

export const TxJournalEntrySchema = z.object({
  relativePath: z.string().min(1),
  kind: z.enum(['write', 'delete']),
  existed: z.boolean(),
  beforeSha256: Sha256HexSchema.nullable(),
  afterSha256: Sha256HexSchema.nullable(),
  backupRelativePath: z.string().min(1).nullable(),
  stagedRelativePath: z.string().min(1).nullable()
})
export type TxJournalEntry = z.infer<typeof TxJournalEntrySchema>

export const TxJournalSchema = z.object({
  schemaVersion: z.literal(1),
  txId: SafeResourceIdSchema,
  state: TxPhaseSchema,
  createdAt: z.number().nonnegative(),
  entries: z.array(TxJournalEntrySchema).min(1),
  journalSha256: Sha256HexSchema
})
export type TxJournal = z.infer<typeof TxJournalSchema>

export function sha256Bytes(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function readErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

export async function readFileWithSha256(
  absPath: string
): Promise<{ exists: boolean; bytes: Buffer | null; sha256: string | null }> {
  try {
    const bytes = await readFile(absPath)
    return { exists: true, bytes, sha256: sha256Bytes(bytes) }
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') {
      return { exists: false, bytes: null, sha256: null }
    }
    throw error
  }
}

export function computeJournalSignature(payload: Omit<TxJournal, 'journalSha256'>): string {
  const canonical = JSON.stringify({
    schemaVersion: payload.schemaVersion,
    txId: payload.txId,
    state: payload.state,
    createdAt: payload.createdAt,
    entries: payload.entries
  })
  return sha256Bytes(canonical)
}

export function signTxJournal(payload: Omit<TxJournal, 'journalSha256'>): TxJournal {
  return {
    ...payload,
    journalSha256: computeJournalSignature(payload)
  }
}

export function verifyTxJournalSignature(journal: TxJournal): boolean {
  const expected = computeJournalSignature({
    schemaVersion: journal.schemaVersion,
    txId: journal.txId,
    state: journal.state,
    createdAt: journal.createdAt,
    entries: journal.entries
  })
  return journal.journalSha256 === expected
}

export async function writeDurableContainedFile(
  absPath: string,
  payload: string | Uint8Array
): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true })
  await writeFileDurable(durableWriteTempPath(absPath), absPath, payload)
}

export async function writeTxConflictArtifact(params: {
  projectDir: string
  txId: string
  reason: 'journal_tampered_or_malformed' | 'backup_integrity_failed' | 'external_modification'
  detail: string
  journalRaw?: string
  observed?: unknown
}): Promise<string> {
  const safeTxId = SafeResourceIdSchema.safeParse(params.txId).success ? params.txId : 'malformed'
  const relPath = `.orca/tx-conflict-${safeTxId}.json`
  const absPath = await resolveContainedPath(params.projectDir, relPath)
  await writeDurableContainedFile(
    absPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        txId: safeTxId,
        reason: params.reason,
        detail: params.detail,
        recordedAt: Date.now(),
        ...(params.observed !== undefined ? { observed: params.observed } : {}),
        ...(params.journalRaw !== undefined ? { journalRaw: params.journalRaw } : {})
      },
      null,
      2
    )
  )
  return relPath
}
