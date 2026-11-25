import { readFile } from 'node:fs/promises'
import * as z from 'zod'
import {
  GeneralChatSourceSchema,
  type GeneralChatSource
} from '../../../shared/general-chat/general-chat-research-contract'
import { AtomicSnapshotWriter } from '../../persistence/atomic-snapshot-writer'
import {
  resolveGeneralChatResearchJobSourcesFile,
  resolveGeneralChatSessionSourcesFile
} from './general-chat-research-paths'

const MAX_STORED_SOURCES_PER_SCOPE = 100

async function readSourceList(file: string): Promise<GeneralChatSource[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!Array.isArray(parsed)) {
      return []
    }
    const sources: GeneralChatSource[] = []
    for (const item of parsed) {
      const checked = GeneralChatSourceSchema.safeParse(item)
      if (checked.success) {
        sources.push(checked.data)
      }
    }
    return sources
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function mergeSources(
  existing: readonly GeneralChatSource[],
  incoming: readonly GeneralChatSource[]
): GeneralChatSource[] {
  const byUrl = new Map<string, GeneralChatSource>()
  for (const item of existing) {
    byUrl.set(item.url, item)
  }
  for (const item of incoming) {
    const prev = byUrl.get(item.url)
    byUrl.set(item.url, {
      ...item,
      extractedText: item.extractedText || prev?.extractedText
    })
  }
  return [...byUrl.values()]
    .sort((a, b) => b.fetchedAt - a.fetchedAt)
    .slice(0, MAX_STORED_SOURCES_PER_SCOPE)
}

/** Durable per-session and per-job cited web source store using serialized atomic writes. */
export class GeneralChatSourceStore {
  private readonly writers = new Map<string, AtomicSnapshotWriter>()
  private readonly lanes = new Map<string, Promise<void>>()

  constructor(private readonly profileDir: string) {}

  private writerFor(file: string): AtomicSnapshotWriter {
    let writer = this.writers.get(file)
    if (!writer) {
      writer = new AtomicSnapshotWriter(() => file, { fileMode: 0o600 })
      this.writers.set(file, writer)
    }
    return writer
  }

  private enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
    const prior = this.lanes.get(key) ?? Promise.resolve()
    const next = prior.then(work)
    this.lanes.set(
      key,
      next.then(
        () => undefined,
        () => undefined
      )
    )
    return next
  }

  listSessionSources(sessionId: string): Promise<GeneralChatSource[]> {
    const file = resolveGeneralChatSessionSourcesFile(this.profileDir, sessionId)
    return this.enqueue(file, () => readSourceList(file))
  }

  appendSessionSources(
    sessionId: string,
    incoming: readonly GeneralChatSource[]
  ): Promise<GeneralChatSource[]> {
    const file = resolveGeneralChatSessionSourcesFile(this.profileDir, sessionId)
    return this.enqueue(file, async () => {
      const merged = mergeSources(await readSourceList(file), incoming)
      await this.writerFor(file).write(() => JSON.stringify(merged, null, 2))
      return merged
    })
  }

  removeSessionSource(sessionId: string, sourceId: string): Promise<GeneralChatSource[]> {
    const file = resolveGeneralChatSessionSourcesFile(this.profileDir, sessionId)
    return this.enqueue(file, async () => {
      const filtered = (await readSourceList(file)).filter((entry) => entry.id !== sourceId)
      await this.writerFor(file).write(() => JSON.stringify(filtered, null, 2))
      return filtered
    })
  }

  clearSessionSources(sessionId: string): Promise<GeneralChatSource[]> {
    const file = resolveGeneralChatSessionSourcesFile(this.profileDir, sessionId)
    return this.enqueue(file, async () => {
      await this.writerFor(file).write(() => '[]')
      return []
    })
  }

  listJobSources(jobId: string): Promise<GeneralChatSource[]> {
    const file = resolveGeneralChatResearchJobSourcesFile(this.profileDir, jobId)
    return this.enqueue(file, () => readSourceList(file))
  }

  appendJobSources(
    jobId: string,
    incoming: readonly GeneralChatSource[]
  ): Promise<GeneralChatSource[]> {
    const file = resolveGeneralChatResearchJobSourcesFile(this.profileDir, jobId)
    return this.enqueue(file, async () => {
      const merged = mergeSources(await readSourceList(file), incoming)
      await this.writerFor(file).write(() => JSON.stringify(merged, null, 2))
      return merged
    })
  }

  async flush(): Promise<void> {
    await Promise.all(this.lanes.values())
  }
}

export const StoredSourceListSchema = z.array(GeneralChatSourceSchema)
