import { stringify as stringifyYaml } from 'yaml'
import {
  videoStudioDimensionsForAspectRatio,
  type VideoStudioProject
} from '../../shared/video-studio/video-studio-project'
import type { StyleProfile } from '../../shared/video-studio/video-studio-style-contract'
import { assertSafeStyleProfileTokens } from './style/style-token-validation'

/** Escapes HTML special characters in user-derived strings embedded in HTML or Markdown seeds. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data).trimEnd()}\n---\n`
}

function safeInlineText(text: string): string {
  return escapeHtml(text)
    .replace(/\r?\n+/g, ' ')
    .trim()
}

/** Generates the initial modular Markdown and JSON seed files for a Video Studio project. */
export function buildDocumentSeeds(
  project: VideoStudioProject,
  styleProfile: StyleProfile
): Record<string, string> {
  assertSafeStyleProfileTokens(styleProfile)
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  const safeTitle = safeInlineText(project.title)
  const safePrompt = escapeHtml(project.prompt.trim() || 'Describe the core narrative and visuals.')
  const inlinePrompt = safeInlineText(
    project.prompt.trim() || 'Explain the core topic clearly with structured visual scenes.'
  )
  const { palette } = styleProfile.visual

  const briefMd = `${formatFrontmatter({
    title: safeTitle,
    aspect_ratio: project.aspectRatio,
    duration: `${project.durationSeconds}s`,
    fps: project.fps,
    engine: project.engine,
    style_profile: styleProfile.id,
    message: inlinePrompt,
    arc: 'Hook -> Context -> Mechanism -> Conclusion',
    audience: 'General viewers'
  })}
# Brief — ${safeTitle}

## Core Goal

${safePrompt}

## Constraints

- Canvas: ${width}x${height} @ ${project.fps}fps (${project.durationSeconds}s)
- Action-safe margin: ${styleProfile.composition.actionSafePercent}%
- Title-safe margin: ${styleProfile.composition.titleSafePercent}%
`

  const frameMd = `${formatFrontmatter({
    style_id: styleProfile.id,
    version: styleProfile.version,
    rendering_style: styleProfile.visual.renderingStyle,
    lighting: styleProfile.visual.lighting,
    background: palette.background,
    surface: palette.surface,
    primary_text: palette.primaryText,
    secondary_text: palette.secondaryText,
    accent_primary: palette.accentPrimary,
    accent_secondary: palette.accentSecondary ?? palette.accentPrimary,
    highlight: palette.highlight ?? palette.accentPrimary,
    display_font: styleProfile.typography.displayFont,
    body_font: styleProfile.typography.bodyFont,
    mono_font: styleProfile.typography.monoFont,
    projection: styleProfile.camera.projection,
    subtitle_mode: styleProfile.subtitle.mode
  })}
# Frame Spec — ${safeTitle}

- Rendering style: \`${styleProfile.visual.renderingStyle}\` (${styleProfile.visual.lighting})
- Framing rule: ${styleProfile.camera.framingRule}
- Header zone: ${styleProfile.composition.headerZonePercent}% | Focal zone: ${styleProfile.composition.focalZonePercent}%
`

  const designMd = `# Design System — ${safeTitle}

- Style Profile: \`${styleProfile.id}\` (v${styleProfile.version})
- Background: \`${palette.background}\`
- Surface: \`${palette.surface}\`
- Primary Text: \`${palette.primaryText}\`
- Secondary Text: \`${palette.secondaryText}\`
- Accent Primary: \`${palette.accentPrimary}\`
- Accent Secondary: \`${palette.accentSecondary ?? palette.accentPrimary}\`
- Highlight: \`${palette.highlight ?? palette.accentPrimary}\`
- Typography: ${styleProfile.typography.displayFont} (${styleProfile.typography.titleWeight}) / ${styleProfile.typography.bodyFont} (${styleProfile.typography.bodyWeight}) / ${styleProfile.typography.monoFont}
`

  const motionMd = `${formatFrontmatter({
    pacing: styleProfile.motion.pacing,
    default_easing: styleProfile.motion.defaultEasing,
    transitions: styleProfile.motion.transitionVocabulary,
    motion_presets: styleProfile.motion.motionPresetRefs,
    allowed_effects: styleProfile.effects.allowedEffects,
    banned_effects: styleProfile.effects.bannedEffects
  })}
# Motion Direction — ${safeTitle}

- Pacing: \`${styleProfile.motion.pacing}\`
- Default easing: \`${styleProfile.motion.defaultEasing}\`
- Allowed camera moves: ${styleProfile.camera.allowedMoves.join(', ')}
`

  const storyboardMd = `${formatFrontmatter({
    format: `${width}x${height}`,
    duration: `${project.durationSeconds}s`,
    message: inlinePrompt,
    arc: 'Hook -> Context -> Mechanism -> Conclusion',
    audience: 'General viewers',
    style_profile: styleProfile.id
  })}
## Frame 1 — Opening

- scene_id: scene_opening_01
- status: outline
- duration: ${project.durationSeconds}s
- transition_in: cut
- engine: hyperframes
- src: compositions/01-opening.html
- assets:
- motion_presets: camera.smooth_zoom
- camera: ${styleProfile.camera.projection}
- narrative_role: hook
- voiceover: ""

${safePrompt}
`

  const scriptMd = `# Narration Script — ${safeTitle}

## Frame 1 — Opening

_Add timed voiceover narration for \`scene_opening_01\` here._
`

  const researchNotesMd = `# Research Notes — ${safeTitle}

${safePrompt}
`

  return {
    'BRIEF.md': briefMd,
    'frame.md': frameMd,
    'DESIGN.md': designMd,
    'MOTION.md': motionMd,
    'STORYBOARD.md': storyboardMd,
    'SCRIPT.md': scriptMd,
    'styles/style-profile.json': `${JSON.stringify(styleProfile, null, 2)}\n`,
    'assets/asset-registry.json': `${JSON.stringify({ schemaVersion: 1, assets: [] }, null, 2)}\n`,
    'references/sources.json': `${JSON.stringify({ schemaVersion: 1, sources: [] }, null, 2)}\n`,
    'references/research-notes.md': researchNotesMd
  }
}
