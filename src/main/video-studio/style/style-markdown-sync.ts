import type { StyleProfile } from '../../../shared/video-studio/video-studio-style-contract'
import {
  applyLineEnding,
  detectLineEnding,
  formatYamlFrontmatter,
  splitYamlFrontmatter
} from '../documents/yaml-frontmatter'
import { assertSafeStyleProfileTokens } from './style-token-validation'

function escapeMarkdownInline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n+/g, ' ')
    .trim()
}

export function buildFrameFrontmatterValues(profile: StyleProfile): Record<string, unknown> {
  const { palette } = profile.visual
  return {
    style_id: profile.id,
    version: profile.version,
    rendering_style: profile.visual.renderingStyle,
    lighting: profile.visual.lighting,
    background: palette.background,
    surface: palette.surface,
    primary_text: palette.primaryText,
    secondary_text: palette.secondaryText,
    accent_primary: palette.accentPrimary,
    accent_secondary: palette.accentSecondary ?? palette.accentPrimary,
    highlight: palette.highlight ?? palette.accentPrimary,
    display_font: profile.typography.displayFont,
    body_font: profile.typography.bodyFont,
    mono_font: profile.typography.monoFont,
    projection: profile.camera.projection,
    subtitle_mode: profile.subtitle.mode
  }
}

export function buildMotionFrontmatterValues(profile: StyleProfile): Record<string, unknown> {
  return {
    pacing: profile.motion.pacing,
    default_easing: profile.motion.defaultEasing,
    transitions: [...profile.motion.transitionVocabulary],
    motion_presets: [...profile.motion.motionPresetRefs],
    allowed_effects: [...profile.effects.allowedEffects],
    banned_effects: [...profile.effects.bannedEffects]
  }
}

/** Syncs managed YAML frontmatter in `frame.md` while preserving unknown keys and manual prose. */
export function syncFrameMarkdown(
  existingMarkdown: string | null,
  profile: StyleProfile,
  fallbackTitle?: string
): string {
  assertSafeStyleProfileTokens(profile)
  const safeTitle = escapeMarkdownInline(fallbackTitle ?? profile.name)
  const managed = buildFrameFrontmatterValues(profile)
  const defaultBody = [
    '',
    `# Frame Spec — ${safeTitle}`,
    '',
    `- Rendering style: \`${profile.visual.renderingStyle}\` (${profile.visual.lighting})`,
    `- Framing rule: ${profile.camera.framingRule}`,
    `- Header zone: ${profile.composition.headerZonePercent}% | Focal zone: ${profile.composition.focalZonePercent}%`,
    ''
  ].join('\n')

  if (!existingMarkdown?.trim()) {
    return `${formatYamlFrontmatter(managed)}${defaultBody.slice(1)}`
  }
  const { frontmatter, body, eol } = splitYamlFrontmatter(existingMarkdown)
  const nextFm: Record<string, unknown> = { ...frontmatter, ...managed }
  if (Object.hasOwn(frontmatter, 'border') && profile.visual.palette.border) {
    nextFm.border = profile.visual.palette.border
  }
  const nextBody = body.trim() ? body : defaultBody
  return applyLineEnding(`${formatYamlFrontmatter(nextFm)}${nextBody}`, eol)
}

/** Syncs managed YAML frontmatter in `MOTION.md` while preserving unknown keys and manual prose. */
export function syncMotionMarkdown(
  existingMarkdown: string | null,
  profile: StyleProfile,
  fallbackTitle?: string
): string {
  assertSafeStyleProfileTokens(profile)
  const safeTitle = escapeMarkdownInline(fallbackTitle ?? profile.name)
  const managed = buildMotionFrontmatterValues(profile)
  const defaultBody = [
    '',
    `# Motion Direction — ${safeTitle}`,
    '',
    `- Pacing: \`${profile.motion.pacing}\``,
    `- Default easing: \`${profile.motion.defaultEasing}\``,
    `- Allowed camera moves: ${profile.camera.allowedMoves.join(', ')}`,
    ''
  ].join('\n')

  if (!existingMarkdown?.trim()) {
    return `${formatYamlFrontmatter(managed)}${defaultBody.slice(1)}`
  }
  const { frontmatter, body, eol } = splitYamlFrontmatter(existingMarkdown)
  const nextFm: Record<string, unknown> = { ...frontmatter, ...managed }
  const nextBody = body.trim() ? body : defaultBody
  return applyLineEnding(`${formatYamlFrontmatter(nextFm)}${nextBody}`, eol)
}

