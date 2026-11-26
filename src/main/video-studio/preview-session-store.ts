import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { AtomicSnapshotWriter } from '../persistence/atomic-snapshot-writer'
import { PreviewSessionRecordSchema, type PreviewSessionRecord } from './preview-session-verifier'

const PreviewSessionsStoreSchema = z.object({
  schemaVersion: z.literal(1),
  sessions: z.record(z.string(), PreviewSessionRecordSchema)
})

export class PreviewSessionStore {
  private readonly writer: AtomicSnapshotWriter
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly profileDir: string) {
    this.writer = new AtomicSnapshotWriter(
      () => PreviewSessionStore.getSessionsFilePath(this.profileDir),
      { fileMode: 0o600, directoryMode: 0o700, skipUnchanged: true }
    )
  }

  static getSessionsFilePath(profileDir: string): string {
    return join(resolve(profileDir), 'video-studio', 'security', 'preview-sessions.json')
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async readRaw(): Promise<Record<string, PreviewSessionRecord>> {
    const raw = await readFile(
      PreviewSessionStore.getSessionsFilePath(this.profileDir),
      'utf8'
    ).catch(() => null)
    if (!raw) {
      return {}
    }
    try {
      const parsed = PreviewSessionsStoreSchema.safeParse(JSON.parse(raw))
      return parsed.success ? { ...parsed.data.sessions } : {}
    } catch {
      return {}
    }
  }

  list(): Promise<Record<string, PreviewSessionRecord>> {
    return this.enqueue(() => this.readRaw())
  }

  upsert(record: PreviewSessionRecord): Promise<void> {
    return this.enqueue(async () => {
      const sessions = await this.readRaw()
      sessions[record.projectId] = record
      await this.writer.write(() => JSON.stringify({ schemaVersion: 1, sessions }, null, 2))
    })
  }

  remove(projectId: string): Promise<void> {
    return this.enqueue(async () => {
      const sessions = await this.readRaw()
      if (!Object.hasOwn(sessions, projectId)) {
        return
      }
      delete sessions[projectId]
      await this.writer.write(() => JSON.stringify({ schemaVersion: 1, sessions }, null, 2))
    })
  }

  close(): void {
    this.writer.close()
  }
}
