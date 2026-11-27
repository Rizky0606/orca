import { stat } from 'node:fs/promises'
import {
  MasterAssetRecordSchema,
  type MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import type { VideoStudioListProjectAssetsResult } from '../../../shared/video-studio/video-studio-asset-rpc-contract'
import { resolveContainedPath } from '../video-studio-path-containment'
import type {
  TransactionFileOperation,
  VideoStudioTransactionCoordinator
} from '../video-studio-transactions'
import { readFileWithSha256, VIDEO_STUDIO_FILE_CONFLICT_ERROR } from '../video-studio-tx-journal'
import { scanProjectDynamicScriptWarnings } from './asset-reference-scanner'
import {
  ASSET_REGISTRY_RELATIVE_PATH,
  AssetRegistryDocumentSchema,
  collectAssetFilePaths,
  resolveAssetRootFilePath,
  safeJsonParse,
  toComparableRelativePath,
  verifyAssetInvariantsAndFiles,
  VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR,
  type AssetRegistryDocument
} from './video-studio-asset-invariants'

export function assertExpectedRevision(actualSha: string | null, expectedRevision?: string): void {
  if (expectedRevision !== undefined && actualSha !== expectedRevision) {
    throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
  }
}

export async function inspectProjectAssetRegistry(
  projectDir: string
): Promise<VideoStudioListProjectAssetsResult> {
  const abs = await resolveContainedPath(projectDir, ASSET_REGISTRY_RELATIVE_PATH)
  const disk = await readFileWithSha256(abs)
  const warnings = await scanProjectDynamicScriptWarnings(projectDir)
  if (!disk.exists || !disk.bytes) {
    return { assets: [], warnings, invariantErrors: {}, revision: null }
  }
  const raw = safeJsonParse(disk.bytes.toString('utf8'))
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('schemaVersion' in raw) ||
    raw.schemaVersion !== 1 ||
    !('assets' in raw) ||
    !Array.isArray(raw.assets)
  ) {
    return {
      assets: [],
      warnings,
      invariantErrors: { _registry: ['Malformed assets/asset-registry.json'] },
      revision: disk.sha256
    }
  }
  const assets: MasterAssetRecord[] = []
  const invariantErrors: Record<string, string[]> = {}
  const seenIds = new Set<string>()
  const rawAssets: unknown[] = raw.assets
  for (let i = 0; i < rawAssets.length; i += 1) {
    const entry = rawAssets[i]
    const parsedRecord = MasterAssetRecordSchema.safeParse(entry)
    if (!parsedRecord.success) {
      const fallbackId =
        typeof entry === 'object' && entry !== null && 'id' in entry && typeof entry.id === 'string'
          ? entry.id
          : `_invalid_${i}`
      invariantErrors[fallbackId] = [parsedRecord.error.message]
      continue
    }
    const check = await verifyAssetInvariantsAndFiles(projectDir, parsedRecord.data)
    assets.push(check.normalizedAsset)
    const errors = check.ok ? [] : check.issues.map((issue) => `[${issue.kind}] ${issue.message}`)
    if (seenIds.has(parsedRecord.data.id)) {
      errors.push(`[invalid-invariant] Duplicate asset id "${parsedRecord.data.id}" in registry`)
    }
    seenIds.add(parsedRecord.data.id)
    if (errors.length > 0) {
      invariantErrors[parsedRecord.data.id] = [
        ...(invariantErrors[parsedRecord.data.id] ?? []),
        ...errors
      ]
    }
  }
  return { assets, warnings, invariantErrors, revision: disk.sha256 }
}

export async function readProjectRegistryForMutation(
  projectDir: string,
  expectedRevision?: string
): Promise<{ sha256: string | null; doc: AssetRegistryDocument }> {
  const abs = await resolveContainedPath(projectDir, ASSET_REGISTRY_RELATIVE_PATH)
  const disk = await readFileWithSha256(abs)
  assertExpectedRevision(disk.sha256, expectedRevision)
  if (!disk.exists || !disk.bytes) {
    return { sha256: null, doc: { schemaVersion: 1, assets: [] } }
  }
  const parsedDoc = AssetRegistryDocumentSchema.safeParse(
    safeJsonParse(disk.bytes.toString('utf8'))
  )
  if (!parsedDoc.success) {
    throw new Error(VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR, {
      cause: new Error('Malformed assets/asset-registry.json')
    })
  }
  const uniqueIds = new Set(parsedDoc.data.assets.map((asset) => asset.id))
  if (uniqueIds.size !== parsedDoc.data.assets.length) {
    throw new Error(VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR, {
      cause: new Error('Duplicate asset id in assets/asset-registry.json')
    })
  }
  return { sha256: disk.sha256, doc: parsedDoc.data }
}

export async function collectExclusiveDeleteOps(
  projectDir: string,
  target: MasterAssetRecord,
  remaining: readonly MasterAssetRecord[]
): Promise<{ deletedFiles: string[]; deleteOps: TransactionFileOperation[] }> {
  const stillUsed = new Set<string>()
  for (const asset of remaining) {
    for (const path of collectAssetFilePaths(asset)) {
      stillUsed.add(toComparableRelativePath(path))
    }
  }
  const deletedFiles: string[] = []
  const deleteOps: TransactionFileOperation[] = []
  for (const canonicalPath of collectAssetFilePaths(target)) {
    if (stillUsed.has(toComparableRelativePath(canonicalPath))) {
      continue
    }
    const resolved = await resolveAssetRootFilePath(projectDir, canonicalPath).catch(() => null)
    if (!resolved) {
      continue
    }
    const info = await stat(resolved.absPath).catch(() => null)
    if (info?.isFile()) {
      deletedFiles.push(canonicalPath)
      deleteOps.push({ kind: 'delete', relativePath: canonicalPath })
    }
  }
  return { deletedFiles, deleteOps }
}

export async function commitProjectAssetRegistry(params: {
  tx: VideoStudioTransactionCoordinator
  projectDir: string
  projectId: string
  assets: MasterAssetRecord[]
  expectedRegistrySha256: string | null
  fileOps?: readonly TransactionFileOperation[]
}): Promise<string> {
  const nextDoc: AssetRegistryDocument = { schemaVersion: 1, assets: params.assets }
  const txRes = await params.tx.runProjectTransaction({
    projectDir: params.projectDir,
    projectId: params.projectId,
    operations: [
      ...(params.fileOps ?? []),
      {
        relativePath: ASSET_REGISTRY_RELATIVE_PATH,
        content: `${JSON.stringify(nextDoc, null, 2)}\n`,
        expectedSha256: params.expectedRegistrySha256
      }
    ]
  })
  return txRes.revisions[ASSET_REGISTRY_RELATIVE_PATH]!
}
