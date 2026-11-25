export type RawSearchCandidate = {
  url: string
  title: string
  snippet: string
}

const ENTITY_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
  [/&nbsp;/gi, ' ']
]

export function decodeHtmlEntities(input: string): string {
  let out = input
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const value = Number.parseInt(code, 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : ''
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const value = Number.parseInt(hex, 16)
      return Number.isFinite(value) ? String.fromCodePoint(value) : ''
    })
}

export function stripHtmlInline(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveDuckDuckGoHref(href: string): string | null {
  const cleanHref = decodeHtmlEntities(href.trim())
  if (!cleanHref) {
    return null
  }
  try {
    const url = cleanHref.startsWith('//')
      ? new URL(`https:${cleanHref}`)
      : cleanHref.startsWith('/')
        ? new URL(`https://duckduckgo.com${cleanHref}`)
        : new URL(cleanHref)
    if (
      url.hostname === 'duckduckgo.com' ||
      url.hostname === 'html.duckduckgo.com' ||
      url.hostname === 'lite.duckduckgo.com'
    ) {
      const target = url.searchParams.get('uddg')
      if (!target) {
        return null
      }
      const parsedTarget = new URL(target)
      if (parsedTarget.protocol === 'http:' || parsedTarget.protocol === 'https:') {
        return parsedTarget.toString()
      }
      return null
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
    return null
  } catch {
    return null
  }
}

export function parseDuckDuckGoHtmlResults(html: string, maxResults: number): RawSearchCandidate[] {
  const candidates: RawSearchCandidate[] = []
  const seenUrls = new Set<string>()
  const anchorRegex =
    /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex =
    /<(?:a|div|span)\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi

  const anchors: { url: string; title: string; index: number }[] = []
  for (const match of html.matchAll(anchorRegex)) {
    const rawHref = match[1] ?? ''
    const rawTitle = match[2] ?? ''
    const resolved = resolveDuckDuckGoHref(rawHref)
    const title = stripHtmlInline(rawTitle)
    if (resolved && title && !seenUrls.has(resolved)) {
      seenUrls.add(resolved)
      anchors.push({ url: resolved, title, index: match.index ?? 0 })
    }
  }

  const snippets: { text: string; index: number }[] = []
  for (const match of html.matchAll(snippetRegex)) {
    snippets.push({
      text: stripHtmlInline(match[1] ?? ''),
      index: match.index ?? 0
    })
  }

  for (let i = 0; i < anchors.length && candidates.length < maxResults; i += 1) {
    const anchor = anchors[i]!
    const nextAnchorIndex = anchors[i + 1]?.index ?? Number.POSITIVE_INFINITY
    const matchedSnippet = snippets.find(
      (entry) => entry.index > anchor.index && entry.index < nextAnchorIndex
    )
    candidates.push({
      url: anchor.url,
      title: anchor.title,
      snippet: matchedSnippet?.text ?? ''
    })
  }
  return candidates
}

async function fetchDuckDuckGoInstantAnswer(
  query: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<RawSearchCandidate[]> {
  const endpoint = new URL('https://api.duckduckgo.com/')
  endpoint.searchParams.set('q', query)
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('no_html', '1')
  endpoint.searchParams.set('skip_disambig', '1')

  const timeoutSignal = AbortSignal.timeout(8_000)
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const response = await fetchImpl(endpoint.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: combined
  })
  if (!response.ok) {
    return []
  }
  const payload: unknown = await response.json()
  if (typeof payload !== 'object' || payload === null) {
    return []
  }
  const abstractUrl = 'AbstractURL' in payload ? payload.AbstractURL : undefined
  const heading = 'Heading' in payload ? payload.Heading : undefined
  const abstractText = 'AbstractText' in payload ? payload.AbstractText : undefined
  const out: RawSearchCandidate[] = []
  if (
    typeof abstractUrl === 'string' &&
    abstractUrl.startsWith('http') &&
    typeof heading === 'string' &&
    heading.trim()
  ) {
    out.push({
      url: abstractUrl,
      title: heading.trim(),
      snippet: typeof abstractText === 'string' ? abstractText.trim() : ''
    })
  }
  const relatedTopics =
    'RelatedTopics' in payload && Array.isArray(payload.RelatedTopics) ? payload.RelatedTopics : []
  for (const item of relatedTopics) {
    if (typeof item === 'object' && item !== null) {
      const firstUrl = 'FirstURL' in item ? item.FirstURL : undefined
      const text = 'Text' in item ? item.Text : undefined
      if (
        typeof firstUrl === 'string' &&
        firstUrl.startsWith('http') &&
        typeof text === 'string' &&
        text.trim()
      ) {
        out.push({
          url: firstUrl,
          title: text.split(' - ')[0]?.trim() || text.trim(),
          snippet: text.trim()
        })
      }
    }
  }
  return out
}

export async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<RawSearchCandidate[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = new URL('https://html.duckduckgo.com/html/')
  endpoint.searchParams.set('q', query)
  const timeoutSignal = AbortSignal.timeout(10_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal

  const response = await fetchImpl(endpoint.toString(), {
    method: 'GET',
    headers: {
      'user-agent': 'OrcaResearch/1.0 (+https://github.com/orca-ai)',
      accept: 'text/html,application/xhtml+xml'
    },
    signal
  })
  if (response.ok) {
    const html = await response.text()
    const parsed = parseDuckDuckGoHtmlResults(html, maxResults)
    if (parsed.length > 0) {
      return parsed
    }
  }
  return (await fetchDuckDuckGoInstantAnswer(query, fetchImpl, options.signal)).slice(0, maxResults)
}
