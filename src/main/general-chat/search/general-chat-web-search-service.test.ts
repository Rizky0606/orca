import { expect, it } from 'vitest'
import { SearchProviderKeyStore, type SearchKeyBackingStore } from './search-provider-key-store'
import { GeneralChatWebSearchService } from './general-chat-web-search-service'

function createMemoryKeyStore(): SearchKeyBackingStore {
  let stored: string | null = null
  return {
    read: async () => stored,
    write: async (value) => {
      stored = value
    },
    clear: async () => {
      stored = null
    }
  }
}

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

it('redacts stored API keys from provider status listings and allows removal', async () => {
  const keyStore = new SearchProviderKeyStore(createMemoryKeyStore())
  const updated = await keyStore.setApiKey('tavily', 'tvly-secret-12345')
  const tavily = updated.find((entry) => entry.provider === 'tavily')
  expect(tavily).toMatchObject({ provider: 'tavily', configured: true, requiresKey: true })
  expect(JSON.stringify(updated)).not.toContain('tvly-secret-12345')
  expect(await keyStore.getApiKey('tavily')).toBe('tvly-secret-12345')

  const cleared = await keyStore.setApiKey('tavily', '')
  expect(cleared.find((entry) => entry.provider === 'tavily')?.configured).toBe(false)
  expect(await keyStore.getApiKey('tavily')).toBeNull()
})

it('falls back to DuckDuckGo HTML results when configured API provider fails and filters private URLs', async () => {
  const keyStore = new SearchProviderKeyStore(createMemoryKeyStore())
  await keyStore.setApiKey('tavily', 'tvly-key')

  const duckHtml = `
    <div class="result">
      <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fguide">Public Guide</a>
      <a class="result__snippet">Helpful architecture summary.</a>
    </div>
    <div class="result">
      <a class="result__a" href="http://127.0.0.1/secret">Localhost Trap</a>
      <a class="result__snippet">Should be dropped by SSRF guard.</a>
    </div>
  `

  const fetchMock: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('https://api.tavily.com/')) {
      return new Response('rate limited', { status: 429 })
    }
    if (url.startsWith('https://html.duckduckgo.com/')) {
      return new Response(duckHtml, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url === 'https://example.com/guide') {
      return new Response(
        '<html><head><title>Public Guide</title></head><body><script>ignore()</script><p>Extracted clean body.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    }
    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  const service = new GeneralChatWebSearchService({
    keyStore,
    fetchImpl: fetchMock,
    lookup: publicLookup
  })

  const result = await service.search({
    sessionId: 'sess-1',
    query: 'architecture guide',
    fetchTopPages: 1
  })

  expect(result.providerUsed).toBe('duckduckgo')
  expect(result.fallbackUsed).toBe(true)
  expect(result.warnings).toHaveLength(1)
  expect(result.sources).toHaveLength(1)
  expect(result.sources[0]).toMatchObject({
    url: 'https://example.com/guide',
    title: 'Public Guide',
    extractedText: 'Extracted clean body.'
  })
})
