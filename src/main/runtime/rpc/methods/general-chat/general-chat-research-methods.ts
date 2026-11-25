import {
  GENERAL_CHAT_CANCEL_DEEP_RESEARCH_METHOD,
  GENERAL_CHAT_CLEAR_SOURCES_METHOD,
  GENERAL_CHAT_DELETE_SOURCE_METHOD,
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
  GeneralChatClearSourcesParams,
  GeneralChatDeepResearchJobActionParams,
  GeneralChatDeleteSourceParams,
  GeneralChatHandoffVideoStudioParams,
  GeneralChatListDeepResearchParams,
  GeneralChatListSearchProvidersParams,
  GeneralChatListSourcesParams,
  GeneralChatSearchWebParams,
  GeneralChatSetSearchProviderKeyParams,
  GeneralChatStartDeepResearchParams,
  GeneralChatSubscribeDeepResearchParams
} from '../../../../../shared/general-chat/general-chat-research-contract'
import { openGeneralChatDeepResearchManager } from '../../../../general-chat/research/general-chat-research-registry'
import type { ResearchTextGenerator } from '../../../../general-chat/research/general-chat-research-synthesis'
import { GeneralChatSourceStore } from '../../../../general-chat/research/general-chat-source-store'
import { handoffGeneralChatToVideoStudio } from '../../../../general-chat/research/general-chat-video-handoff'
import { GeneralChatWebSearchService } from '../../../../general-chat/search/general-chat-web-search-service'
import { getStructuredAgentSessionHost } from '../../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import { defineMethod, defineStreamingMethod, type RpcContext } from '../../core'
import { bindRpcSubscriptionStream } from '../../core-subscription-stream'

function profileDirectory({ runtime }: RpcContext): string {
  const directory = runtime.requireStore().getProfileStorageDirectory?.()
  if (!directory) {
    throw new Error('runtime_unavailable')
  }
  return directory
}

function createHostTextGenerator(sessionId?: string): ResearchTextGenerator | undefined {
  if (!sessionId) {
    return undefined
  }
  const host = getStructuredAgentSessionHost()
  const generateText = host?.deps.adapter.generateText
  const session = host?.deps.store.getRecord(sessionId)
  if (!generateText || !session) {
    return undefined
  }
  return (prompt: string) =>
    generateText({
      agent: session.provider,
      accountHome: session.accountHome,
      prompt
    }).catch(() => null)
}

const searchService = new GeneralChatWebSearchService()

