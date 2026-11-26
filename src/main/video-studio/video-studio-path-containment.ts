import { realpath as fsRealpath } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const realpathNative = promisify(fsRealpath.native ?? fsRealpath)

export const VIDEO_STUDIO_INVALID_PATH_ERROR = 'video_studio_invalid_path'

/** Resolves canonical native OS realpath (expanding symlinks, junctions, and Windows 8.3 short names). */
export function canonicalRealpath(targetPath: string): Promise<string> {
  return realpathNative(targetPath)
}

function normalizeForComparison(targetPath: string): string {
  const resolved = resolve(targetPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function isWithinCanonicalRoot(
  rootReal: string,
  candidateReal: string,
  allowEqual = false
): boolean {
  const rel = relative(normalizeForComparison(rootReal), normalizeForComparison(candidateReal))
  if (rel === '') {
    return allowEqual
  }
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** Validates a relative path against traversal, NUL, drive/UNC prefixes, and mixed separators. */
export function assertSafeRelativePath(
  relativePath: string,
  errorCode = VIDEO_STUDIO_INVALID_PATH_ERROR
): string[] {
  if (!relativePath || relativePath.trim() !== relativePath) {
    throw new Error(errorCode)
  }
  if (
    relativePath.includes('\0') ||
    /^[a-zA-Z]:/.test(relativePath) ||
    relativePath.startsWith('/') ||
    relativePath.startsWith('\\') ||
    (relativePath.includes('/') && relativePath.includes('\\'))
  ) {
    throw new Error(errorCode)
  }
  const segments = relativePath.split(/[\\/]/)
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error(errorCode)
    }
  }
  return segments
}

export async function resolveCanonicalRoot(
  rootDir: string,
  errorCode = VIDEO_STUDIO_INVALID_PATH_ERROR
): Promise<string> {
  let current = resolve(rootDir)
  const missingTail: string[] = []
  while (true) {
    try {
      const real = await canonicalRealpath(current)
      return missingTail.length === 0 ? real : join(real, ...missingTail.toReversed())
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        throw new Error(errorCode, { cause: error })
      }
      const parent = dirname(current)
      if (parent === current) {
        throw new Error(errorCode, { cause: error })
      }
      missingTail.push(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)))
      current = parent
    }
  }
}

/** Resolves `relativePath` inside `rootDir` while rejecting symlinks/junctions escaping canonical root. */
export async function resolveContainedPath(
  rootDir: string,
  relativePath: string,
  errorCode = VIDEO_STUDIO_INVALID_PATH_ERROR
): Promise<string> {
  const segments = assertSafeRelativePath(relativePath, errorCode)
  const rootReal = await resolveCanonicalRoot(rootDir, errorCode)

  let current = rootReal
  for (let i = 0; i < segments.length; i += 1) {
    current = join(current, segments[i])
    let info: Awaited<ReturnType<typeof lstat>>
    try {
      info = await lstat(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return join(current, ...segments.slice(i + 1))
      }
      throw new Error(errorCode, { cause: error })
    }

    let resolved: string
    try {
      resolved = await canonicalRealpath(current)
    } catch (error) {
      // Dangling symlink or unreadable reparse point must fail containment.
      throw new Error(errorCode, { cause: error })
    }

    if (!isWithinCanonicalRoot(rootReal, resolved, false)) {
      throw new Error(errorCode)
    }
    if (info.isSymbolicLink()) {
      current = resolved
    }
  }

  return current
}
