import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { VideoStudioResearchSource } from '../../../shared/video-studio/video-studio-storyboard-contract'

const SOURCES_START_MARKER = '<!-- orca-sources:start -->'
const SOURCES_END_MARKER = '<!-- orca-sources:end -->'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function detectLineEnding(raw: string): '\n' | '\r\n' {
  return raw.includes('\r\n') ? '\r\n' : '\n'
}

export function applyLineEnding(text: string, eol: '\n' | '\r\n'): string {
  const lf = text.replace(/\r\n/g, '\n')
  return eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf
}

/** Extracts YAML frontmatter and body while preserving line ending metadata. */
export function splitYamlFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>
  body: string
  hasFrontmatter: boolean
  eol: '\n' | '\r\n'
} {
  const eol = detectLineEnding(raw)
  const stripped = raw.startsWith('\uFEFF') ? raw.slice(1) : raw
  const lf = stripped.replace(/\r\n/g, '\n')
  const lines = lf.split('\n')
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: lf, hasFrontmatter: false, eol }
  }
  const endIdx = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (endIdx === -1) {
    return { frontmatter: {}, body: lf, hasFrontmatter: false, eol }
  }
  const yamlText = lines.slice(1, endIdx).join('\n')
  const parsed: unknown = yamlText.trim() ? parseYaml(yamlText) : {}
  const frontmatter = isPlainRecord(parsed) ? parsed : {}
  const body = lines.slice(endIdx + 1).join('\n')
  return { frontmatter, body, hasFrontmatter: true, eol }
}

/** Formats a frontmatter object as a standard YAML block ending with a newline. */
export function formatYamlFrontmatter(data: Record<string, unknown>): string {
  if (Object.keys(data).length === 0) {
    return ''
  }
  return `---\n${stringifyYaml(data, { lineWidth: 0 }).trimEnd()}\n---\n`
}

export function updateBriefMarkdown(
  existingRaw: string,
  params: { frontmatter?: Record<string, unknown>; briefMarkdown?: string }
): string {
  const baseRaw = params.briefMarkdown ?? existingRaw
  const eol = detectLineEnding(baseRaw || existingRaw)
  if (!params.frontmatter) {
    return applyLineEnding(baseRaw, eol)
  }
  const parsed = splitYamlFrontmatter(baseRaw)
  const merged = { ...parsed.frontmatter, ...params.frontmatter }
  const fmText = formatYamlFrontmatter(merged)
  const body = parsed.body ? `\n${parsed.body.replace(/^\n+/, '')}` : ''
  return applyLineEnding(`${fmText}${body}`, eol)
}

export function syncResearchNotesMarkdown(
  existingRaw: string,
  sources: readonly VideoStudioResearchSource[],
  fallbackTitle = 'Project'
): string {
  const eol = detectLineEnding(existingRaw)
  const base = existingRaw.trim()
    ? existingRaw.replace(/\r\n/g, '\n')
    : `# Research Notes — ${fallbackTitle}\n`
  const startIdx = base.indexOf(SOURCES_START_MARKER)
  const endIdx = base.indexOf(SOURCES_END_MARKER)
  const withoutManaged =
    startIdx !== -1 && endIdx > startIdx
      ? `${base.slice(0, startIdx).trimEnd()}\n${base.slice(endIdx + SOURCES_END_MARKER.length).trimStart()}`.trimEnd()
      : base.trimEnd()

  if (sources.length === 0) {
    return applyLineEnding(`${withoutManaged}\n`, eol)
  }
  const lines = [
    SOURCES_START_MARKER,
    '## Tracked Sources',
    '',
    ...sources.map(
      (source, index) =>
        `${index + 1}. [${source.title}](${source.url}) (${source.verificationStatus})`
    ),
    SOURCES_END_MARKER
  ]
  return applyLineEnding(`${withoutManaged}\n\n${lines.join('\n')}\n`, eol)
}
