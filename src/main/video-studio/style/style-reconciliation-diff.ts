import {
  StyleProfileSchema,
  type StyleProfile
} from '../../../shared/video-studio/video-studio-style-contract'
import type { VideoStudioStyleDiffEntry } from '../../../shared/video-studio/video-studio-style-rpc-contract'
import { splitYamlFrontmatter } from '../documents/yaml-frontmatter'
import { assertSafeStyleProfileTokens } from './style-token-validation'

export type StyleMarkdownInputs = {
  frameMarkdown?: string | null
  designMarkdown?: string | null
  motionMarkdown?: string | null
}

type ExtractedToken = {
  tokenPath: string
  value: unknown
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, idx) => item === b[idx])
  }
  return a === b
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getByPath(obj: unknown, dotPath: string): unknown {
  let cursor: unknown = obj
  for (const segment of dotPath.split('.')) {
    if (!isPlainRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      return undefined
    }
    cursor = cursor[segment]
  }
  return cursor
}

function setByPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.')
  let cursor: Record<string, unknown> = obj
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]
    const next = cursor[key]
    if (!isPlainRecord(next)) {
      const fresh: Record<string, unknown> = {}
      cursor[key] = fresh
      cursor = fresh
    } else {
      cursor = next
    }
  }
  cursor[segments.at(-1)!] = value
}

function parseFrameTokens(markdown: string): ExtractedToken[] {
  const { frontmatter, hasFrontmatter } = splitYamlFrontmatter(markdown)
  if (!hasFrontmatter) {
    return []
  }
  const map: readonly [string, string][] = [
    ['rendering_style', 'visual.renderingStyle'],
    ['lighting', 'visual.lighting'],
    ['background', 'visual.palette.background'],
    ['surface', 'visual.palette.surface'],
    ['primary_text', 'visual.palette.primaryText'],
    ['secondary_text', 'visual.palette.secondaryText'],
    ['accent_primary', 'visual.palette.accentPrimary'],
    ['accent_secondary', 'visual.palette.accentSecondary'],
    ['highlight', 'visual.palette.highlight'],
    ['border', 'visual.palette.border'],
    ['display_font', 'typography.displayFont'],
    ['body_font', 'typography.bodyFont'],
    ['mono_font', 'typography.monoFont'],
    ['projection', 'camera.projection'],
    ['subtitle_mode', 'subtitle.mode']
  ]
  const tokens: ExtractedToken[] = []
  for (const [fmKey, tokenPath] of map) {
    if (Object.hasOwn(frontmatter, fmKey) && frontmatter[fmKey] !== undefined) {
      tokens.push({ tokenPath, value: frontmatter[fmKey] })
    }
  }
  return tokens
}

function parseMotionTokens(markdown: string): ExtractedToken[] {
  const { frontmatter, hasFrontmatter } = splitYamlFrontmatter(markdown)
  if (!hasFrontmatter) {
    return []
  }
  const map: readonly [string, string][] = [
    ['pacing', 'motion.pacing'],
    ['default_easing', 'motion.defaultEasing'],
    ['transitions', 'motion.transitionVocabulary'],
    ['motion_presets', 'motion.motionPresetRefs'],
    ['allowed_effects', 'effects.allowedEffects'],
    ['banned_effects', 'effects.bannedEffects']
  ]
  const tokens: ExtractedToken[] = []
  for (const [fmKey, tokenPath] of map) {
    if (Object.hasOwn(frontmatter, fmKey) && frontmatter[fmKey] !== undefined) {
      tokens.push({ tokenPath, value: frontmatter[fmKey] })
    }
  }
  return tokens
}

function stripBackticks(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2
    ? trimmed.slice(1, -1).trim()
    : trimmed
}