function buildDesignBulletReplacements(profile: StyleProfile): readonly [RegExp, string][] {
  const { palette } = profile.visual
  const t = profile.typography
  return [
    [/^-\s+Style Profile:\s*.*$/, `- Style Profile: \`${profile.id}\` (v${profile.version})`],
    [/^-\s+Background:\s*.*$/, `- Background: \`${palette.background}\``],
    [/^-\s+Surface:\s*.*$/, `- Surface: \`${palette.surface}\``],
    [/^-\s+Primary Text:\s*.*$/, `- Primary Text: \`${palette.primaryText}\``],
    [/^-\s+Secondary Text:\s*.*$/, `- Secondary Text: \`${palette.secondaryText}\``],
    [/^-\s+Accent Primary:\s*.*$/, `- Accent Primary: \`${palette.accentPrimary}\``],
    [
      /^-\s+Accent Secondary:\s*.*$/,
      `- Accent Secondary: \`${palette.accentSecondary ?? palette.accentPrimary}\``
    ],
    [/^-\s+Highlight:\s*.*$/, `- Highlight: \`${palette.highlight ?? palette.accentPrimary}\``],
    [
      /^-\s+Typography:\s*.*$/,
      `- Typography: ${t.displayFont} (${t.titleWeight}) / ${t.bodyFont} (${t.bodyWeight}) / ${t.monoFont}`
    ]
  ]
}

/** Syncs managed tokens in `DESIGN.md` while preserving brand philosophy and custom prose. */
export function syncDesignMarkdown(
  existingMarkdown: string | null,
  profile: StyleProfile,
  fallbackTitle?: string
): string {
  assertSafeStyleProfileTokens(profile)
  const safeTitle = escapeMarkdownInline(fallbackTitle ?? profile.name)
  const { palette } = profile.visual
  const t = profile.typography
  if (!existingMarkdown?.trim()) {
    return [
      `# Design System — ${safeTitle}`,
      '',
      `- Style Profile: \`${profile.id}\` (v${profile.version})`,
      `- Background: \`${palette.background}\``,
      `- Surface: \`${palette.surface}\``,
      `- Primary Text: \`${palette.primaryText}\``,
      `- Secondary Text: \`${palette.secondaryText}\``,
      `- Accent Primary: \`${palette.accentPrimary}\``,
      `- Accent Secondary: \`${palette.accentSecondary ?? palette.accentPrimary}\``,
      `- Highlight: \`${palette.highlight ?? palette.accentPrimary}\``,
      `- Typography: ${t.displayFont} (${t.titleWeight}) / ${t.bodyFont} (${t.bodyWeight}) / ${t.monoFont}`,
      ''
    ].join('\n')
  }

  const eol = detectLineEnding(existingMarkdown)
  const { frontmatter, body, hasFrontmatter } = splitYamlFrontmatter(existingMarkdown)
  const replacements = buildDesignBulletReplacements(profile)
  const updatedLines = body.split('\n').map((line) => {
    for (const [pattern, replacement] of replacements) {
      if (pattern.test(line)) {
        return replacement
      }
    }
    return line
  })
  const updatedBody = updatedLines.join('\n')
  if (!hasFrontmatter) {
    return applyLineEnding(updatedBody, eol)
  }
  const fmManaged = buildFrameFrontmatterValues(profile)
  const nextFm: Record<string, unknown> = { ...frontmatter }
  for (const [key, value] of Object.entries(fmManaged)) {
    if (Object.hasOwn(nextFm, key)) {
      nextFm[key] = value
    }
  }
  return applyLineEnding(`${formatYamlFrontmatter(nextFm)}${updatedBody}`, eol)
}
