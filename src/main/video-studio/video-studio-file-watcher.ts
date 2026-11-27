import type { FSWatcher } from 'node:fs'
import { join, resolve } from 'node:path'
import type { VideoStudioProjectFilesChangedEvent } from '../../shared/video-studio/video-studio-rpc-contract'
import { canonicalRealpath } from './video-studio-path-containment'
import { readFileWithSha256 } from './video-studio-tx-journal'
import {
  attachDirectoryWatchers,
  attachSubtreeDirectoryWatchers,
  collectProjectWatchedFiles,
  isDirectoryPath,
  readTrackedRevisions,
  toSafeWatcherRelativePath
} from './video-studio-watcher-fs'

type SuppressedWrite = { sha256: string | null; expiresAt: number }

type WatchedProject = {
  projectId: string
  projectDir: string
  rootReal: string | null
  watchers: Map<string, FSWatcher>
  timer: ReturnType<typeof setTimeout> | null
  activeWriteDepth: number
  pendingPaths: Set<string>
  scanAll: boolean
  lastKnownHashes: Map<string, string | null>
  suppressed: Map<string, SuppressedWrite>
}

function normalizeDirKey(dirPath: string): string {
  const resolved = resolve(dirPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Watches active Video Studio project directories across platforms, suppresses Orca's own
 * TX/scaffold writes using write-depth + SHA-256 verification, and emits `projectFilesChanged`.
 */
export class VideoStudioFileWatcher {
  private readonly projects = new Map<string, WatchedProject>()
  private readonly dirToProjectId = new Map<string, string>()
  private readonly listeners = new Set<(event: VideoStudioProjectFilesChangedEvent) => void>()
  private readonly debounceMs: number
  private readonly suppressionTtlMs: number
  private disposed = false

  constructor(options: { debounceMs?: number; suppressionTtlMs?: number } = {}) {
    this.debounceMs = options.debounceMs ?? 80
    this.suppressionTtlMs = options.suppressionTtlMs ?? 2000
  }

  subscribe(listener: (event: VideoStudioProjectFilesChangedEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async watchProject(projectId: string, projectDir: string): Promise<void> {
    if (this.disposed) {
      return
    }
    let entry = this.projects.get(projectId)
    if (!entry) {
      entry = {
        projectId,
        projectDir,
        rootReal: null,
        watchers: new Map(),
        timer: null,
        activeWriteDepth: 0,
        pendingPaths: new Set(),
        scanAll: false,
        lastKnownHashes: new Map(),
        suppressed: new Map()
      }
      this.projects.set(projectId, entry)
      this.dirToProjectId.set(normalizeDirKey(projectDir), projectId)
    }
    await this.ensureAttached(entry)
  }

  async unwatchProject(projectId: string): Promise<void> {
    const entry = this.projects.get(projectId)
    if (!entry) {
      return
    }
    this.projects.delete(projectId)
    this.dirToProjectId.delete(normalizeDirKey(entry.projectDir))
    if (entry.rootReal) {
      this.dirToProjectId.delete(normalizeDirKey(entry.rootReal))
    }
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
    for (const watcher of entry.watchers.values()) {
      watcher.close()
    }
    entry.watchers.clear()
  }

  beginWrite(projectDir: string, projectId?: string): void {
    const entry = this.findEntry(projectDir, projectId)
    if (entry) {
      entry.activeWriteDepth += 1
    }
  }

  endWrite(
    projectDir: string,
    projectId: string | undefined,
    revisions: Record<string, string | null>,
    succeeded: boolean
  ): void {
    const entry = this.findEntry(projectDir, projectId)
    if (!entry) {
      return
    }
    entry.activeWriteDepth = Math.max(0, entry.activeWriteDepth - 1)
    if (succeeded) {
      const expiresAt = Date.now() + this.suppressionTtlMs
      for (const [relPath, sha256] of Object.entries(revisions)) {
        const safe = toSafeWatcherRelativePath(relPath)
        if (!safe) {
          continue
        }
        entry.suppressed.set(safe, { sha256, expiresAt })
        entry.lastKnownHashes.set(safe, sha256)
        entry.pendingPaths.delete(safe)
      }
    }
    if (entry.activeWriteDepth === 0 && (entry.pendingPaths.size > 0 || entry.scanAll)) {
      this.scheduleFlush(entry)
    }
  }

  async suppressDuring<T>(projectId: string, projectDir: string, fn: () => Promise<T>): Promise<T> {
    this.beginWrite(projectDir, projectId)
    let ok = false
    try {
      const res = await fn()
      ok = true
      return res
    } finally {
      const entry = this.findEntry(projectDir, projectId)
      const revisions: Record<string, string | null> = {}
      if (ok && entry) {
        const root = entry.rootReal ?? projectDir
        for (const rel of await collectProjectWatchedFiles(root)) {
          revisions[rel] = (await readFileWithSha256(join(root, ...rel.split('/')))).sha256
        }
      }
      this.endWrite(projectDir, projectId, revisions, ok)
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all([...this.projects.keys()].map((projectId) => this.unwatchProject(projectId)))
    this.listeners.clear()
  }

  private findEntry(projectDir: string, projectId?: string): WatchedProject | undefined {
    if (projectId && this.projects.has(projectId)) {
      return this.projects.get(projectId)
    }
    const mappedId = this.dirToProjectId.get(normalizeDirKey(projectDir))
    return mappedId ? this.projects.get(mappedId) : undefined
  }

  private async ensureAttached(entry: WatchedProject): Promise<void> {
    if (this.disposed || entry.watchers.size > 0 || !(await isDirectoryPath(entry.projectDir))) {
      return
    }
    const rootReal = await canonicalRealpath(entry.projectDir).catch(() =>
      resolve(entry.projectDir)
    )
    entry.rootReal = rootReal
    this.dirToProjectId.set(normalizeDirKey(rootReal), entry.projectId)

    for (const rel of await collectProjectWatchedFiles(rootReal)) {
      const disk = await readFileWithSha256(join(rootReal, ...rel.split('/')))
      entry.lastKnownHashes.set(rel, disk.sha256)
    }

    const onPathEvent = (relPath: string | null): void => {
      if (relPath) {
        entry.pendingPaths.add(relPath)
      } else {
        entry.scanAll = true
      }
      this.scheduleFlush(entry)
    }
    if (process.platform === 'win32' || process.platform === 'darwin') {
      try {
        attachDirectoryWatchers({
          rootReal,
          dirPath: rootReal,
          recursive: true,
          watchers: entry.watchers,
          isDisposed: () => this.disposed,
          onPathEvent
        })
        return
      } catch (error) {
        const code =
          error instanceof Error && 'code' in error && typeof error.code === 'string'
            ? error.code
            : undefined
        if (code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
          return
        }
      }
    }
    await attachSubtreeDirectoryWatchers({
      rootReal,
      currentDir: rootReal,
      watchers: entry.watchers,
      isDisposed: () => this.disposed,
      onPathEvent
    })
  }

  private scheduleFlush(entry: WatchedProject): void {
    if (this.disposed) {
      return
    }
    if (entry.timer) {
      clearTimeout(entry.timer)
    }
    entry.timer = setTimeout(() => {
      entry.timer = null
      void this.flushEntry(entry)
    }, this.debounceMs)
    entry.timer.unref?.()
  }

  private async flushEntry(entry: WatchedProject): Promise<void> {
    if (this.disposed || !this.projects.has(entry.projectId)) {
      return
    }
    if (entry.activeWriteDepth > 0) {
      this.scheduleFlush(entry)
      return
    }
    const root = entry.rootReal ?? entry.projectDir
    const candidates = new Set(entry.pendingPaths)
    entry.pendingPaths.clear()
    const scanAll = entry.scanAll
    entry.scanAll = false
    if (scanAll || candidates.size === 0) {
      for (const rel of await collectProjectWatchedFiles(root)) {
        candidates.add(rel)
      }
      for (const known of entry.lastKnownHashes.keys()) {
        candidates.add(known)
      }
    }

    const now = Date.now()
    for (const [k, v] of entry.suppressed.entries()) {
      if (v.expiresAt < now) {
        entry.suppressed.delete(k)
      }
    }

    const changedPaths: string[] = []
    for (const rel of candidates) {
      const abs = join(root, ...rel.split('/'))
      if (await isDirectoryPath(abs)) {
        if (process.platform !== 'win32' && process.platform !== 'darwin') {
          await attachSubtreeDirectoryWatchers({
            rootReal: root,
            currentDir: abs,
            watchers: entry.watchers,
            isDisposed: () => this.disposed,
            onPathEvent: (subRel) => {
              if (subRel) {
                entry.pendingPaths.add(subRel)
              } else {
                entry.scanAll = true
              }
              this.scheduleFlush(entry)
            }
          })
        }
        continue
      }
      const disk = await readFileWithSha256(abs)
      const suppressed = entry.suppressed.get(rel)
      if (suppressed && suppressed.expiresAt >= now && suppressed.sha256 === disk.sha256) {
        entry.lastKnownHashes.set(rel, disk.sha256)
        continue
      }
      const prev = entry.lastKnownHashes.get(rel)
      const changed = prev === undefined ? disk.exists : prev !== disk.sha256
      if (changed) {
        entry.lastKnownHashes.set(rel, disk.sha256)
        changedPaths.push(rel)
      }
    }

    if (changedPaths.length === 0) {
      return
    }
    const event: VideoStudioProjectFilesChangedEvent = {
      type: 'projectFilesChanged',
      projectId: entry.projectId,
      changedPaths: [...changedPaths].sort(),
      revisions: await readTrackedRevisions(root, changedPaths),
      externalEdit: true,
      timestamp: Date.now()
    }
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
