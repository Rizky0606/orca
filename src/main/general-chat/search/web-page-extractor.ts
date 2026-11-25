import { decodeHtmlEntities, stripHtmlInline } from './duckduckgo-search-adapter'
import { guardedWebFetch, type SsrfLookupFn } from './web-fetch-ssrf-guard'

const MAX_RESPONSE_BYTES = 512 * 1024
const MAX_EXTRACTED_CHARS = 8000

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text()
    return text.slice(0, MAX_RESPONSE_BYTES)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (totalBytes < MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read()
    if (done || !value) {
      break
    }
    const remaining = MAX_RESPONSE_BYTES - totalBytes
    chunks.push(value.byteLength > remaining ? value.subarray(0, remaining) : value)
    totalBytes += chunks.at(-1)!.byteLength
  }
  await reader.cancel().catch(() => undefined)
  return Buffer.concat(chunks).toString('utf8')
}

export function extractTextFromHtml(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? stripHtmlInline(titleMatch[1] ?? '') : undefined
  const bodyWithoutNoise = html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|noscript|svg|template|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const decoded = decodeHtmlEntities(bodyWithoutNoise)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return {
    title: title || undefined,
    text: decoded.slice(0, MAX_EXTRACTED_CHARS)
  }
}

export async function fetchAndExtractWebPage(
  url: string,
  options: { fetchImpl?: typeof fetch; lookup?: SsrfLookupFn; signal?: AbortSignal } = {}
): Promise<{ finalUrl: string; title?: string; text: string } | null> {
  const fetched = await guardedWebFetch(url, options)
  if (!fetched.response.ok) {
    return null
  }
  const contentType = fetched.response.headers.get('content-type')?.toLowerCase() ?? ''
  if (
    contentType &&
    !contentType.includes('text/') &&
    !contentType.includes('html') &&
    !contentType.includes('json') &&
    !contentType.includes('xml')
  ) {
    return null
  }
  const raw = await readBoundedText(fetched.response)
  if (contentType.includes('text/plain') || contentType.includes('application/json')) {
    return {
      finalUrl: fetched.url,
      text: raw.trim().slice(0, MAX_EXTRACTED_CHARS)
    }
  }
  const extracted = extractTextFromHtml(raw)
  return {
    finalUrl: fetched.url,
    title: extracted.title,
    text: extracted.text
  }
}
