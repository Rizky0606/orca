import { stat } from 'node:fs/promises'
import * as z from 'zod'
import {
  MasterAssetRecordSchema,
  validateMasterAssetInvariants,
  type AssetStateEntry,
  type MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import { SafeResourceIdSchema } from '../../../shared/video-studio/video-studio-identifiers'
import { VIDEO_STUDIO_INVALID_PATH_ERROR } from '../video-studio-path-containment'
import { readFileWithSha256 } from '../video-studio-tx-journal'
import {
  resolveAssetRootFilePath,
  toComparableRelativePath,
  VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR,
  VIDEO_STUDIO_INVALID_STATE_FILE_ERROR
} from './asset-path-containment'

export {
  ASSET_REGISTRY_RELATIVE_PATH,
  assertSafeAssetStateKey,
  collectAssetFilePaths,
  decodeBoundedBase64,
  defaultAssetStatePath,
  MAX_IMPORT_STATE_BYTES,
  normalizeAssetSubPath,
  resolveAssetRootFilePath,
  safeJsonParse,
  toCanonicalProjectAssetPath,
  toComparableRelativePath,
  VIDEO_STUDIO_ASSET_IN_USE_ERROR,
  VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR,
  VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR,
  VIDEO_STUDIO_INVALID_STATE_FILE_ERROR
} from './asset-path-containment'

export const AssetRegistryDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.array(MasterAssetRecordSchema)
})
export type AssetRegistryDocument = z.infer<typeof AssetRegistryDocumentSchema>

export type AssetIntegrityIssueKind =
  | 'invalid-invariant'
  | 'invalid-path'
  | 'missing-file'
  | 'sha256-mismatch'

export type AssetIntegrityIssue = {
  kind: AssetIntegrityIssueKind
  message: string
  path?: string
}

export type VerifiedAssetFiles = {
  asset: MasterAssetRecord
  fileBytesByPath: Map<string, { bytes: Buffer; sha256: string }>
}

function findStagedFile(
  stagedBytesByPath: ReadonlyMap<string, { bytes: Buffer; sha256: string }> | undefined,
  canonicalPath: string
): { bytes: Buffer; sha256: string } | undefined {
  if (!stagedBytesByPath) {
    return undefined
  }
  const exact = stagedBytesByPath.get(canonicalPath)
  if (exact) {
    return exact
  }
  const targetComparable = toComparableRelativePath(canonicalPath)
  for (const [key, value] of stagedBytesByPath.entries()) {
    if (toComparableRelativePath(key) === targetComparable) {
      return value
    }
  }
  return undefined
}

async function resolveAndReadVerifiedFile(
  rootDir: string,
  rawPath: string,
  stagedBytesByPath?: ReadonlyMap<string, { bytes: Buffer; sha256: string }>
): Promise<
  | { ok: true; canonicalPath: string; bytes: Buffer; sha256: string }
  | { ok: false; issue: AssetIntegrityIssue; canonicalPath?: string }
> {
  let resolved: { subPath: string; canonicalPath: string; absPath: string }
  try {
    resolved = await resolveAssetRootFilePath(rootDir, rawPath)
  } catch {
    return {
      ok: false,
      issue: {
        kind: 'invalid-path',
        message: `Asset path "${rawPath}" escapes assets/ containment`,
        path: rawPath
      }
    }
  }
  const staged = findStagedFile(stagedBytesByPath, resolved.canonicalPath)
  if (staged) {
    return { ok: true, canonicalPath: resolved.canonicalPath, ...staged }
  }
  const info = await stat(resolved.absPath).catch(() => null)
  if (!info?.isFile()) {
    return {
      ok: false,
      canonicalPath: resolved.canonicalPath,
      issue: {
        kind: 'missing-file',
        message: `Missing asset file "${resolved.canonicalPath}"`,
        path: resolved.canonicalPath
      }
    }
  }
  const disk = await readFileWithSha256(resolved.absPath).catch(() => null)
  if (!disk?.exists || !disk.bytes || !disk.sha256) {
    return {
      ok: false,
      canonicalPath: resolved.canonicalPath,
      issue: {
        kind: 'missing-file',
        message: `Unreadable asset file "${resolved.canonicalPath}"`,
        path: resolved.canonicalPath
      }
    }
  }
  return {
    ok: true,
    canonicalPath: resolved.canonicalPath,
    bytes: disk.bytes,
    sha256: disk.sha256
  }
}

