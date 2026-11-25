import * as z from 'zod'

// ─── RPC Method Constants ────────────────────────────────────────────────────

export const GENERAL_CHAT_SEARCH_WEB_METHOD = 'generalChat.searchWeb'
export const GENERAL_CHAT_LIST_SOURCES_METHOD = 'generalChat.listSources'
export const GENERAL_CHAT_DELETE_SOURCE_METHOD = 'generalChat.deleteSource'
export const GENERAL_CHAT_CLEAR_SOURCES_METHOD = 'generalChat.clearSources'

export const GENERAL_CHAT_LIST_SEARCH_PROVIDERS_METHOD = 'generalChat.listSearchProviders'
export const GENERAL_CHAT_SET_SEARCH_PROVIDER_KEY_METHOD = 'generalChat.setSearchProviderKey'

export const GENERAL_CHAT_START_DEEP_RESEARCH_METHOD = 'generalChat.startDeepResearch'
export const GENERAL_CHAT_LIST_DEEP_RESEARCH_METHOD = 'generalChat.listDeepResearch'
export const GENERAL_CHAT_GET_DEEP_RESEARCH_METHOD = 'generalChat.getDeepResearch'
export const GENERAL_CHAT_PAUSE_DEEP_RESEARCH_METHOD = 'generalChat.pauseDeepResearch'
export const GENERAL_CHAT_RESUME_DEEP_RESEARCH_METHOD = 'generalChat.resumeDeepResearch'
export const GENERAL_CHAT_CANCEL_DEEP_RESEARCH_METHOD = 'generalChat.cancelDeepResearch'
export const GENERAL_CHAT_SUBSCRIBE_DEEP_RESEARCH_METHOD = 'generalChat.subscribeDeepResearch'

export const GENERAL_CHAT_HANDOFF_VIDEO_STUDIO_METHOD = 'generalChat.handoffToVideoStudio'

// ─── Identifiers & Enums ─────────────────────────────────────────────────────

export const GeneralChatSessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((v) => !/[\\/\0]/.test(v) && !v.includes('..') && v !== '.', 'Invalid session id')

export const GeneralChatJobIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((v) => !/[\\/\0]/.test(v) && !v.includes('..') && v !== '.', 'Invalid job id')

export const GeneralChatSourceIdSchema = z.string().trim().min(1).max(160)

export const GeneralChatModeSchema = z.enum(['normal', 'web-search', 'deep-research'])
export type GeneralChatMode = z.infer<typeof GeneralChatModeSchema>

export const ConfigurableSearchProviderSchema = z.enum(['tavily', 'brave', 'exa'])
export type ConfigurableSearchProvider = z.infer<typeof ConfigurableSearchProviderSchema>

export const WebSearchProviderIdSchema = z.enum(['auto', 'duckduckgo', 'tavily', 'brave', 'exa'])
export type WebSearchProviderId = z.infer<typeof WebSearchProviderIdSchema>

export const ResolvedSearchProviderSchema = z.enum([
  'duckduckgo',
  'tavily',
  'brave',
  'exa',
  'direct-fetch'
])
export type ResolvedSearchProvider = z.infer<typeof ResolvedSearchProviderSchema>

export const GeneralChatSourceOriginSchema = z.enum(['web-search', 'deep-research', 'manual'])
export type GeneralChatSourceOrigin = z.infer<typeof GeneralChatSourceOriginSchema>

// ─── Search Provider Status & Sources ────────────────────────────────────────

export const SearchProviderStatusSchema = z.object({
  provider: z.enum(['duckduckgo', 'tavily', 'brave', 'exa']),
  configured: z.boolean(),
  requiresKey: z.boolean(),
  updatedAt: z.number().nullable()
})
export type SearchProviderStatus = z.infer<typeof SearchProviderStatusSchema>

