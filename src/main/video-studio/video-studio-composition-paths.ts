import { lstat, readdir, realpath } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

// ─── Root resolution ──────────────────────────────────────────────────────────

/**
 * Returns the root directory that hosts all Video Studio composition projects.
 * Located inside the Orca user-data directory so it survives app restarts.
 */
export function resolveVideoStudioProjectsRoot(userDataPath: string): string {
  return join(userDataPath, 'video-studio', 'projects')
}

/**
 * Validates `projectId` against path traversal and resolves the per-project
 * directory. Throws `video_studio_invalid_project_id` for suspicious ids.
 */
export function resolveVideoStudioProjectDir(userDataPath: string, projectId: string): string {
  if (!projectId || /[/\\]/.test(projectId) || projectId.includes('..')) {
    throw new Error('video_studio_invalid_project_id')
  }
  const root = resolveVideoStudioProjectsRoot(userDataPath)
  const candidate = join(root, projectId)
  // Double-check containment after path.join normalises separators
  const resolved = resolve(candidate)
  const resolvedRoot = resolve(root)
  if (!resolved.startsWith(resolvedRoot + sep) && resolved !== resolvedRoot) {
    throw new Error('video_studio_invalid_project_id')
  }
  return candidate
}

/**
 * Resolves the MP4 output path for a completed render.
 * Validates that `renderId` is clean (no traversal characters).
 */
export function resolveVideoStudioRenderOutputFile(
  userDataPath: string,
  projectId: string,
  renderId: string
): string {
  if (!renderId || /[/\\]/.test(renderId) || renderId.includes('..')) {
    throw new Error('video_studio_invalid_render_id')
  }
  const projectDir = resolveVideoStudioProjectDir(userDataPath, projectId)
  return join(projectDir, 'renders', `${renderId}.mp4`)
}

// ─── Composition state inspection ────────────────────────────────────────────

export type VideoStudioCompositionStateResult = {
  exists: boolean
  hasIndexHtml: boolean
  hasConfigFile: boolean
}

/**
 * Checks whether the composition directory and key files exist on disk.
 * Never throws — returns `exists: false` for any I/O error.
 */
export async function inspectVideoStudioCompositionState(
  projectDir: string
): Promise<VideoStudioCompositionStateResult> {
  try {
    await realpath(projectDir)
  } catch {
    return { exists: false, hasIndexHtml: false, hasConfigFile: false }
  }
  const names = await readdir(projectDir).catch(() => [] as string[])
  const set = new Set(names)
  return {
    exists: true,
    hasIndexHtml: set.has('index.html'),
    hasConfigFile: set.has('hyperframes.json')
  }
}

/** Returns true if the given path points to an existing directory. */
export async function isDirectory(path: string): Promise<boolean> {
  return lstat(path)
    .then((s) => s.isDirectory())
    .catch(() => false)
}
