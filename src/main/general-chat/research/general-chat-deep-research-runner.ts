import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import {
  canCancelDeepResearch,
  canPauseDeepResearch,
  canResumeDeepResearch,
  type DeepResearchJob,
  type DeepResearchJobsEvent,
  type GeneralChatSource,
  type GeneralChatStartDeepResearchParams
} from '../../../shared/general-chat/general-chat-research-contract'
import { createRevisionClock, type RevisionClock } from '../../runtime/events/revisioned-state'
import type { GeneralChatWebSearchService } from '../search/general-chat-web-search-service'
import { resolveGeneralChatResearchJobDir } from './general-chat-research-paths'
import { GeneralChatResearchJobStore } from './general-chat-research-job-store'
import type { ResearchTextGenerator } from './general-chat-research-synthesis'
import { GeneralChatSourceStore } from './general-chat-source-store'
import { executeGeneralChatDeepResearchJob } from './general-chat-deep-research-execution'

export const GENERAL_CHAT_RESEARCH_NOT_FOUND_CODE = 'general_chat_research_not_found'
export const GENERAL_CHAT_RESEARCH_INVALID_TRANSITION_CODE =
  'general_chat_research_invalid_transition'
export const GENERAL_CHAT_RESEARCH_DISPOSED_CODE = 'general_chat_research_disposed'

type InterruptReason = 'pause' | 'cancel' | 'dispose'

export type DeepResearchManagerOptions = {
  searchService: GeneralChatWebSearchService
  sourceStore?: GeneralChatSourceStore
  jobStore?: GeneralChatResearchJobStore
  generateText?: ResearchTextGenerator
}

/** Coordinates resumable Deep Research jobs, incremental source collection, and live notifications. */
export class GeneralChatDeepResearchManager {
  readonly revisions: RevisionClock = createRevisionClock()
  private currentRevision = 0
  private readonly sourceStore: GeneralChatSourceStore
  private readonly jobStore: GeneralChatResearchJobStore
  private readonly controllers = new Map<string, AbortController>()
  private readonly interruptReasons = new Map<string, InterruptReason>()
  private readonly activeRuns = new Map<string, Promise<void>>()
  private readonly listeners = new Set<() => void>()
  private disposed = false

  constructor(
    private readonly profileDir: string,
    private readonly options: DeepResearchManagerOptions
  ) {
    this.sourceStore = options.sourceStore ?? new GeneralChatSourceStore(profileDir)
    this.jobStore = options.jobStore ?? new GeneralChatResearchJobStore(profileDir)
  }

