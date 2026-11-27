import { watch, type FSWatcher } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import {
  assertSafeRelativePath,
  canonicalRealpath,
  isWithinCanonicalRoot
} from './video-studio-path-containment'
import { readFileWithSha256 } from './video-studio-tx-journal'

export const WATCHER_IGNORED_TOP_DIRS = new Set([
  '.orca',
  'renders',
  'node_modules',
  '.hyperframes',
  '.git'
])

export const TRACKED_WATCHER_DOCUMENT_PATHS = [
  'BRIEF.md',
  'STORYBOARD.md',
  'SCRIPT.md',
  'references/sources.json',
  'references/research-notes.md',
  'frame.md',
  'DESIGN.md',
  'MOTION.md',
  'styles/style-profile.json',
  'assets/asset-registry.json',
  'index.html',
  'hyperframes.json'
] as const

export function isIgnoredWatcherPath(relPath: string): boolean {
  const segments = relPath.split('/')
  if (segments.length === 0 || WATCHER_IGNORED_TOP_DIRS.has(segments[0]!)) {
    return true
  }
  return segments.some((seg) => seg.startsWith('.') || seg.endsWith('.tmp'))
}

export function toSafeWatcherRelativePath(rawPath: string): string | null {
  const normalized = rawPath.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || isIgnoredWatcherPath(normalized)) {
    return null
  }
  try {
    assertSafeRelativePath(normalized)
    return normalized
  } catch {
    return null
  }
}

export async function collectProjectWatchedFiles(
  rootDir: string,
  currentDir = rootDir,
  out: string[] = []
): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
  for (const item of entries) {
    if (item.name.startsWith('.') || item.name.endsWith('.tmp')) {
      continue
    }
    if (currentDir === rootDir && WATCHER_IGNORED_TOP_DIRS.has(item.name)) {
      continue
    }
    const full = join(currentDir, item.name)
    if (item.isDirectory()) {
      await collectProjectWatchedFiles(rootDir, full, out)
    } else if (item.isFile()) {
      const safe = toSafeWatcherRelativePath(relative(rootDir, full).split(sep).join('/'))
      if (safe) {
        out.push(safe)
      }
    }
  }
  return out
}

export async function readTrackedRevisions(
  rootDir: string,
  extraPaths: readonly string[]
): Promise<Record<string, string>> {
  const revisions: Record<string, string> = {}
  for (const rel of new Set([...TRACKED_WATCHER_DOCUMENT_PATHS, ...extraPaths])) {
    const disk = await readFileWithSha256(join(rootDir, ...rel.split('/')))
    if (disk.exists && disk.sha256) {
      revisions[rel] = disk.sha256
    }
  }
  return revisions
}

export function attachDirectoryWatchers(params: {
  rootReal: string
  dirPath: string
  recursive: boolean
  watchers: Map<string, FSWatcher>
  isDisposed: () => boolean
  onPathEvent: (relPath: string | null) => void
}): void {
  const { rootReal, dirPath, recursive, watchers, isDisposed, onPathEvent } = params
  if (watchers.has(dirPath) || isDisposed()) {
    return
  }
  const watcher = watch(dirPath, { recursive, persistent: false }, (_eventType, fileName) => {
    if (isDisposed() || watchers.size === 0) {
      return
    }
    if (typeof fileName === 'string' && fileName.length > 0) {
      const rawRel =
        dirPath === rootReal
          ? fileName
          : join(relative(rootReal, dirPath), fileName).split(sep).join('/')
      const safe = toSafeWatcherRelativePath(rawRel)
      if (safe) {
        onPathEvent(safe)
      }
    } else {
      onPathEvent(null)
    }
  })
  watcher.on('error', () => {
    watcher.close()
    watchers.delete(dirPath)
  })
  watchers.set(dirPath, watcher)
}

export async function attachSubtreeDirectoryWatchers(params: {
  rootReal: string
  currentDir: string
  watchers: Map<string, FSWatcher>
  isDisposed: () => boolean
  onPathEvent: (relPath: string | null) => void
}): Promise<void> {
  const { rootReal, currentDir, watchers, isDisposed, onPathEvent } = params
  attachDirectoryWatchers({
    rootReal,
    dirPath: currentDir,
    recursive: false,
    watchers,
    isDisposed,
    onPathEvent
  })
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
  for (const item of entries) {
    if (
      !item.isDirectory() ||
      WATCHER_IGNORED_TOP_DIRS.has(item.name) ||
      item.name.startsWith('.')
    ) {
      continue
    }
    const real = await canonicalRealpath(join(currentDir, item.name)).catch(() => null)
    if (real && isWithinCanonicalRoot(rootReal, real, false)) {
      await attachSubtreeDirectoryWatchers({
        rootReal,
        currentDir: real,
        watchers,
        isDisposed,
        onPathEvent
      })
    }
  }
}

export async function isDirectoryPath(targetPath: string): Promise<boolean> {
  const info = await stat(targetPath).catch(() => null)
  return Boolean(info?.isDirectory())
}
