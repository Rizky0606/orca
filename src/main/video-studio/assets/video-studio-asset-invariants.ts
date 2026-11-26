import { stat } from 'node:fs/promises'
import * as z from 'zod'
import {
  MasterAssetRecordSchema,
  validateMasterAssetInvariants,
  type AssetFormat,
  type AssetStateEntry,
  type AssetType,
  type MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import { SafeResourceIdSchema } from '../../../shared/video-studio/video-studio-identifiers'
import {
  assertSafeRelativePath,
  resolveContainedPath,
  VIDEO_STUDIO_INVALID_PATH_ERROR
} from '../video-studio-path-containment'
import { readFileWithSha256 } from '../video-studio-tx-journal'

export const MAX_IMPORT_STATE_BYTES = 15 * 1024 * 1024
export const ASSET_REGISTRY_RELATIVE_PATH = 'assets/asset-registry.json'

export const VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR = 'video_studio_asset_not_found'
export const VIDEO_STUDIO_ASSET_IN_USE_ERROR = 'video_studio_asset_in_use'
export const VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR = 'video_studio_asset_invariant_invalid'
export const VIDEO_STUDIO_INVALID_STATE_FILE_ERROR = 'video_studio_invalid_state_file'

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

const ASSET_SUBDIR_BY_TYPE: Record<AssetType, string> = {
  object: 'objects',
  character: 'characters',
  environment: 'environments',
  graphic: 'graphics',
  model3d: 'models',
  audio: 'audio',
  video: 'video',
  lottie: 'lottie',
  custom: 'custom'
}

const BASE64_FORMAT_RE = /^[A-Za-z0-9+/]+={0,2}$/

export function assertSafeAssetStateKey(stateKey: string): string {
  const parsed = SafeResourceIdSchema.safeParse(stateKey)
  if (!parsed.success) {
    throw new Error(VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR, {
      cause: new Error(`Invalid asset state key "${stateKey}"`)
    })
  }
  return parsed.data
}

/** Normalizes `assets/...` or subfolder-relative asset paths and blocks registry/hidden escapes. */
export function normalizeAssetSubPath(rawPath: string): string {
  const segments = assertSafeRelativePath(rawPath, VIDEO_STUDIO_INVALID_PATH_ERROR)
  if (segments.some((segment) => segment.startsWith('.'))) {
    throw new Error(VIDEO_STUDIO_INVALID_PATH_ERROR)
  }
  const normalized = segments.join('/')
  const subPath = normalized.startsWith('assets/') ? normalized.slice('assets/'.length) : normalized
  if (!subPath || normalized === 'assets' || subPath === 'asset-registry.json') {
    throw new Error(VIDEO_STUDIO_INVALID_PATH_ERROR)
  }
  return subPath
}

export function toCanonicalProjectAssetPath(rawPath: string): string {
  return `assets/${normalizeAssetSubPath(rawPath)}`
}

export function defaultAssetStatePath(
  assetId: string,
  type: AssetType,
  stateKey: string,
  format: AssetFormat
): string {
  const safeState = assertSafeAssetStateKey(stateKey)
  const subdir = ASSET_SUBDIR_BY_TYPE[type]
  const ext = format === 'layered-svg' ? 'svg' : format === 'lottie' ? 'json' : format
  return `assets/${subdir}/${assetId}/${safeState}.${ext}`
}

export function decodeBoundedBase64(rawBase64: string): Buffer {
  const cleaned = rawBase64.replace(/\s+/g, '')
  if (!cleaned || cleaned.length % 4 !== 0 || !BASE64_FORMAT_RE.test(cleaned)) {
    throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR, {
      cause: new Error('Invalid base64 asset payload')
    })
  }
  const bytes = Buffer.from(cleaned, 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_STATE_BYTES) {
    throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR, {
      cause: new Error(`Asset payload exceeds ${MAX_IMPORT_STATE_BYTES} bytes or is empty`)
    })
  }
  return bytes
}

export async function resolveAssetRootFilePath(
  rootDir: string,
  rawPath: string
): Promise<{ subPath: string; canonicalPath: string; absPath: string }> {
  const subPath = normalizeAssetSubPath(rawPath)
  const assetsRoot = await resolveContainedPath(rootDir, 'assets', VIDEO_STUDIO_INVALID_PATH_ERROR)
  const absPath = await resolveContainedPath(assetsRoot, subPath, VIDEO_STUDIO_INVALID_PATH_ERROR)
  return { subPath, canonicalPath: `assets/${subPath}`, absPath }
}

export function collectAssetFilePaths(asset: MasterAssetRecord): string[] {
  const paths = new Set<string>()
  for (const state of Object.values(asset.states)) {
    paths.add(toCanonicalProjectAssetPath(state.file))
    for (const dep of state.dependencies ?? []) {
      paths.add(toCanonicalProjectAssetPath(dep))
    }
  }
  for (const dep of asset.dependencies) {
    paths.add(toCanonicalProjectAssetPath(dep))
  }
  return [...paths]
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
  const staged = stagedBytesByPath?.get(resolved.canonicalPath)
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

    const normalizedStateDeps: string[] = []
    for (const dep of stateEntry.dependencies ?? []) {
      const depRes = await resolveAndReadVerifiedFile(rootDir, dep, stagedBytesByPath)
      if (!depRes.ok) {
        issues.push(depRes.issue)
      } else {
        normalizedStateDeps.push(depRes.canonicalPath)
        fileBytesByPath.set(depRes.canonicalPath, { bytes: depRes.bytes, sha256: depRes.sha256 })
      }
    }

    normalizedStates[stateKey] = {
      ...stateEntry,
      file: normalizedFile,
      ...(resolvedSha ? { sha256: resolvedSha } : {}),
      ...(stateEntry.dependencies !== undefined ? { dependencies: normalizedStateDeps } : {})
    }
  }

  const normalizedDeps: string[] = []
  for (const dep of asset.dependencies) {
    const depRes = await resolveAndReadVerifiedFile(rootDir, dep, stagedBytesByPath)
    if (!depRes.ok) {
      issues.push(depRes.issue)
    } else {
      normalizedDeps.push(depRes.canonicalPath)
      fileBytesByPath.set(depRes.canonicalPath, { bytes: depRes.bytes, sha256: depRes.sha256 })
    }
  }

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