  private notify(): void {
    this.currentRevision = this.revisions.next()
    for (const listener of this.listeners) {
      listener()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async listSnapshots(sessionId?: string): Promise<DeepResearchJobsEvent> {
    return {
      revision: this.currentRevision,
      jobs: await this.jobStore.list(sessionId)
    }
  }

  async getJobWithCitations(
    jobId: string
  ): Promise<{ job: DeepResearchJob; citations: GeneralChatSource[] }> {
    const job = await this.jobStore.get(jobId)
    if (!job) {
      throw new Error(GENERAL_CHAT_RESEARCH_NOT_FOUND_CODE)
    }
    const citations = await this.sourceStore.listJobSources(jobId)
    return { job, citations }
  }

  async start(
    params: GeneralChatStartDeepResearchParams,
    options: { maxSteps?: number } = {}
  ): Promise<DeepResearchJob> {
    if (this.disposed) {
      throw new Error(GENERAL_CHAT_RESEARCH_DISPOSED_CODE)
    }
    const now = Date.now()
    const jobId = randomUUID()
    await mkdir(resolveGeneralChatResearchJobDir(this.profileDir, jobId), { recursive: true })
    const initial: DeepResearchJob = {
      id: jobId,
      sessionId: params.sessionId,
      agent: params.agent,
      topic: params.topic,
      providerPreference: params.provider,
      status: 'queued',
      steps: [],
      currentStepIndex: 0,
      queriesExecuted: 0,
      sourcesCollected: 0,
      pagesRead: 0,
      citationIds: [],
      createdAt: now,
      updatedAt: now
    }
    const saved = await this.jobStore.upsert(initial)
    this.notify()
    this.launchExecution(jobId, options.maxSteps ?? params.maxSteps ?? 4)
    return saved
  }

  async pause(jobId: string): Promise<DeepResearchJob> {
    const job = await this.jobStore.get(jobId)
    if (!job) {
      throw new Error(GENERAL_CHAT_RESEARCH_NOT_FOUND_CODE)
    }
    if (!canPauseDeepResearch(job.status)) {
      throw new Error(GENERAL_CHAT_RESEARCH_INVALID_TRANSITION_CODE)
    }
    this.interruptReasons.set(jobId, 'pause')
    this.controllers.get(jobId)?.abort()
    await this.activeRuns.get(jobId)?.catch(() => undefined)
    const latest = (await this.jobStore.get(jobId)) ?? job
    if (latest.status !== 'paused' && canPauseDeepResearch(latest.status)) {
      const paused = await this.jobStore.upsert({
        ...latest,
        status: 'paused',
        steps: latest.steps.map((step) =>
          step.status === 'running' ? { ...step, status: 'pending' } : step
        ),
        updatedAt: Date.now()
      })
      this.notify()
      return paused
    }
    return latest
  }

  async resume(jobId: string): Promise<DeepResearchJob> {
    if (this.disposed) {
      throw new Error(GENERAL_CHAT_RESEARCH_DISPOSED_CODE)
    }
    const job = await this.jobStore.get(jobId)
    if (!job) {
      throw new Error(GENERAL_CHAT_RESEARCH_NOT_FOUND_CODE)
    }
    if (!canResumeDeepResearch(job.status)) {
      throw new Error(GENERAL_CHAT_RESEARCH_INVALID_TRANSITION_CODE)
    }
    this.interruptReasons.delete(jobId)
    const resumed = await this.jobStore.upsert({
      ...job,
      status: 'queued',
      errorMessage: undefined,
      updatedAt: Date.now()
    })
    this.notify()
    this.launchExecution(jobId, Math.max(job.steps.length, 4))
    return resumed
  }

  async cancel(jobId: string): Promise<DeepResearchJob> {
    const job = await this.jobStore.get(jobId)
    if (!job) {
      throw new Error(GENERAL_CHAT_RESEARCH_NOT_FOUND_CODE)
    }
    if (!canCancelDeepResearch(job.status)) {
      throw new Error(GENERAL_CHAT_RESEARCH_INVALID_TRANSITION_CODE)
    }
    this.interruptReasons.set(jobId, 'cancel')
    this.controllers.get(jobId)?.abort()
    await this.activeRuns.get(jobId)?.catch(() => undefined)
    const latest = (await this.jobStore.get(jobId)) ?? job
    const cancelled = await this.jobStore.upsert({
      ...latest,
      status: 'cancelled',
      steps: latest.steps.map((step) =>
        step.status === 'running' ? { ...step, status: 'skipped' } : step
      ),
      updatedAt: Date.now(),
      completedAt: Date.now()
    })
    this.notify()
    return cancelled
  }

  async markHandoffProject(jobId: string, projectId: string): Promise<DeepResearchJob> {
    const job = await this.jobStore.get(jobId)
    if (!job) {
      throw new Error(GENERAL_CHAT_RESEARCH_NOT_FOUND_CODE)
    }
    const updated = await this.jobStore.upsert({
      ...job,
      handoffProjectId: projectId,
      updatedAt: Date.now()
    })
    this.notify()
    return updated
  }

  private launchExecution(jobId: string, maxSteps: number): void {
    const controller = new AbortController()
    this.controllers.set(jobId, controller)
    const task = this.executeJob(jobId, maxSteps, controller.signal).finally(() => {
      this.controllers.delete(jobId)
      this.activeRuns.delete(jobId)
    })
    this.activeRuns.set(jobId, task)
  }

  private async saveAndNotify(job: DeepResearchJob): Promise<DeepResearchJob> {
    const saved = await this.jobStore.upsert(job)
    this.notify()
    return saved
  }

  private isInterrupted(jobId: string, signal: AbortSignal): InterruptReason | null {
    return this.interruptReasons.get(jobId) ?? (signal.aborted ? 'pause' : null)
  }

  private async executeJob(jobId: string, maxSteps: number, signal: AbortSignal): Promise<void> {
    await executeGeneralChatDeepResearchJob({
      jobId,
      maxSteps,
      signal,
      searchService: this.options.searchService,
      sourceStore: this.sourceStore,
      jobStore: this.jobStore,
      generateText: this.options.generateText,
      isInterrupted: (id, activeSignal) => Boolean(this.isInterrupted(id, activeSignal)),
      saveAndNotify: (job) => this.saveAndNotify(job),
      handleInterrupt: (id, fallback) => this.handleInterrupt(id, fallback)
    })
  }

  private async handleInterrupt(jobId: string, fallback: DeepResearchJob): Promise<void> {
    const reason = this.interruptReasons.get(jobId) ?? 'pause'
    if (reason === 'cancel') {
      return
    }
    const latest = (await this.jobStore.get(jobId)) ?? fallback
    await this.saveAndNotify({
      ...latest,
      status: 'paused',
      steps: latest.steps.map((step) =>
        step.status === 'running' ? { ...step, status: 'pending' } : step
      ),
      updatedAt: Date.now()
    })
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const [jobId, controller] of this.controllers) {
      this.interruptReasons.set(jobId, 'dispose')
      controller.abort()
    }
    await Promise.all([...this.activeRuns.values()].map((task) => task.catch(() => undefined)))
    await this.sourceStore.flush()
    await this.jobStore.flush()
    this.listeners.clear()
  }
}
