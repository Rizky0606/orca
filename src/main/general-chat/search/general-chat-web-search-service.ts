import { createHash } from 'node:crypto'
import type {
  ConfigurableSearchProvider,
  GeneralChatSource,
  GeneralChatSourceOrigin,
  ResolvedSearchProvider,
  SearchProviderStatus,
  WebSearchProviderId
} from '../../../shared/general-chat/general-chat-research-contract'
import { searchConfiguredApiProvider } from './api-search-adapters'
import { searchDuckDuckGo, type RawSearchCandidate } from './duckduckgo-search-adapter'
import {
  getSharedSearchProviderKeyStore,
  type SearchProviderKeyStore
} from './search-provider-key-store'
import { assertSafePublicWebUrl, type SsrfLookupFn } from './web-fetch-ssrf-guard'
import { fetchAndExtractWebPage } from './web-page-extractor'

export const GENERAL_CHAT_SEARCH_FAILED_CODE = 'general_chat_search_failed'

const API_PROVIDER_PRIORITY: readonly ConfigurableSearchProvider[] = ['tavily', 'brave', 'exa']

export type WebSearchServiceDeps = {
  keyStore?: SearchProviderKeyStore
  fetchImpl?: typeof fetch
  lookup?: SsrfLookupFn
}

export type ExecuteWebSearchInput = {
  sessionId: string
  query: string
  providerPreference?: WebSearchProviderId
  maxResults?: number
  fetchTopPages?: number
  origin?: GeneralChatSourceOrigin
  jobId?: string
  signal?: AbortSignal
}

export type ExecuteWebSearchOutput = {
  query: string
  providerUsed: ResolvedSearchProvider
  fallbackUsed: boolean
  warnings: string[]
  sources: GeneralChatSource[]
}

export function deterministicSourceId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 24)
}

export class GeneralChatWebSearchService {
  private readonly keyStore: SearchProviderKeyStore
  private readonly fetchImpl?: typeof fetch
  private readonly lookup?: SsrfLookupFn

  constructor(deps: WebSearchServiceDeps = {}) {
    this.keyStore = deps.keyStore ?? getSharedSearchProviderKeyStore()
    this.fetchImpl = deps.fetchImpl
    this.lookup = deps.lookup
  }

  listProviderStatuses(): Promise<SearchProviderStatus[]> {
    return this.keyStore.listStatuses()
  }

  setProviderApiKey(
    provider: ConfigurableSearchProvider,
    apiKey: string
  ): Promise<SearchProviderStatus[]> {
    return this.keyStore.setApiKey(provider, apiKey)
  }

  private async resolveAttempts(
    preference: WebSearchProviderId
  ): Promise<{ provider: 'duckduckgo' | ConfigurableSearchProvider; apiKey?: string }[]> {
    if (preference === 'duckduckgo') {
      return [{ provider: 'duckduckgo' }]
    }
    const attempts: {
      provider: 'duckduckgo' | ConfigurableSearchProvider
      apiKey?: string
    }[] = []
    const ordered: ConfigurableSearchProvider[] =
      preference === 'auto'
        ? [...API_PROVIDER_PRIORITY]
        : [preference, ...API_PROVIDER_PRIORITY.filter((entry) => entry !== preference)]
    for (const provider of ordered) {
      const key = await this.keyStore.getApiKey(provider)
      if (key) {
        attempts.push({ provider, apiKey: key })
      }
    }
    attempts.push({ provider: 'duckduckgo' })
    return attempts
  }

  async search(input: ExecuteWebSearchInput): Promise<ExecuteWebSearchOutput> {
    const preference = input.providerPreference ?? 'auto'
    const maxResults = input.maxResults ?? 5
    const fetchTopPages = input.fetchTopPages ?? 3
    const attempts = await this.resolveAttempts(preference)
    const warnings: string[] = []

    let candidates: RawSearchCandidate[] = []
    let providerUsed: ResolvedSearchProvider = 'duckduckgo'
    let fallbackUsed = false

    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i]!
      try {
        candidates =
          attempt.provider === 'duckduckgo'
            ? await searchDuckDuckGo(input.query, maxResults, {
                fetchImpl: this.fetchImpl,
                signal: input.signal
              })
            : await searchConfiguredApiProvider(
                attempt.provider,
                attempt.apiKey!,
                input.query,
                maxResults,
                { fetchImpl: this.fetchImpl, signal: input.signal }
              )
        providerUsed = attempt.provider
        fallbackUsed = i > 0
        break
      } catch (error) {
        warnings.push(
          `${attempt.provider}: ${error instanceof Error ? error.message : 'search error'}`
        )
      }
    }

    if (candidates.length === 0 && warnings.length > 0 && providerUsed === 'duckduckgo') {
      throw new Error(GENERAL_CHAT_SEARCH_FAILED_CODE)
    }

    const safeCandidates: { url: string; domain: string; title: string; snippet: string }[] = []
    for (const candidate of candidates) {
      try {
        const safeUrl = await assertSafePublicWebUrl(candidate.url, { lookup: this.lookup })
        safeCandidates.push({
          url: safeUrl.toString(),
          domain: safeUrl.hostname.replace(/^www\./, ''),
          title: candidate.title.slice(0, 400),
          snippet: candidate.snippet.slice(0, 1000)
        })
      } catch {
        // Skip unsafe or invalid candidate URLs without failing the whole query.
      }
    }

    const now = Date.now()
    const enrichedTexts = await Promise.all(
      safeCandidates.map(async (candidate, index) => {
        if (index >= fetchTopPages) {
          return undefined
        }
        return fetchAndExtractWebPage(candidate.url, {
          fetchImpl: this.fetchImpl,
          lookup: this.lookup,
          signal: input.signal
        }).catch(() => null)
      })
    )

    const sources: GeneralChatSource[] = safeCandidates.map((candidate, index) => {
      const extracted = enrichedTexts[index]
      return {
        id: deterministicSourceId(candidate.url),
        sessionId: input.sessionId,
        query: input.query,
        url: candidate.url,
        title: (extracted?.title || candidate.title).slice(0, 400),
        domain: candidate.domain,
        snippet: candidate.snippet,
        extractedText: extracted?.text || undefined,
        provider: providerUsed,
        origin: input.origin ?? 'web-search',
        jobId: input.jobId,
        fetchedAt: now
      }
    })

    return {
      query: input.query,
      providerUsed,
      fallbackUsed,
      warnings,
      sources
    }
  }
}