export const GeneralChatSourceSchema = z.object({
  id: GeneralChatSourceIdSchema,
  sessionId: GeneralChatSessionIdSchema,
  query: z.string().max(1000),
  url: z.string().trim().url().max(2048),
  title: z.string().trim().min(1).max(400),
  domain: z.string().trim().min(1).max(255),
  snippet: z.string().max(1000),
  extractedText: z.string().max(8000).optional(),
  provider: ResolvedSearchProviderSchema,
  origin: GeneralChatSourceOriginSchema,
  jobId: GeneralChatJobIdSchema.optional(),
  fetchedAt: z.number().nonnegative()
})
export type GeneralChatSource = z.infer<typeof GeneralChatSourceSchema>

// ─── Deep Research Job Models ────────────────────────────────────────────────

export const DeepResearchStepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'skipped',
  'failed'
])
export type DeepResearchStepStatus = z.infer<typeof DeepResearchStepStatusSchema>

export const DeepResearchPlanStepSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(300),
  query: z.string().trim().min(1).max(600),
  status: DeepResearchStepStatusSchema,
  sourceIds: z.array(GeneralChatSourceIdSchema).default([]),
  note: z.string().max(1000).optional()
})
export type DeepResearchPlanStep = z.infer<typeof DeepResearchPlanStepSchema>

export const DeepResearchJobStatusSchema = z.enum([
  'queued',
  'planning',
  'searching',
  'reading',
  'synthesizing',
  'paused',
  'completed',
  'cancelled',
  'failed'
])
export type DeepResearchJobStatus = z.infer<typeof DeepResearchJobStatusSchema>

export const ACTIVE_DEEP_RESEARCH_STATUSES = [
  'queued',
  'planning',
  'searching',
  'reading',
  'synthesizing'
] as const

