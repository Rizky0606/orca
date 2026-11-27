import type { MasterAssetRecord } from '../../../../shared/video-studio/video-studio-asset-contract'
import type { MotionPresetMetadata } from '../../../../shared/video-studio/motion-registry-contract'
import type { StyleProfile } from '../../../../shared/video-studio/video-studio-style-contract'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

const timestamp = Date.parse('2026-11-26T10:00:00Z')
const asyncTrue = async () => true
const noop = () => {}

export const TECH_EXPLAINER_FIXTURE_STYLE: StyleProfile = {
  schemaVersion: 1,
  id: 'technical-explainer-01',
  version: 1,
  name: 'Technical Explainer 01',
  description:
    'Warm paper ground with architectural charcoal ink and high-contrast explainer accents.',
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
      border: '#D6CEBE'
    },
    lighting: 'soft-studio-orthographic',
    renderingStyle: '2.5d-semi-realistic',
    cornerRadiusPx: 14
  },
  typography: {
    displayFont: 'Space Grotesk',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
    titleWeight: 700,
    bodyWeight: 500,
    headingScale: 'balanced'
  },
  camera: {
    projection: 'orthographic',
    allowedMoves: ['pan', 'smooth-zoom', 'focus-rack'],
    framingRule: 'Center subject within 80% safe frame with bottom subtitle buffer'
  },
  motion: {
    pacing: 'snappy',
    defaultEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    transitionVocabulary: ['cut', 'slide', 'dissolve'],
    motionPresetRefs: ['diagram.flow_path', 'camera.smooth_zoom']
  },
  effects: {
    allowedEffects: ['subtle-drop-shadow', 'cutaway-reveal'],
    bannedEffects: ['crt-scanlines', 'heavy-glitch']
  },
  composition: {
    headerZonePercent: 18,
    focalZonePercent: 62,
    actionSafePercent: 90,
    titleSafePercent: 80
  },
  subtitle: {
    mode: 'word-highlight',
    backgroundColor: '#111827',
    textColor: '#F9FAFB',
    highlightColor: '#FACC15',
    position: 'bottom'
  }
}

export const CLEAN_EDITORIAL_FIXTURE_STYLE: StyleProfile = {
  ...TECH_EXPLAINER_FIXTURE_STYLE,
  id: 'clean-editorial-01',
  name: 'Clean Editorial 01',
  category: 'editorial',
  visual: {
    palette: {
      background: '#F8FAFC',
      surface: '#FFFFFF',
      primaryText: '#0F172A',
      secondaryText: '#475569',
      accentPrimary: '#0F766E',
      accentSecondary: '#0284C7',
      highlight: '#FEF08A',
      border: '#E2E8F0'
    },
    lighting: 'clean-flat-daylight',
    renderingStyle: 'crisp-2d-vector',
    cornerRadiusPx: 12
  }
}

export const FIXTURE_MOTION_PRESETS: MotionPresetMetadata[] = [
  {
    id: 'camera.smooth_zoom',
    version: '1.0.0',
    name: 'Smooth Zoom',
    category: 'camera',
    parameters: { scale: { type: 'number', default: 1.15, min: 1, max: 3 } },
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: { hyperframes: { status: 'knowledge-only' }, remotion: { status: 'planned' } }
  },
  {
    id: 'diagram.flow_path',
    version: '1.0.0',
    name: 'Airflow Path Draw',
    category: 'diagram',
    parameters: {},
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: { hyperframes: { status: 'knowledge-only' }, remotion: { status: 'planned' } }
  },
  {
    id: 'transition.wipe_cross',
    version: '1.0.0',
    name: 'Cross Wipe',
    category: 'transition',
    parameters: {},
    dependencies: [],
    executionKind: 'planned',
    implementations: { hyperframes: { status: 'planned' }, remotion: { status: 'planned' } }
  }
]

export const FIXTURE_AC_ASSET: MasterAssetRecord = {
  id: 'ac_indoor_001',
  schemaVersion: 1,
  version: 1,
  name: 'Indoor AC Split Unit',
  type: 'object',
  format: 'svg',
  tags: ['hvac', 'cutaway'],
  defaultState: 'closed',
  states: {
    closed: { file: 'assets/objects/ac_indoor_001/closed.svg' },
    cutaway: { file: 'assets/objects/ac_indoor_001/cutaway.svg' },
    operating: { file: 'assets/objects/ac_indoor_001/operating.svg' }
  },
  components: [
    { id: 'front_panel', animatable: true, allowedTransforms: ['translate', 'opacity'] },
    {
      id: 'fan_blades',
      parentComponentId: 'front_panel',
      animatable: true,
      allowedTransforms: ['rotate']
    }
  ],
  supportedEngines: ['hyperframes'],
  dependencies: [],
  provenance: { source: 'library', libraryAssetId: 'ac_indoor_001', libraryVersion: 1 },
  consistency: { lockGeometry: true, lockProportions: true, lockMaterials: true },
  createdAt: timestamp,
  updatedAt: timestamp
}