async function verifyDependencyPaths(params: {
  rootDir: string
  dependencies: readonly string[]
  stagedBytesByPath?: ReadonlyMap<string, { bytes: Buffer; sha256: string }>
  issues: AssetIntegrityIssue[]
  fileBytesByPath: Map<string, { bytes: Buffer; sha256: string }>
}): Promise<string[]> {
  const normalized: string[] = []
  for (const dep of params.dependencies) {
    const depRes = await resolveAndReadVerifiedFile(params.rootDir, dep, params.stagedBytesByPath)
    if (!depRes.ok) {
      params.issues.push(depRes.issue)
    } else {
      normalized.push(depRes.canonicalPath)
      params.fileBytesByPath.set(depRes.canonicalPath, {
        bytes: depRes.bytes,
        sha256: depRes.sha256
      })
    }
  }
  return normalized
}

export async function verifyAssetInvariantsAndFiles(
  rootDir: string,
  asset: MasterAssetRecord,
  stagedBytesByPath?: ReadonlyMap<string, { bytes: Buffer; sha256: string }>
): Promise<{
  ok: boolean
  issues: AssetIntegrityIssue[]
  normalizedAsset: MasterAssetRecord
  fileBytesByPath: Map<string, { bytes: Buffer; sha256: string }>
}> {
  const issues: AssetIntegrityIssue[] = []
  const fileBytesByPath = new Map<string, { bytes: Buffer; sha256: string }>()

  const schemaParsed = MasterAssetRecordSchema.safeParse(asset)
  if (!schemaParsed.success) {
    issues.push({ kind: 'invalid-invariant', message: schemaParsed.error.message })
    return { ok: false, issues, normalizedAsset: asset, fileBytesByPath }
  }

  for (const stateKey of Object.keys(asset.states)) {
    if (!SafeResourceIdSchema.safeParse(stateKey).success) {
      issues.push({ kind: 'invalid-invariant', message: `Invalid asset state key "${stateKey}"` })
    }
  }
  const structural = validateMasterAssetInvariants(asset)
  for (const msg of structural.errors) {
    issues.push({ kind: 'invalid-invariant', message: msg })
  }

  const normalizedStates: Record<string, AssetStateEntry> = {}
  for (const [stateKey, stateEntry] of Object.entries(asset.states)) {
    const fileRes = await resolveAndReadVerifiedFile(rootDir, stateEntry.file, stagedBytesByPath)
    let normalizedFile = stateEntry.file
    let resolvedSha = stateEntry.sha256?.toLowerCase()
    if (!fileRes.ok) {
      issues.push(fileRes.issue)
    } else {
      normalizedFile = fileRes.canonicalPath
      if (resolvedSha && resolvedSha !== fileRes.sha256) {
        issues.push({
          kind: 'sha256-mismatch',
          message: `SHA-256 mismatch for state "${stateKey}" (${fileRes.canonicalPath})`,
          path: fileRes.canonicalPath
        })
      } else {
        resolvedSha = fileRes.sha256
        fileBytesByPath.set(fileRes.canonicalPath, { bytes: fileRes.bytes, sha256: fileRes.sha256 })
      }
    }

    const normalizedStateDeps =
      stateEntry.dependencies !== undefined
        ? await verifyDependencyPaths({
            rootDir,
            dependencies: stateEntry.dependencies,
            stagedBytesByPath,
            issues,
            fileBytesByPath
          })
        : undefined

    normalizedStates[stateKey] = {
      ...stateEntry,
      file: normalizedFile,
      ...(resolvedSha ? { sha256: resolvedSha } : {}),
      ...(normalizedStateDeps !== undefined ? { dependencies: normalizedStateDeps } : {})
    }
  }

  const normalizedDeps = await verifyDependencyPaths({
    rootDir,
    dependencies: asset.dependencies,
    stagedBytesByPath,
    issues,
    fileBytesByPath
  })

  const normalizedAsset: MasterAssetRecord = {
    ...asset,
    states: normalizedStates,
    dependencies: normalizedDeps
  }
  return { ok: issues.length === 0, issues, normalizedAsset, fileBytesByPath }
}

export async function assertAssetInvariantsAndFiles(
  rootDir: string,
  asset: MasterAssetRecord,
  stagedBytesByPath?: ReadonlyMap<string, { bytes: Buffer; sha256: string }>
): Promise<VerifiedAssetFiles> {
  const result = await verifyAssetInvariantsAndFiles(rootDir, asset, stagedBytesByPath)
  if (!result.ok) {
    const summary = new Error(result.issues.map((issue) => issue.message).join('; '))
    if (result.issues.some((issue) => issue.kind === 'invalid-path')) {
      throw new Error(VIDEO_STUDIO_INVALID_PATH_ERROR, { cause: summary })
    }
    if (result.issues.some((issue) => issue.kind === 'invalid-invariant')) {
      throw new Error(VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR, { cause: summary })
    }
    throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR, { cause: summary })
  }
  return { asset: result.normalizedAsset, fileBytesByPath: result.fileBytesByPath }
}
