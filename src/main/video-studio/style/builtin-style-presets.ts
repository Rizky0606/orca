import {
  StyleProfileSchema,
  type StyleProfile
} from '../../../shared/video-studio/video-studio-style-contract'
import { assertSafeStyleProfileTokens } from './style-token-validation'

function parseBuiltinPreset(input: unknown): StyleProfile {
  const parsed = StyleProfileSchema.parse(input)
  assertSafeStyleProfileTokens(parsed)
  return parsed
}

const TECHNICAL_EXPLAINER_PRESET = parseBuiltinPreset({
  schemaVersion: 1,
  id: 'technical-explainer-01',
  version: 1,
  name: 'Technical Explainer 01',
  description:
    '2.5D semi-realistic technical illustration with warm cream canvas and orthographic callouts.',
  category: 'technical-explainer',
  tier: 'built-in',
  visual: {
    palette: {
      background: '#F7F3E9',
      surface: '#EFE7D6',
      primaryText: '#1E242B',
      secondaryText: '#4B5563',
      accentPrimary: '#2563EB',
      accentSecondary: '#EA580C',
      highlight: '#FACC15',
      border: '#D6CFC2'
    },
    lighting: 'soft-neutral',
    renderingStyle: '2.5d-semi-realistic',
    cornerRadiusPx: 12
  },
  typography: {
    displayFont: 'Space Grotesk',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
    titleWeight: 700,
    bodyWeight: 400,
    headingScale: 'balanced'
  },
  camera: {
    projection: 'orthographic',
    allowedMoves: ['pan', 'zoom', 'match-cut'],
    framingRule: 'Keep primary subject centered within the 60% focal zone inside 80% title-safe.'
  },
  motion: {
    pacing: 'measured',
    defaultEasing: 'power2.out',
    transitionVocabulary: ['cut', 'slide-left', 'match-cut'],
    motionPresetRefs: ['camera.smooth_zoom', 'typography.counter_up']
  },
  effects: {
    allowedEffects: ['airflow', 'callout'],
    bannedEffects: ['neon-glow', 'heavy-drop-shadow']
  },
  composition: {
    headerZonePercent: 15,
    focalZonePercent: 60,
    actionSafePercent: 90,
    titleSafePercent: 80
  },
  subtitle: {
    mode: 'word-highlight',
    backgroundColor: '#111827',
    textColor: '#FFFFFF',
    highlightColor: '#FACC15',
    position: 'bottom'
  }
})

const CLEAN_EDITORIAL_PRESET = parseBuiltinPreset({
  schemaVersion: 1,
  id: 'clean-editorial-01',
  version: 1,
  name: 'Clean Editorial 01',
  description: 'General-purpose warm paper editorial style with anchor-rail subtitles.',
  category: 'editorial',
  tier: 'built-in',
  visual: {
    palette: {
      background: '#FAF9F6',
      surface: '#F1EFEA',
      primaryText: '#18181B',
      secondaryText: '#52525B',
      accentPrimary: '#1D4ED8',
      accentSecondary: '#B45309',
      highlight: '#FDE047',
      border: '#E4E4E7'
    },
    lighting: 'flat-editorial',
    renderingStyle: 'flat-editorial',
    cornerRadiusPx: 8
  },
  typography: {
    displayFont: 'Newsreader',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
    titleWeight: 600,
    bodyWeight: 400,
    headingScale: 'balanced'
  },
  camera: {
    projection: '2d-flat',
    allowedMoves: ['pan', 'zoom', 'match-cut'],
    framingRule: 'Keep primary subject centered inside the 60% focal zone.'
  },
  motion: {
    pacing: 'calm',
    defaultEasing: 'power2.out',
    transitionVocabulary: ['cut', 'slide-left', 'match-cut'],
    motionPresetRefs: ['camera.smooth_zoom', 'typography.word_highlight']
  },
  effects: {
    allowedEffects: ['callout', 'subtle-grid'],
    bannedEffects: ['neon-glow', 'heavy-drop-shadow']
  },
  composition: {
    headerZonePercent: 15,
    focalZonePercent: 60,
    actionSafePercent: 90,
    titleSafePercent: 80
  },
  subtitle: {
    mode: 'anchor-rail',
    backgroundColor: '#18181B',
    textColor: '#FAF9F6',
    highlightColor: '#FDE047',
    position: 'lower-third'
  }
})

export const BUILTIN_STYLE_PRESETS: readonly StyleProfile[] = [
  TECHNICAL_EXPLAINER_PRESET,
  CLEAN_EDITORIAL_PRESET
]

const BUILTIN_BY_ID = new Map<string, StyleProfile>(
  BUILTIN_STYLE_PRESETS.map((preset) => [preset.id, preset])
)

export function isBuiltinStyleId(styleId: string): boolean {
  return BUILTIN_BY_ID.has(styleId)
}

export function getBuiltinStylePreset(styleId: string): StyleProfile | null {
  const found = BUILTIN_BY_ID.get(styleId)
  return found ? structuredClone(found) : null
}

/** Converts a built-in or library StyleProfile into an isolated project snapshot. */
export function buildProjectStyleSnapshot(
  source: StyleProfile,
  appliedAt: number,
  snapshotRevision = 'rev-1'
): StyleProfile {
  assertSafeStyleProfileTokens(source)
  return StyleProfileSchema.parse({
    ...structuredClone(source),
    tier: 'snapshot',
    snapshotRevision,
    provenance: {
      sourceStyleId: source.id,
      sourceTier: source.tier === 'library' ? 'library' : 'built-in',
      sourceVersion: source.version,
      appliedAt
    }
  })
}
