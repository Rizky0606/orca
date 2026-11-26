import { mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type {
  VideoStudioCompositionState,
  VideoStudioPreviewState
} from '../../shared/video-studio/video-studio-rpc-contract'

function assertSafeSegment(segment: string, errorCode: string): void {
  const trimmed = segment.trim()
  if (
    !trimmed ||
    trimmed !== segment ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new Error(errorCode)
  }
}

function assertContainedPath(root: string, candidate: string, errorCode: string): string {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  const rel = relative(resolvedRoot, resolvedCandidate)
  if (!rel || rel === '.' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new Error(errorCode)
  }
  return resolvedCandidate
}

/**
 * Returns the canonical root directory that hosts all Video Studio composition
 * projects under `<profileDir>/video-studio/projects`.
 */
export function resolveVideoStudioProjectsRoot(profileDir: string): string {
  return join(resolve(profileDir), 'video-studio', 'projects')
}

/**
 * Returns the host-managed security directory strictly outside project directories.
 */
export function resolveHostVideoSecurityDir(profileDir: string): string {
  return join(resolve(profileDir), 'video-studio', 'security')
}

/**
 * Returns the host-managed shared StyleProfile library directory.
 */
export function resolveHostVideoStylesDir(profileDir: string): string {
  return join(resolve(profileDir), 'video-studio', 'styles')
}

/**
 * Returns the host-managed shared Asset library directory.
 */
export function resolveHostVideoAssetsDir(profileDir: string): string {
  return join(resolve(profileDir), 'video-studio', 'assets')
}

/**
 * Validates `projectId` against path traversal and resolves its per-project
 * directory under `<profileDir>/video-studio/projects/<projectId>`.
 */
export function resolveVideoStudioProjectDir(profileDir: string, projectId: string): string {
  assertSafeSegment(projectId, 'video_studio_invalid_project_id')
  const root = resolveVideoStudioProjectsRoot(profileDir)
  return assertContainedPath(root, join(root, projectId), 'video_studio_invalid_project_id')
}

/**
 * Resolves a rendered MP4 file inside `<projectDir>/renders/<fileName>` with strict containment.
 */
export function resolveVideoStudioRenderOutputFile(projectDir: string, fileName: string): string {
  assertSafeSegment(fileName, 'video_studio_invalid_render_file')
  const rendersRoot = join(resolve(projectDir), 'renders')
  return assertContainedPath(
    rendersRoot,
    join(rendersRoot, fileName),
    'video_studio_invalid_render_file'
  )
}

async function collectRelativeFiles(
  rootDir: string,
  currentDir: string,
  out: string[]
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(currentDir, entry.name)
    if (entry.isDirectory()) {
      await collectRelativeFiles(rootDir, full, out)
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      out.push(relative(rootDir, full).split(sep).join('/'))
    }
  }
}

/** Ensures `<profileDir>/video-studio/projects` exists and returns the realpath when possible. */
export async function ensureVideoStudioProjectsRoot(profileDir: string): Promise<string> {
  const root = resolveVideoStudioProjectsRoot(profileDir)
  await mkdir(root, { recursive: true, mode: 0o700 })
  return realpath(root).catch(() => root)
}

/**
 * Inspects a project composition directory without leaking host paths.
 */
export async function inspectVideoStudioCompositionState(
  projectDir: string,
  preview?: VideoStudioPreviewState
): Promise<VideoStudioCompositionState> {
  const stats = await stat(projectDir).catch(() => null)
  if (!stats?.isDirectory()) {
    return {
      initialized: false,
      entryExists: false,
      files: [],
      previewActive: preview?.active ?? false,
      ...(preview?.url ? { previewUrl: preview.url } : {})
    }
  }
  const files: string[] = []
  await collectRelativeFiles(projectDir, projectDir, files)
  files.sort()
  const entryExists = files.includes('index.html')
  const initialized = entryExists && files.includes('hyperframes.json')
  return {
    initialized,
    entryExists,
    files,
    previewActive: preview?.active ?? false,
    ...(preview?.url ? { previewUrl: preview.url } : {})
  }
}