function parseDesignTokens(markdown: string): ExtractedToken[] {
  const { body } = splitYamlFrontmatter(markdown)
  const tokens: ExtractedToken[] = []
  const bulletMap: readonly [RegExp, string][] = [
    [/^-\s+Background:\s*(.+)$/, 'visual.palette.background'],
    [/^-\s+Surface:\s*(.+)$/, 'visual.palette.surface'],
    [/^-\s+Primary Text:\s*(.+)$/, 'visual.palette.primaryText'],
    [/^-\s+Secondary Text:\s*(.+)$/, 'visual.palette.secondaryText'],
    [/^-\s+Accent Primary:\s*(.+)$/, 'visual.palette.accentPrimary'],
    [/^-\s+Accent Secondary:\s*(.+)$/, 'visual.palette.accentSecondary'],
    [/^-\s+Highlight:\s*(.+)$/, 'visual.palette.highlight']
  ]
  const typoRe = /^-\s+Typography:\s*(.+?)\s*\((\d+)\)\s*\/\s*(.+?)\s*\((\d+)\)\s*\/\s*(.+?)\s*$/

  for (const line of body.split('\n')) {
    for (const [pattern, tokenPath] of bulletMap) {
      const match = pattern.exec(line)
      if (match) {
        tokens.push({ tokenPath, value: stripBackticks(match[1]) })
      }
    }
    const typoMatch = typoRe.exec(line)
    if (typoMatch) {
      tokens.push(
        { tokenPath: 'typography.displayFont', value: typoMatch[1].trim() },
        { tokenPath: 'typography.titleWeight', value: Number.parseInt(typoMatch[2], 10) },
        { tokenPath: 'typography.bodyFont', value: typoMatch[3].trim() },
        { tokenPath: 'typography.bodyWeight', value: Number.parseInt(typoMatch[4], 10) },
        { tokenPath: 'typography.monoFont', value: typoMatch[5].trim() }
      )
    }
  }
  return tokens
}

function effectiveJsonValue(profile: StyleProfile, tokenPath: string): unknown {
  const raw = getByPath(profile, tokenPath)
  if (
    raw === undefined &&
    (tokenPath === 'visual.palette.accentSecondary' || tokenPath === 'visual.palette.highlight')
  ) {
    return profile.visual.palette.accentPrimary
  }
  return raw
}

/** Computes token-level differences between `styles/style-profile.json` and project Markdown files. */
export function computeStyleReconciliationDiff(
  profile: StyleProfile,
  files: StyleMarkdownInputs
): VideoStudioStyleDiffEntry[] {
  const sources: readonly [string, ExtractedToken[]][] = [
    ['frame.md', files.frameMarkdown ? parseFrameTokens(files.frameMarkdown) : []],
    ['DESIGN.md', files.designMarkdown ? parseDesignTokens(files.designMarkdown) : []],
    ['MOTION.md', files.motionMarkdown ? parseMotionTokens(files.motionMarkdown) : []]
  ]

  const diffs: VideoStudioStyleDiffEntry[] = []
  for (const [file, tokens] of sources) {
    for (const { tokenPath, value } of tokens) {
      const jsonValue = effectiveJsonValue(profile, tokenPath)
      if (!valuesEqual(jsonValue, value)) {
        diffs.push({
          file,
          tokenPath,
          jsonValue,
          markdownValue: value
        })
      }
    }
  }
  return diffs
}

/** Applies edited Markdown tokens onto a `StyleProfile` clone and validates all schema & safety rules. */
export function applyMarkdownTokensToProfile(
  profile: StyleProfile,
  files: StyleMarkdownInputs,
  sourceFile?: 'frame.md' | 'DESIGN.md' | 'MOTION.md'
): StyleProfile {
  const cloned: unknown = structuredClone(profile)
  if (!isPlainRecord(cloned)) {
    throw new Error('Expected StyleProfile object')
  }
  const next: Record<string, unknown> = cloned
  const order: readonly [string, ExtractedToken[]][] = [
    ['DESIGN.md', files.designMarkdown ? parseDesignTokens(files.designMarkdown) : []],
    ['frame.md', files.frameMarkdown ? parseFrameTokens(files.frameMarkdown) : []],
    ['MOTION.md', files.motionMarkdown ? parseMotionTokens(files.motionMarkdown) : []]
  ]

  for (const [file, tokens] of order) {
    if (sourceFile && file !== sourceFile) {
      continue
    }
    for (const { tokenPath, value } of tokens) {
      const currentValue = effectiveJsonValue(profile, tokenPath)
      if (sourceFile || !valuesEqual(currentValue, value)) {
        setByPath(next, tokenPath, value)
      }
    }
  }

  const parsed = StyleProfileSchema.parse(next)
  assertSafeStyleProfileTokens(parsed)
  return parsed
}
