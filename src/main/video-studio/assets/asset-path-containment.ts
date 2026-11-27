import type {
  AssetFormat,
  AssetType,
  MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import { SafeResourceIdSchema } from '../../../shared/video-studio/video-studio-identifiers'
import {
  assertSafeRelativePath,
  resolveContainedPath,
  VIDEO_STUDIO_INVALID_PATH_ERROR
} from '../video-studio-path-containment'

export const MAX_IMPORT_STATE_BYTES = 15 * 1024 * 1024
export const ASSET_REGISTRY_RELATIVE_PATH = 'assets/asset-registry.json'

export const VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR = 'video_studio_asset_not_found'
export const VIDEO_STUDIO_ASSET_IN_USE_ERROR = 'video_studio_asset_in_use'
export const VIDEO_STUDIO_ASSET_INVARIANT_INVALID_ERROR = 'video_studio_asset_invariant_invalid'
export const VIDEO_STUDIO_INVALID_STATE_FILE_ERROR = 'video_studio_invalid_state_file'

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

export function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function toComparableRelativePath(
  relPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const normalized = relPath.replaceAll('\\', '/')
  return platform === 'win32' || platform === 'darwin' ? normalized.toLowerCase() : normalized
}

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
  const lower = normalized.toLowerCase()
  const subPath = lower.startsWith('assets/') ? normalized.slice('assets/'.length) : normalized
  if (!subPath || lower === 'assets' || subPath.toLowerCase() === 'asset-registry.json') {
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