export const DeepResearchJobSchema = z.object({
  id: GeneralChatJobIdSchema,
  sessionId: GeneralChatSessionIdSchema.optional(),
  agent: z.string().trim().min(1).max(64).optional(),
  topic: z.string().trim().min(1).max(1000),
  providerPreference: WebSearchProviderIdSchema.default('auto'),
  status: DeepResearchJobStatusSchema,
  steps: z.array(DeepResearchPlanStepSchema).default([]),
  currentStepIndex: z.number().int().nonnegative().default(0),
  queriesExecuted: z.number().int().nonnegative().default(0),
  sourcesCollected: z.number().int().nonnegative().default(0),
  pagesRead: z.number().int().nonnegative().default(0),
  citationIds: z.array(GeneralChatSourceIdSchema).default([]),
  reportMarkdown: z.string().max(120_000).optional(),
  handoffProjectId: z.string().trim().min(1).optional(),
  errorMessage: z.string().max(2000).optional(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  startedAt: z.number().nonnegative().optional(),
  completedAt: z.number().nonnegative().optional()
})
export type DeepResearchJob = z.infer<typeof DeepResearchJobSchema>

export const DeepResearchJobsEventSchema = z.object({
  revision: z.number().int().nonnegative(),
  jobs: z.array(DeepResearchJobSchema)
})
export type DeepResearchJobsEvent = z.infer<typeof DeepResearchJobsEventSchema>

// ─── RPC Params & Results ────────────────────────────────────────────────────

export const GeneralChatSearchWebParams = z.strictObject({
  sessionId: GeneralChatSessionIdSchema.optional(),
  query: z.string().trim().min(1).max(1000),
  provider: WebSearchProviderIdSchema.default('auto'),
  maxResults: z.number().int().min(1).max(10).default(5),
  fetchTopPages: z.number().int().min(0).max(5).default(3)
})
export type GeneralChatSearchWebParams = z.infer<typeof GeneralChatSearchWebParams>

export const GeneralChatSearchWebResult = z.object({
  query: z.string(),
  providerUsed: ResolvedSearchProviderSchema,
  fallbackUsed: z.boolean(),
  warnings: z.array(z.string()).default([]),
  sources: z.array(GeneralChatSourceSchema),
  allSessionSources: z.array(GeneralChatSourceSchema)
})
export type GeneralChatSearchWebResult = z.infer<typeof GeneralChatSearchWebResult>

export const GeneralChatListSourcesParams = z.strictObject({
  sessionId: GeneralChatSessionIdSchema
})
export const GeneralChatListSourcesResult = z.object({
  sources: z.array(GeneralChatSourceSchema)
})

export const GeneralChatDeleteSourceParams = z.strictObject({
  sessionId: GeneralChatSessionIdSchema,
  sourceId: GeneralChatSourceIdSchema
})
export const GeneralChatClearSourcesParams = z.strictObject({
  sessionId: GeneralChatSessionIdSchema
})

export const GeneralChatListSearchProvidersParams = z.strictObject({})
export const GeneralChatListSearchProvidersResult = z.object({
  providers: z.array(SearchProviderStatusSchema)
})

export const GeneralChatSetSearchProviderKeyParams = z.strictObject({
  provider: ConfigurableSearchProviderSchema,
  apiKey: z.string().max(500)
})
export const GeneralChatSetSearchProviderKeyResult = z.object({
  providers: z.array(SearchProviderStatusSchema)
})

export const GeneralChatStartDeepResearchParams = z.strictObject({
  sessionId: GeneralChatSessionIdSchema.optional(),
  agent: z.string().trim().min(1).max(64).optional(),
  topic: z.string().trim().min(1).max(1000),
  provider: WebSearchProviderIdSchema.default('auto'),
  maxSteps: z.number().int().min(2).max(6).default(4)
})
export type GeneralChatStartDeepResearchParams = z.infer<typeof GeneralChatStartDeepResearchParams>

export const GeneralChatListDeepResearchParams = z.strictObject({
  sessionId: GeneralChatSessionIdSchema.optional()
})
export const GeneralChatListDeepResearchResult = z.object({
  jobs: z.array(DeepResearchJobSchema)
})

export const GeneralChatDeepResearchJobActionParams = z.strictObject({
  jobId: GeneralChatJobIdSchema
})
export const GeneralChatGetDeepResearchResult = z.object({
  job: DeepResearchJobSchema,
  citations: z.array(GeneralChatSourceSchema)
})

export const GeneralChatSubscribeDeepResearchParams = z.strictObject({
  sessionId: GeneralChatSessionIdSchema.optional()
})

export const GeneralChatHandoffVideoStudioParams = z.strictObject({
  jobId: GeneralChatJobIdSchema.optional(),
  sessionId: GeneralChatSessionIdSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  briefMarkdown: z.string().max(60_000).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  durationSeconds: z.number().int().min(5).max(3600).default(45),
  engine: z.enum(['hyperframes', 'remotion']).default('hyperframes')
})
export type GeneralChatHandoffVideoStudioParams = z.infer<
  typeof GeneralChatHandoffVideoStudioParams
>

export const GeneralChatHandoffVideoStudioResult = z.object({
  projectId: z.string().trim().min(1)
})

// ─── Pure Domain Helpers ─────────────────────────────────────────────────────

export function isActiveDeepResearchStatus(status: DeepResearchJobStatus): boolean {
  return (
    status === 'queued' ||
    status === 'planning' ||
    status === 'searching' ||
    status === 'reading' ||
    status === 'synthesizing'
  )
}

export function canPauseDeepResearch(status: DeepResearchJobStatus): boolean {
  return isActiveDeepResearchStatus(status)
}

export function canResumeDeepResearch(status: DeepResearchJobStatus): boolean {
  return status === 'paused' || status === 'failed'
}

export function canCancelDeepResearch(status: DeepResearchJobStatus): boolean {
  return isActiveDeepResearchStatus(status) || status === 'paused'
}

export function formatWebSearchContextPrompt(
  query: string,
  sources: readonly GeneralChatSource[],
  maxSources = 5
): string {
  const picked = sources.slice(0, maxSources)
  if (picked.length === 0) {
    return query
  }
  const citations = picked
    .map((source, index) => {
      const body = (source.extractedText ?? source.snippet).replace(/\s+/g, ' ').trim()
      const excerpt = body.length > 360 ? `${body.slice(0, 357)}...` : body
      return `[${index + 1}] ${source.title} (${source.url})${excerpt ? ` — ${excerpt}` : ''}`
    })
    .join('\n')
  return `${query}\n\n[Web Search Context — cite supporting URLs inline]\n${citations}`
}
