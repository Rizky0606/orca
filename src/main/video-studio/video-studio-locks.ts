import { AsyncLocalStorage } from 'node:async_hooks'
import { SafeResourceIdSchema } from '../../shared/video-studio/video-studio-identifiers'

export type VideoStudioLockKey = 'hostStyles' | 'hostAssets' | `project:${string}`

export const VIDEO_STUDIO_LOCK_ORDER_VIOLATION_ERROR = 'video_studio_lock_order_violation'

type HeldLockEntry = {
  key: VideoStudioLockKey
  rank: number
}

function resolveLockRank(key: VideoStudioLockKey): number {
  if (key === 'hostStyles') {
    return 0
  }
  if (key === 'hostAssets') {
    return 1
  }
  if (key.startsWith('project:')) {
    const projectId = key.slice('project:'.length)
    if (!SafeResourceIdSchema.safeParse(projectId).success) {
      throw new Error(`video_studio_invalid_lock_key:${key}`)
    }
    return 2
  }
  throw new Error(`video_studio_invalid_lock_key:${String(key)}`)
}

/**
 * Coordinates FIFO async locks across Host Libraries and projects in strict canonical order:
 * `hostStyles -> hostAssets -> project:<projectId>`.
 */
export class VideoStudioLockCoordinator {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly context = new AsyncLocalStorage<readonly HeldLockEntry[]>()

  getHeldLocks(): readonly VideoStudioLockKey[] {
    return (this.context.getStore() ?? []).map((entry) => entry.key)
  }

  isLockHeld(key: VideoStudioLockKey): boolean {
    return (this.context.getStore() ?? []).some((entry) => entry.key === key)
  }

  async acquire<T>(key: VideoStudioLockKey, fn: () => Promise<T>): Promise<T> {
    const rank = resolveLockRank(key)
    const held = this.context.getStore() ?? []
    const maxHeldRank = held.reduce((max, entry) => Math.max(max, entry.rank), -1)
    if (rank <= maxHeldRank) {
      throw new Error(VIDEO_STUDIO_LOCK_ORDER_VIOLATION_ERROR)
    }

    const previous = this.queues.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => current)
    this.queues.set(key, tail)

    await previous
    try {
      return await this.context.run([...held, { key, rank }], fn)
    } finally {
      release()
      if (this.queues.get(key) === tail) {
        this.queues.delete(key)
      }
    }
  }

  acquireOrdered<T>(keys: readonly VideoStudioLockKey[], fn: () => Promise<T>): Promise<T> {
    const unique = [...new Set(keys)]
    unique.sort((a, b) => resolveLockRank(a) - resolveLockRank(b))
    for (let i = 1; i < unique.length; i += 1) {
      if (resolveLockRank(unique[i]) === resolveLockRank(unique[i - 1])) {
        throw new Error(VIDEO_STUDIO_LOCK_ORDER_VIOLATION_ERROR)
      }
    }
    const runAt = (index: number): Promise<T> => {
      if (index >= unique.length) {
        return fn()
      }
      return this.acquire(unique[index], () => runAt(index + 1))
    }
    return runAt(0)
  }

  withHostStylesLock<T>(fn: () => Promise<T>): Promise<T> {
    return this.acquire('hostStyles', fn)
  }

  withHostAssetsLock<T>(fn: () => Promise<T>): Promise<T> {
    return this.acquire('hostAssets', fn)
  }

  withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    return this.acquire(`project:${projectId}`, fn)
  }
}
