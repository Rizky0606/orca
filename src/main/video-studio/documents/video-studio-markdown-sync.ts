import { parse as parseYaml } from 'yaml'
import {
  SceneSpecSchema,
  StoryboardDocumentSchema,
  type SceneSpec,
  type StoryboardDocument,
  type StoryboardFrontmatter,
  type StoryboardLockedSection
} from '../../../shared/video-studio/video-studio-storyboard-contract'
import { sha256Bytes } from '../video-studio-tx-journal'
import { splitYamlFrontmatter } from './yaml-frontmatter'

export { formatStoryboardMarkdown } from './storyboard-markdown-serializer'
export {
  applyLineEnding,
  detectLineEnding,
  formatYamlFrontmatter,
  splitYamlFrontmatter,
  syncResearchNotesMarkdown,
  updateBriefMarkdown
} from './yaml-frontmatter'

const FRAME_HEADING_RE = /^##\s+Frame\s+(\d+)(?:\s*(?:—|–|--|-)\s*(.+?))?\s*$/
const LOCKED_HEADING_RE = /^##\s+(Locked(?:\b.*)?)\s*$/i
const SUB_LOCKED_HEADING_RE = /^###\s+(Locked(?:\b.*)?)\s*$/i
const BULLET_LINE_RE = /^-\s+([A-Za-z0-9_]+)\s*:(.*)$/

function parseBulletValue(rawValue: string): unknown {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return ''
  }
  if (
    trimmed.startsWith('"') ||
    trimmed.startsWith("'") ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('{') ||
    trimmed === 'true' ||
    trimmed === 'false' ||
    /^-?\d+(?:\.\d+)?$/.test(trimmed)
  ) {
    try {
      return parseYaml(trimmed)
    } catch {
      return trimmed
    }
  }
  return trimmed
}

function parseListBullet(rawValue: string): string[] {
  const trimmed = rawValue.trim()
  if (!trimmed || trimmed === '[]') {
    return []
  }
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = parseYaml(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean)
      }
    } catch {
      // Fall back to comma splitting below.
    }
  }
  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseScalarText(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return ''
  }
  const parsed = parseBulletValue(trimmed)
  return parsed === null || parsed === undefined ? '' : String(parsed)
}

function parseFrontmatterBlock(rawFm: Record<string, unknown>): StoryboardFrontmatter {
  const knownKeys = new Set([
    'format',
    'duration',
    'message',
    'arc',
    'audience',
    'style_profile',
    'styleProfile'
  ])
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawFm)) {
    if (!knownKeys.has(key)) {
      extra[key] = value
    }
  }
  const styleProfile =
    typeof rawFm.style_profile === 'string'
      ? rawFm.style_profile
      : typeof rawFm.styleProfile === 'string'
        ? rawFm.styleProfile
        : undefined
  return {
    ...(typeof rawFm.format === 'string' && rawFm.format.trim()
      ? { format: rawFm.format.trim() }
      : {}),
    ...(typeof rawFm.duration === 'string' || typeof rawFm.duration === 'number'
      ? { duration: rawFm.duration }
      : {}),
    ...(typeof rawFm.message === 'string' ? { message: rawFm.message } : {}),
    ...(typeof rawFm.arc === 'string' ? { arc: rawFm.arc } : {}),
    ...(typeof rawFm.audience === 'string' ? { audience: rawFm.audience } : {}),
    ...(styleProfile?.trim() ? { styleProfile: styleProfile.trim() } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {})
  }
}