export const GENERAL_CHAT_RESEARCH_METHODS = [
  defineMethod({
    name: GENERAL_CHAT_SEARCH_WEB_METHOD,
    permission: 'workspace',
    params: GeneralChatSearchWebParams,
    handler: async (params, context) => {
      const directory = profileDirectory(context)
      const sessionId = params.sessionId ?? 'default-scratch'
      const result = await searchService.search({
        sessionId,
        query: params.query,
        providerPreference: params.provider,
        maxResults: params.maxResults,
        fetchTopPages: params.fetchTopPages,
        origin: 'web-search'
      })
      const sourceStore = new GeneralChatSourceStore(directory)
      const allSessionSources = params.sessionId
        ? await sourceStore.appendSessionSources(params.sessionId, result.sources)
        : result.sources
      return {
        ...result,
        allSessionSources
      }
    }
  }),
  defineMethod({
    name: GENERAL_CHAT_LIST_SOURCES_METHOD,
    permission: 'workspace',
    params: GeneralChatListSourcesParams,
    handler: async ({ sessionId }, context) => ({
      sources: await new GeneralChatSourceStore(profileDirectory(context)).listSessionSources(
        sessionId
      )
    })
  }),
  defineMethod({
    name: GENERAL_CHAT_DELETE_SOURCE_METHOD,
    permission: 'workspace',
    params: GeneralChatDeleteSourceParams,
    handler: async ({ sessionId, sourceId }, context) => ({
      sources: await new GeneralChatSourceStore(profileDirectory(context)).removeSessionSource(
        sessionId,
        sourceId
      )
    })
  }),
  defineMethod({
    name: GENERAL_CHAT_CLEAR_SOURCES_METHOD,
    permission: 'workspace',
    params: GeneralChatClearSourcesParams,
    handler: async ({ sessionId }, context) => ({
      sources: await new GeneralChatSourceStore(profileDirectory(context)).clearSessionSources(
        sessionId
      )
    })
  }),
  defineMethod({
    name: GENERAL_CHAT_LIST_SEARCH_PROVIDERS_METHOD,
    permission: 'workspace',
    params: GeneralChatListSearchProvidersParams,
    handler: async () => ({
      providers: await searchService.listProviderStatuses()
    })
  }),
  defineMethod({
    name: GENERAL_CHAT_SET_SEARCH_PROVIDER_KEY_METHOD,
    permission: 'workspace',
    params: GeneralChatSetSearchProviderKeyParams,
    handler: async ({ provider, apiKey }) => ({
      providers: await searchService.setProviderApiKey(provider, apiKey)
    })
  }),
  defineMethod({
    name: GENERAL_CHAT_START_DEEP_RESEARCH_METHOD,
    permission: 'workspace',
    params: GeneralChatStartDeepResearchParams,
    handler: async (params, context) => {
      const directory = profileDirectory(context)
      const manager = await openGeneralChatDeepResearchManager(directory, {
        searchService,
        generateText: createHostTextGenerator(params.sessionId)
      })
      return { job: await manager.start(params) }
    }
  }),
  defineMethod({
    name: GENERAL_CHAT_LIST_DEEP_RESEARCH_METHOD,
    permission: 'workspace',
    params: GeneralChatListDeepResearchParams,
    handler: async ({ sessionId }, context) => {
      const manager = await openGeneralChatDeepResearchManager(profileDirectory(context), {
        searchService
      })
      return { jobs: (await manager.listSnapshots(sessionId)).jobs }
    }
  }),
  defineMethod({
    name: GENERAL_CHAT_GET_DEEP_RESEARCH_METHOD,
    permission: 'workspace',
    params: GeneralChatDeepResearchJobActionParams,
    handler: async ({ jobId }, context) => {
      const manager = await openGeneralChatDeepResearchManager(profileDirectory(context), {
        searchService
      })
      return manager.getJobWithCitations(jobId)
    }
  }),
  defineMethod({
    name: GENERAL_CHAT_PAUSE_DEEP_RESEARCH_METHOD,
    permission: 'workspace',
    params: GeneralChatDeepResearchJobActionParams,
    handler: async ({ jobId }, context) => {
      const manager = await openGeneralChatDeepResearchManager(profileDirectory(context), {
        searchService
      })
      return { job: await manager.pause(jobId) }
    }
  }),
  defineMethod({
    name: GENERAL_CHAT_RESUME_DEEP_RESEARCH_METHOD,
    permission: 'workspace',
    params: GeneralChatDeepResearchJobActionParams,
    handler: async ({ jobId }, context) => {
      const manager = await openGeneralChatDeepResearchManager(profileDirectory(context), {
        searchService
      })
      return { job: await manager.resume(jobId) }
    }
  }),
  defineMethod({
    name: GENERAL_CHAT_CANCEL_DEEP_RESEARCH_METHOD,
    permission: 'workspace',
    params: GeneralChatDeepResearchJobActionParams,
    handler: async ({ jobId }, context) => {
      const manager = await openGeneralChatDeepResearchManager(profileDirectory(context), {
        searchService
      })
      return { job: await manager.cancel(jobId) }
    }
  }),
  defineStreamingMethod({
    name: GENERAL_CHAT_SUBSCRIBE_DEEP_RESEARCH_METHOD,
    permission: 'workspace',
    params: GeneralChatSubscribeDeepResearchParams,
    handler: async (params, context, emit) => {
      const manager = await openGeneralChatDeepResearchManager(profileDirectory(context), {
        searchService
      })
      const frame = context.requestId ? `:${context.requestId}` : ''
      const subscriptionId = `generalChat:research:${context.connectionId ?? 'local'}${frame}`
      let dispose = (): void => {}
      const stream = bindRpcSubscriptionStream(context, subscriptionId, () => dispose())
      if (stream.isClosed()) {
        return
      }
      dispose = manager.subscribe(() => {
        if (!stream.isClosed()) {
          void manager.listSnapshots(params.sessionId).then((snapshot) => {
            if (!stream.isClosed()) {
              emit(snapshot)
            }
          })
        }
      })
      emit(await manager.listSnapshots(params.sessionId))
      if (stream.isClosed()) {
        dispose()
      }
    }
  }),
  defineMethod({
    name: GENERAL_CHAT_HANDOFF_VIDEO_STUDIO_METHOD,
    permission: 'workspace',
    params: GeneralChatHandoffVideoStudioParams,
    handler: async (params, context) =>
      handoffGeneralChatToVideoStudio(profileDirectory(context), params)
  })
]
