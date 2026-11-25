import type {
  GeneralChatHandoffVideoStudioParams,
  GeneralChatSource
} from '../../../shared/general-chat/general-chat-research-contract'
import { openVideoStudioCatalog } from '../../video-studio/video-studio-catalog'
import { GeneralChatResearchJobStore } from './general-chat-research-job-store'
import { openGeneralChatDeepResearchManager } from './general-chat-research-registry'
import { GeneralChatSourceStore } from './general-chat-source-store'

function formatSourcesBlock(sources: readonly GeneralChatSource[]): string {
  if (sources.length === 0) {
    return ''
  }
  const items = sources
    .slice(0, 12)
    .map((source, index) => `[${index + 1}] ${source.title} — ${source.url}`)
  return ['', '## Verified Sources', ...items].join('\n')
}

/** Creates a pre-populated Video Studio project from General Chat research findings or sources. */
export async function handoffGeneralChatToVideoStudio(
  profileDir: string,
  params: GeneralChatHandoffVideoStudioParams
): Promise<{ projectId: string }> {
  const sourceStore = new GeneralChatSourceStore(profileDir)
  let title = params.title?.trim() ?? ''
  let briefBody = params.briefMarkdown?.trim() ?? ''
  let sources: GeneralChatSource[] = []

  if (params.jobId) {
    const jobStore = new GeneralChatResearchJobStore(profileDir)
    const job = await jobStore.get(params.jobId)
    if (job) {
      if (!title) {
        title = job.topic.slice(0, 120)
      }
      if (!briefBody && job.reportMarkdown) {
        briefBody = job.reportMarkdown
      }
      sources = await sourceStore.listJobSources(job.id)
    }
  }

  if (sources.length === 0 && params.sessionId) {
    sources = await sourceStore.listSessionSources(params.sessionId)
  }

  if (!title) {
    title = sources[0]?.title.slice(0, 120) || 'General Chat Video Brief'
  }

  const promptParts = [
    briefBody ||
      `Create an engaging explainer video about "${title}" grounded in the verified sources below.`,
    formatSourcesBlock(sources)
  ]
  const prompt = promptParts.filter(Boolean).join('\n').slice(0, 50_000)

  const catalog = await openVideoStudioCatalog(profileDir)
  const created = await catalog.create({
    title,
    prompt,
    aspectRatio: params.aspectRatio,
    durationSeconds: params.durationSeconds,
    workflowStage: briefBody ? 'script' : 'research',
    engine: params.engine,
    fps: 30
  })

  if (params.jobId) {
    const manager = await openGeneralChatDeepResearchManager(profileDir)
    await manager.markHandoffProject(params.jobId, created.projectId).catch(() => undefined)
  }

  return { projectId: created.projectId }
}
