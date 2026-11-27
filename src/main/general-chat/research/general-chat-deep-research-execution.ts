import type {
  DeepResearchJob,
  GeneralChatSource
} from '../../../shared/general-chat/general-chat-research-contract'
import type { GeneralChatWebSearchService } from '../search/general-chat-web-search-service'
import type { GeneralChatResearchJobStore } from './general-chat-research-job-store'
import {
  planResearchSteps,
  synthesizeResearchReport,
  type ResearchTextGenerator
} from './general-chat-research-synthesis'
import type { GeneralChatSourceStore } from './general-chat-source-store'

type DeepResearchExecution = {
  jobId: string
  maxSteps: number
  signal: AbortSignal
  searchService: GeneralChatWebSearchService
  sourceStore: GeneralChatSourceStore
  jobStore: GeneralChatResearchJobStore
  generateText?: ResearchTextGenerator
  isInterrupted: (jobId: string, signal: AbortSignal) => boolean
  saveAndNotify: (job: DeepResearchJob) => Promise<DeepResearchJob>
  handleInterrupt: (jobId: string, fallback: DeepResearchJob) => Promise<void>
}

export async function executeGeneralChatDeepResearchJob({
  jobId,
  maxSteps,
  signal,
  searchService,
  sourceStore,
  jobStore,
  generateText,
  isInterrupted,
  saveAndNotify,
  handleInterrupt
}: DeepResearchExecution): Promise<void> {
  let job = await jobStore.get(jobId)
  if (!job) {
    return
  }
  try {
    if (job.steps.length === 0) {
      job = await saveAndNotify({
        ...job,
        status: 'planning',
        startedAt: job.startedAt ?? Date.now(),
        updatedAt: Date.now()
      })
      const plannedSteps = await planResearchSteps({
        topic: job.topic,
        maxSteps,
        generateText
      })
      if (isInterrupted(jobId, signal)) {
        await handleInterrupt(jobId, job)
        return
      }
      job = await saveAndNotify({
        ...job,
        steps: plannedSteps,
        updatedAt: Date.now()
      })
    }

    for (let i = 0; i < job.steps.length; i += 1) {
      if (isInterrupted(jobId, signal)) {
        await handleInterrupt(jobId, job)
        return
      }
      const step = job.steps[i]!
      if (step.status === 'completed' || step.status === 'skipped') {
        continue
      }
      job = await saveAndNotify({
        ...job,
        status: 'searching',
        currentStepIndex: i,
        steps: job.steps.map((entry, idx) => (idx === i ? { ...entry, status: 'running' } : entry)),
        updatedAt: Date.now()
      })

      let discovered: GeneralChatSource[] = []
      let stepNote: string | undefined
      try {
        const searchResult = await searchService.search({
          sessionId: job.sessionId ?? `job-${job.id}`,
          query: step.query,
          providerPreference: job.providerPreference,
          maxResults: 4,
          fetchTopPages: 2,
          origin: 'deep-research',
          jobId: job.id,
          signal
        })
        discovered = searchResult.sources
      } catch (error) {
        if (isInterrupted(jobId, signal)) {
          await handleInterrupt(jobId, job)
          return
        }
        stepNote = error instanceof Error ? error.message : 'Search step failed'
      }

      if (isInterrupted(jobId, signal)) {
        await handleInterrupt(jobId, job)
        return
      }

      const storedJobSources = await sourceStore.appendJobSources(job.id, discovered)
      if (job.sessionId && discovered.length > 0) {
        await sourceStore.appendSessionSources(job.sessionId, discovered)
      }

      job = await saveAndNotify({
        ...job,
        status: 'reading',
        queriesExecuted: job.queriesExecuted + 1,
        sourcesCollected: storedJobSources.length,
        pagesRead: storedJobSources.filter((source) => Boolean(source.extractedText)).length,
        citationIds: storedJobSources.map((source) => source.id),
        steps: job.steps.map((entry, idx) =>
          idx === i
            ? {
                ...entry,
                status: stepNote && discovered.length === 0 ? 'failed' : 'completed',
                sourceIds: discovered.map((source) => source.id),
                note: stepNote
              }
            : entry
        ),
        updatedAt: Date.now()
      })
    }

    if (isInterrupted(jobId, signal)) {
      await handleInterrupt(jobId, job)
      return
    }

    job = await saveAndNotify({
      ...job,
      status: 'synthesizing',
      updatedAt: Date.now()
    })
    const citations = await sourceStore.listJobSources(job.id)
    const reportMarkdown = await synthesizeResearchReport({
      topic: job.topic,
      steps: job.steps,
      sources: citations,
      generateText
    })
    if (isInterrupted(jobId, signal)) {
      await handleInterrupt(jobId, job)
      return
    }
    await saveAndNotify({
      ...job,
      status: 'completed',
      reportMarkdown,
      citationIds: citations.map((citation) => citation.id),
      sourcesCollected: citations.length,
      pagesRead: citations.filter((citation) => Boolean(citation.extractedText)).length,
      updatedAt: Date.now(),
      completedAt: Date.now()
    })
  } catch (error) {
    if (isInterrupted(jobId, signal)) {
      await handleInterrupt(jobId, (await jobStore.get(jobId)) ?? job)
      return
    }
    await saveAndNotify({
      ...job,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Deep Research failed',
      updatedAt: Date.now()
    })
  }
}
