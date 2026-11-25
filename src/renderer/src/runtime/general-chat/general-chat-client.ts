import {
  GENERAL_CHAT_CANCEL_DEEP_RESEARCH_METHOD,
  GENERAL_CHAT_CLEAR_SOURCES_METHOD,
  GENERAL_CHAT_DELETE_SOURCE_METHOD,
  GENERAL_CHAT_ENSURE_HOME_METHOD,
  GENERAL_CHAT_GET_DEEP_RESEARCH_METHOD,
  GENERAL_CHAT_HANDOFF_VIDEO_STUDIO_METHOD,
  GENERAL_CHAT_LIST_DEEP_RESEARCH_METHOD,
  GENERAL_CHAT_LIST_SEARCH_PROVIDERS_METHOD,
  GENERAL_CHAT_LIST_SOURCES_METHOD,
  GENERAL_CHAT_PAUSE_DEEP_RESEARCH_METHOD,
  GENERAL_CHAT_RESUME_DEEP_RESEARCH_METHOD,
  GENERAL_CHAT_SEARCH_WEB_METHOD,
  GENERAL_CHAT_SET_SEARCH_PROVIDER_KEY_METHOD,
  GENERAL_CHAT_START_DEEP_RESEARCH_METHOD,
  GENERAL_CHAT_SUBSCRIBE_DEEP_RESEARCH_METHOD,
  DeepResearchJobsEventSchema,
  type ConfigurableSearchProvider,
  type DeepResearchJob,
  type DeepResearchJobsEvent,
  type GeneralChatHandoffVideoStudioParams,
  type GeneralChatHome,
  type GeneralChatSearchWebResult,
  type GeneralChatSource,
  type SearchProviderStatus,
  type WebSearchProviderId
} from '../../../../shared/general-chat/general-chat-contract'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { callRuntimeRpc } from '../rpc/calls/runtime-rpc-call'
import { subscribeRuntimeRpc } from '../rpc/subscriptions/runtime-rpc-subscribe'
import { getRuntimeTargetHostId } from '../rpc/targets/runtime-client-target'

export async function ensureGeneralChatHomeForTarget(
  target: RuntimeClientTarget
): Promise<GeneralChatHome> {
  const home = await callRuntimeRpc<GeneralChatHome>(target, GENERAL_CHAT_ENSURE_HOME_METHOD)
  return { ...home, executionHostId: getRuntimeTargetHostId(target) }
}

export function searchGeneralChatWebForTarget(
  target: RuntimeClientTarget,
  params: {
    sessionId?: string
    query: string
    provider?: WebSearchProviderId
    maxResults?: number
    fetchTopPages?: number
  }
) {
  return callRuntimeRpc<GeneralChatSearchWebResult>(target, GENERAL_CHAT_SEARCH_WEB_METHOD, params)
}

export function listGeneralChatSourcesForTarget(target: RuntimeClientTarget, sessionId: string) {
  return callRuntimeRpc<{ sources: GeneralChatSource[] }>(
    target,
    GENERAL_CHAT_LIST_SOURCES_METHOD,
    { sessionId }
  )
}

export function deleteGeneralChatSourceForTarget(
  target: RuntimeClientTarget,
  sessionId: string,
  sourceId: string
) {
  return callRuntimeRpc<{ sources: GeneralChatSource[] }>(
    target,
    GENERAL_CHAT_DELETE_SOURCE_METHOD,
    { sessionId, sourceId }
  )
}

export function clearGeneralChatSourcesForTarget(target: RuntimeClientTarget, sessionId: string) {
  return callRuntimeRpc<{ sources: GeneralChatSource[] }>(
    target,
    GENERAL_CHAT_CLEAR_SOURCES_METHOD,
    { sessionId }
  )
}

export function listGeneralChatSearchProvidersForTarget(target: RuntimeClientTarget) {
  return callRuntimeRpc<{ providers: SearchProviderStatus[] }>(
    target,
    GENERAL_CHAT_LIST_SEARCH_PROVIDERS_METHOD,
    {}
  )
}

export function setGeneralChatSearchProviderKeyForTarget(
  target: RuntimeClientTarget,
  provider: ConfigurableSearchProvider,
  apiKey: string
) {
  return callRuntimeRpc<{ providers: SearchProviderStatus[] }>(
    target,
    GENERAL_CHAT_SET_SEARCH_PROVIDER_KEY_METHOD,
    { provider, apiKey }
  )
}

export function startGeneralChatDeepResearchForTarget(
  target: RuntimeClientTarget,
  params: {
    sessionId?: string
    agent?: string
    topic: string
    provider?: WebSearchProviderId
    maxSteps?: number
  }
) {
  return callRuntimeRpc<{ job: DeepResearchJob }>(
    target,
    GENERAL_CHAT_START_DEEP_RESEARCH_METHOD,
    params
  )
}

export function listGeneralChatDeepResearchForTarget(
  target: RuntimeClientTarget,
  sessionId?: string
) {
  return callRuntimeRpc<{ jobs: DeepResearchJob[] }>(
    target,
    GENERAL_CHAT_LIST_DEEP_RESEARCH_METHOD,
    sessionId ? { sessionId } : {}
  )
}

export function getGeneralChatDeepResearchForTarget(target: RuntimeClientTarget, jobId: string) {
  return callRuntimeRpc<{ job: DeepResearchJob; citations: GeneralChatSource[] }>(
    target,
    GENERAL_CHAT_GET_DEEP_RESEARCH_METHOD,
    { jobId }
  )
}

export function pauseGeneralChatDeepResearchForTarget(target: RuntimeClientTarget, jobId: string) {
  return callRuntimeRpc<{ job: DeepResearchJob }>(target, GENERAL_CHAT_PAUSE_DEEP_RESEARCH_METHOD, {
    jobId
  })
}

export function resumeGeneralChatDeepResearchForTarget(target: RuntimeClientTarget, jobId: string) {
  return callRuntimeRpc<{ job: DeepResearchJob }>(
    target,
    GENERAL_CHAT_RESUME_DEEP_RESEARCH_METHOD,
    { jobId }
  )
}

export function cancelGeneralChatDeepResearchForTarget(target: RuntimeClientTarget, jobId: string) {
  return callRuntimeRpc<{ job: DeepResearchJob }>(
    target,
    GENERAL_CHAT_CANCEL_DEEP_RESEARCH_METHOD,
    { jobId }
  )
}

export function subscribeGeneralChatDeepResearchForTarget(
  target: RuntimeClientTarget,
  params: { sessionId?: string },
  handlers: {
    onEvent: (event: DeepResearchJobsEvent) => void
    onError?: (error: unknown) => void
    onClose?: () => void
  }
) {
  return subscribeRuntimeRpc(target, GENERAL_CHAT_SUBSCRIBE_DEEP_RESEARCH_METHOD, params, {
    onEvent: (result) => {
      const parsed = DeepResearchJobsEventSchema.safeParse(result)
      if (parsed.success) {
        handlers.onEvent(parsed.data)
      }
    },
    onError: handlers.onError ?? (() => {}),
    onClose: handlers.onClose ?? (() => {})
  })
}

export function handoffGeneralChatToVideoStudioForTarget(
  target: RuntimeClientTarget,
  params: Partial<GeneralChatHandoffVideoStudioParams>
) {
  return callRuntimeRpc<{ projectId: string }>(
    target,
    GENERAL_CHAT_HANDOFF_VIDEO_STUDIO_METHOD,
    params
  )
}