export function makeFixtureInspector(
  overrides: Partial<VideoStudioInspectorController> = {}
): VideoStudioInspectorController {
  return {
    documents: {
      briefMarkdown:
        '# How AC Units Pull Heat Inside\n\nExplain phase-change refrigeration cleanly using cutaway airflow graphics.',
      briefFrontmatter: {
        audience: 'Visual learners',
        message: 'Heat moves out via phase-change refrigerant.'
      },
      storyboard: {
        frontmatter: {
          format: '1080x1920',
          duration: '10s',
          styleProfile: 'technical-explainer-01'
        },
        frames: [
          {
            sceneId: 'scene_hook',
            frameNumber: 1,
            title: 'Room Heat Hook',
            status: 'built',
            duration: '3s',
            transitionIn: 'cut',
            engine: 'hyperframes',
            src: 'compositions/01-hook.html',
            assets: ['ac_indoor_001:closed'],
            motionPresets: ['camera.smooth_zoom'],
            camera: 'orthographic-center',
            voiceover: 'Your AC never creates cold air — it pumps room heat outdoors.',
            lockedSections: [],
            extra: {}
          },
          {
            sceneId: 'scene_cutaway',
            frameNumber: 2,
            title: 'Evaporator Coil Cutaway',
            status: 'animated',
            duration: '4s',
            transitionIn: 'slide',
            engine: 'hyperframes',
            src: 'compositions/02-cutaway.html',
            assets: ['ac_indoor_001:cutaway'],
            motionPresets: ['diagram.flow_path'],
            voiceover: 'Warm indoor air crosses cold evaporator coils as refrigerant boils.',
            lockedSections: [],
            extra: {}
          }
        ],
        lockedSections: []
      },
      storyboardMarkdown: '',
      scriptMarkdown:
        '# Narration Script\n\n## Frame 1 — Room Heat Hook\nYour AC pumps indoor heat outside.',
      researchSources: [
        {
          id: 'src-1',
          url: 'https://energy.gov/energysaver/air-conditioning',
          title: 'DOE Central Air Conditioning Cycle',
          domain: 'energy.gov',
          snippet: 'Indoor evaporator coils absorb latent heat from circulating room air.',
          accessedAt: timestamp,
          origin: 'deep-research',
          verificationStatus: 'verified',
          claimIds: ['claim-1']
        }
      ],
      researchNotesMarkdown: '',
      revisions: { 'BRIEF.md': 'rev-b1', 'STORYBOARD.md': 'rev-s1', 'SCRIPT.md': 'rev-c1' },
      trustState: 'approved-render',
      approvedInputFingerprint: 'a'.repeat(64),
      currentInputFingerprint: 'a'.repeat(64)
    },
    styleState: {
      profile: TECH_EXPLAINER_FIXTURE_STYLE,
      revision: 'rev-style-1',
      markdownDrift: false,
      driftedFiles: []
    },
    styleDiff: { inSync: true, diffs: [] },
    libraryStyles: [TECH_EXPLAINER_FIXTURE_STYLE, CLEAN_EDITORIAL_FIXTURE_STYLE],
    motionPresets: FIXTURE_MOTION_PRESETS,
    projectAssets: {
      assets: [FIXTURE_AC_ASSET],
      warnings: [],
      invariantErrors: {},
      revision: 'rev-assets-1'
    },
    libraryAssets: [FIXTURE_AC_ASSET],
    busyAction: null,
    error: null,
    externalChangedPaths: [],
    dismissExternalChanges: noop,
    reloadAll: noop,
    updateBrief: asyncTrue,
    updateScript: asyncTrue,
    upsertSource: asyncTrue,
    deleteSource: asyncTrue,
    addFrame: asyncTrue,
    patchFrame: asyncTrue,
    deleteFrame: asyncTrue,
    reorderFrames: asyncTrue,
    applyStyle: asyncTrue,
    updateStyleTokens: asyncTrue,
    duplicateStyle: asyncTrue,
    saveLibraryStyle: asyncTrue,
    reconcileStyle: asyncTrue,
    registerAsset: asyncTrue,
    applyLibraryAsset: asyncTrue,
    saveAssetToLibrary: asyncTrue,
    removeProjectAsset: async () => ({ removed: true, hasWarnings: false }),
    approveExecution: asyncTrue,
    ...overrides
  }
}
