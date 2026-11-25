import * as z from 'zod'
import type { ConfigurableSearchProvider } from '../../../shared/general-chat/general-chat-research-contract'
import type { RawSearchCandidate } from './duckduckgo-search-adapter'

const TavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string().optional(),
        content: z.string().optional()
      })
    )
    .default([])
})

const BraveResponseSchema = z.object({
  web: z
    .object({
      results: z
        .array(
          z.object({
            url: z.string().url(),
            title: z.string().optional(),
            description: z.string().optional()
          })
        )
        .default([])
    })
    .optional()
})

const ExaResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string().nullable().optional(),
        text: z.string().optional(),
        highlights: z.array(z.string()).optional()
      })
    )
    .default([])
})

type ProviderRequestSpec = {
  buildRequest: (
    query: string,
    maxResults: number,
    apiKey: string
  ) => { url: string; init: RequestInit }
  parseResponse: (json: unknown, maxResults: number) => RawSearchCandidate[]
}

const PROVIDER_ADAPTERS: Record<ConfigurableSearchProvider, ProviderRequestSpec> = {
  tavily: {
    buildRequest: (query, maxResults, apiKey) => ({
      url: 'https://api.tavily.com/search',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          search_depth: 'basic'
        })
      }
    }),
    parseResponse: (json, maxResults) => {
      const parsed = TavilyResponseSchema.parse(json)
      return parsed.results.slice(0, maxResults).map((entry) => ({
        url: entry.url,
        title: entry.title?.trim() || entry.url,
        snippet: entry.content?.trim() ?? ''
      }))
    }
  },
  brave: {
    buildRequest: (query, maxResults, apiKey) => {
      const url = new URL('https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q', query)
      url.searchParams.set('count', String(maxResults))
      return {
        url: url.toString(),
        init: {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'X-Subscription-Token': apiKey
          }
        }
      }
    },
    parseResponse: (json, maxResults) => {
      const parsed = BraveResponseSchema.parse(json)
      return (parsed.web?.results ?? []).slice(0, maxResults).map((entry) => ({
        url: entry.url,
        title: entry.title?.trim() || entry.url,
        snippet: entry.description?.trim() ?? ''
      }))
    }
  },
  exa: {
    buildRequest: (query, maxResults, apiKey) => ({
      url: 'https://api.exa.ai/search',
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          query,
          numResults: maxResults,
          contents: { highlights: { numSentences: 2 } }
        })
      }
    }),
    parseResponse: (json, maxResults) => {
      const parsed = ExaResponseSchema.parse(json)
      return parsed.results.slice(0, maxResults).map((entry) => ({
        url: entry.url,
        title: entry.title?.trim() || entry.url,
        snippet: entry.highlights?.[0]?.trim() ?? entry.text?.slice(0, 400).trim() ?? ''
      }))
    }
  }
}

export async function searchConfiguredApiProvider(
  provider: ConfigurableSearchProvider,
  apiKey: string,
  query: string,
  maxResults: number,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<RawSearchCandidate[]> {
  const spec = PROVIDER_ADAPTERS[provider]
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutSignal = AbortSignal.timeout(12_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal
  const { url, init } = spec.buildRequest(query, maxResults, apiKey)
  const response = await fetchImpl(url, { ...init, signal })
  if (!response.ok) {
    throw new Error(`${provider} search failed with status ${response.status}`)
  }
  const payload: unknown = await response.json()
  return spec.parseResponse(payload, maxResults)
}
