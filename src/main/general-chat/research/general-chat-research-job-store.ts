import { readFile, writeFile } from 'node:fs/promises'
import {
  DeepResearchJobSchema,
  isActiveDeepResearchStatus,
  type DeepResearchJob
} from '../../../shared/general-chat/general-chat-research-contract'
import { AtomicSnapshotWriter } from '../../persistence/atomic-snapshot-writer'
import {
  resolveGeneralChatResearchJobReportFile,
  resolveGeneralChatResearchJobsFile
} from './general-chat-research-paths'

/** Durable store for Deep Research job state, recovering interrupted runs as paused on load. */
export class GeneralChatResearchJobStore {
  private readonly jobs = new Map<string, DeepResearchJob>()
  private readonly writer: AtomicSnapshotWriter
  private lane: Promise<void> = Promise.resolve()
  private loaded = false
  private loadPromise: Promise<void> | null = null

  constructor(private readonly profileDir: string) {
    this.writer = new AtomicSnapshotWriter(
      () => resolveGeneralChatResearchJobsFile(this.profileDir),
      { fileMode: 0o600 }
    )
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.lane.then(work)
    this.lane = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return
    }
    this.loadPromise ??= this.readAndReconcileFromDisk()
    await this.loadPromise
  }

  private async readAndReconcileFromDisk(): Promise<void> {
    const file = resolveGeneralChatResearchJobsFile(this.profileDir)
    let raw: unknown[] = []
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
      raw = Array.isArray(parsed) ? parsed : []
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
    let reconciled = false
    for (const item of raw) {
      const parsed = DeepResearchJobSchema.safeParse(item)
      if (!parsed.success) {
        continue
      }
      const job = parsed.data
      if (isActiveDeepResearchStatus(job.status)) {
        reconciled = true
        this.jobs.set(job.id, {
          ...job,
          status: 'paused',
          steps: job.steps.map((step) =>
            step.status === 'running' ? { ...step, status: 'pending' } : step
          ),
          updatedAt: Date.now()
        })
      } else {
        this.jobs.set(job.id, job)
      }
    }
    this.loaded = true
    if (reconciled) {
      await this.persist()
    }
  }

  private persist(): Promise<void> {
    const snapshot = [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt)
    return this.writer.write(() => JSON.stringify(snapshot, null, 2))
  }

  async list(sessionId?: string): Promise<DeepResearchJob[]> {
    return this.enqueue(async () => {
      await this.ensureLoaded()
      const all = [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt)
      return sessionId ? all.filter((job) => job.sessionId === sessionId) : all
    })
  }

  async get(jobId: string): Promise<DeepResearchJob | null> {
    return this.enqueue(async () => {
      await this.ensureLoaded()
      return this.jobs.get(jobId) ?? null
    })
  }

  async upsert(job: DeepResearchJob): Promise<DeepResearchJob> {
    return this.enqueue(async () => {
      await this.ensureLoaded()
      const validated = DeepResearchJobSchema.parse(job)
      this.jobs.set(validated.id, validated)
      await this.persist()
      if (validated.reportMarkdown) {
        const reportFile = resolveGeneralChatResearchJobReportFile(this.profileDir, validated.id)
        await writeFile(reportFile, validated.reportMarkdown, {
          encoding: 'utf8',
          mode: 0o600
        }).catch(() => undefined)
      }
      return validated
    })
  }

  async flush(): Promise<void> {
    await this.lane
  }
}