function parseFrameBlock(
  frameNumber: number,
  title: string,
  lines: readonly string[],
  index: number
): SceneSpec {
  const bullets = new Map<string, string>()
  const extra: Record<string, unknown> = {}
  let proseStartIndex = 0
  let seenBullet = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim()) {
      proseStartIndex = i + 1
      if (seenBullet) {
        break
      }
      continue
    }
    const bulletMatch = BULLET_LINE_RE.exec(line)
    if (!bulletMatch) {
      break
    }
    seenBullet = true
    bullets.set(bulletMatch[1], bulletMatch[2])
    proseStartIndex = i + 1
  }

  const notes = lines.slice(proseStartIndex).join('\n').trim() || undefined
  const knownFrameKeys = new Set([
    'scene_id',
    'status',
    'duration',
    'transition_in',
    'engine',
    'src',
    'assets',
    'motion_presets',
    'camera',
    'narrative_role',
    'voiceover',
    'locked_sections'
  ])
  for (const [key, rawVal] of bullets.entries()) {
    if (!knownFrameKeys.has(key)) {
      extra[key] = parseBulletValue(rawVal)
    }
  }

  const rawSceneId = parseScalarText(bullets.get('scene_id') ?? '')
  const sceneId =
    rawSceneId ||
    `scene_${sha256Bytes(`${index}:${frameNumber}:${title}:${notes ?? ''}`).slice(0, 8)}`
  const rawDuration = parseBulletValue(bullets.get('duration') ?? '5s')
  const duration =
    typeof rawDuration === 'number' || (typeof rawDuration === 'string' && rawDuration.trim())
      ? rawDuration
      : '5s'
  const lockedSections = parseListBullet(bullets.get('locked_sections') ?? '')
  if (notes) {
    for (const noteLine of notes.split('\n')) {
      const subLocked = SUB_LOCKED_HEADING_RE.exec(noteLine)
      if (subLocked && !lockedSections.includes(subLocked[1])) {
        lockedSections.push(subLocked[1])
      }
    }
  }
  const hasVoiceover = bullets.has('voiceover')
  const voiceover = hasVoiceover ? parseScalarText(bullets.get('voiceover') ?? '') : undefined

  return SceneSpecSchema.parse({
    sceneId,
    frameNumber,
    title: title.trim() || `Frame ${frameNumber}`,
    status: parseScalarText(bullets.get('status') ?? '') || 'outline',
    duration,
    ...(parseScalarText(bullets.get('transition_in') ?? '')
      ? { transitionIn: parseScalarText(bullets.get('transition_in') ?? '') }
      : {}),
    engine: parseScalarText(bullets.get('engine') ?? '') || 'hyperframes',
    ...(parseScalarText(bullets.get('src') ?? '')
      ? { src: parseScalarText(bullets.get('src') ?? '') }
      : {}),
    assets: parseListBullet(bullets.get('assets') ?? ''),
    motionPresets: parseListBullet(bullets.get('motion_presets') ?? ''),
    ...(parseScalarText(bullets.get('camera') ?? '')
      ? { camera: parseScalarText(bullets.get('camera') ?? '') }
      : {}),
    ...(parseScalarText(bullets.get('narrative_role') ?? '')
      ? { narrativeRole: parseScalarText(bullets.get('narrative_role') ?? '') }
      : {}),
    ...(voiceover !== undefined ? { voiceover } : {}),
    ...(notes ? { notes } : {}),
    lockedSections,
    extra
  })
}

/** Parses HyperFrames-compatible `## Frame N — Title` STORYBOARD.md into structured camelCase data. */
export function parseStoryboardMarkdown(raw: string): StoryboardDocument {
  const { frontmatter: rawFm, body } = splitYamlFrontmatter(raw)
  const lines = body.split('\n')
  const frames: SceneSpec[] = []
  const lockedSections: StoryboardLockedSection[] = []

  type SectionBuffer =
    | { kind: 'frame'; frameNumber: number; title: string; lines: string[] }
    | { kind: 'locked'; title: string; lines: string[] }
  let current: SectionBuffer | null = null

  const flush = (): void => {
    if (!current) {
      return
    }
    if (current.kind === 'frame') {
      frames.push(parseFrameBlock(current.frameNumber, current.title, current.lines, frames.length))
    } else {
      lockedSections.push({ title: current.title.trim(), body: current.lines.join('\n').trim() })
    }
    current = null
  }

  for (const line of lines) {
    const frameMatch = FRAME_HEADING_RE.exec(line)
    if (frameMatch) {
      flush()
      current = {
        kind: 'frame',
        frameNumber: Number.parseInt(frameMatch[1], 10),
        title: (frameMatch[2] ?? `Frame ${frameMatch[1]}`).trim(),
        lines: []
      }
      continue
    }
    const lockedMatch = LOCKED_HEADING_RE.exec(line)
    if (lockedMatch) {
      flush()
      current = { kind: 'locked', title: lockedMatch[1].trim(), lines: [] }
      continue
    }
    if (current) {
      current.lines.push(line)
    }
  }
  flush()

  return StoryboardDocumentSchema.parse({
    frontmatter: parseFrontmatterBlock(rawFm),
    frames,
    lockedSections
  })
}
