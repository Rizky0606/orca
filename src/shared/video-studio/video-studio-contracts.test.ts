import { describe, expect, it } from 'vitest'
import { MotionPresetMetadataSchema, isMotionPresetExecutable } from './motion-registry-contract'
import {
  dynamicReferenceWarning,
  MasterAssetRecordSchema,
  validateMasterAssetInvariants
} from './video-studio-asset-contract'
import { SafeResourceIdSchema, createSafeResourceIdSchema } from './video-studio-identifiers'
import { VideoStudioProjectFields } from './video-studio-project'
import {
  VIDEO_STUDIO_ADD_STORYBOARD_FRAME_METHOD,
  VIDEO_STUDIO_APPLY_LIBRARY_ASSET_TO_PROJECT_METHOD,
  VIDEO_STUDIO_APPLY_STYLE_PROFILE_TO_PROJECT_METHOD,
  VIDEO_STUDIO_APPROVE_PROJECT_EXECUTION_METHOD,
  VIDEO_STUDIO_DELETE_LIBRARY_ASSET_METHOD,
  VIDEO_STUDIO_DELETE_LIBRARY_STYLE_PROFILE_METHOD,
  VIDEO_STUDIO_DELETE_RESEARCH_SOURCE_METHOD,
  VIDEO_STUDIO_DELETE_STORYBOARD_FRAME_METHOD,
  VIDEO_STUDIO_DUPLICATE_STYLE_PROFILE_METHOD,
  VIDEO_STUDIO_GET_PROJECT_DOCUMENTS_METHOD,
  VIDEO_STUDIO_GET_PROJECT_STYLE_STATE_METHOD,
  VIDEO_STUDIO_GET_STYLE_RECONCILIATION_DIFF_METHOD,
  VIDEO_STUDIO_LIST_LIBRARY_ASSETS_METHOD,
  VIDEO_STUDIO_LIST_MOTION_PRESETS_METHOD,
  VIDEO_STUDIO_LIST_PROJECT_ASSETS_METHOD,
  VIDEO_STUDIO_LIST_STYLE_PROFILES_METHOD,
  VIDEO_STUDIO_PATCH_STORYBOARD_FRAME_METHOD,
  VIDEO_STUDIO_RECONCILE_PROJECT_STYLE_METHOD,
  VIDEO_STUDIO_REGISTER_OR_IMPORT_ASSET_METHOD,
  VIDEO_STUDIO_REMOVE_PROJECT_ASSET_METHOD,
  VIDEO_STUDIO_REORDER_STORYBOARD_FRAMES_METHOD,
  VIDEO_STUDIO_SAVE_LIBRARY_STYLE_PROFILE_METHOD,
  VIDEO_STUDIO_SAVE_PROJECT_ASSET_TO_LIBRARY_METHOD,
  VIDEO_STUDIO_UPDATE_ASSET_METADATA_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_BRIEF_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_SCRIPT_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_STYLE_TOKENS_METHOD,
  VIDEO_STUDIO_UPSERT_RESEARCH_SOURCE_METHOD,
  VideoStudioAddStoryboardFrameParams,
  VideoStudioApplyLibraryAssetToProjectParams,
  VideoStudioApplyStyleProfileToProjectParams,
  VideoStudioApproveProjectExecutionParams,
  VideoStudioDeleteLibraryAssetParams,
  VideoStudioDeleteLibraryStyleProfileParams,
  VideoStudioDeleteResearchSourceParams,
  VideoStudioDeleteStoryboardFrameParams,
  VideoStudioDuplicateStyleProfileParams,
  VideoStudioGetProjectDocumentsParams,
  VideoStudioGetProjectStyleStateParams,
  VideoStudioGetStyleReconciliationDiffParams,
  VideoStudioJobsEventSchema,
  VideoStudioListLibraryAssetsParams,
  VideoStudioListMotionPresetsParams,
  VideoStudioListProjectAssetsParams,
  VideoStudioListStyleProfilesParams,
  VideoStudioPatchStoryboardFrameParams,
  VideoStudioProjectFilesChangedEventSchema,
  VideoStudioReconcileProjectStyleParams,
  VideoStudioRegisterOrImportAssetParams,
  VideoStudioRemoveProjectAssetParams,
  VideoStudioReorderStoryboardFramesParams,
  VideoStudioSaveLibraryStyleProfileParams,
  VideoStudioSaveProjectAssetToLibraryParams,
  VideoStudioStartRenderParams,
  VideoStudioSubscribeJobsEventSchema,
  VideoStudioUpdateAssetMetadataParams,
  VideoStudioUpdateProjectBriefParams,
  VideoStudioUpdateProjectScriptParams,
  VideoStudioUpdateProjectStyleTokensParams,
  VideoStudioUpsertResearchSourceParams
} from './video-studio-rpc-contract'
import {
  SceneSpecSchema,
  StoryboardDocumentSchema,
  VideoStudioResearchSourceSchema
} from './video-studio-storyboard-contract'
import { StyleProfileSchema, StyleProfileTokensPatchSchema } from './video-studio-style-contract'
import {
  HyperFramesEnvironmentReportSchema,
  ValidationReportSchema,
  ValidationStatusSchema
} from './video-studio-validation-contract'

const validStyleProfile = {
  schemaVersion: 1 as const,
  id: 'technical-explainer-01',
  version: 1,
  snapshotRevision: 'sha256:abc123',
  name: 'Technical Explainer 01',
  description: '2.5D semi-realistic technical illustration style',
  category: 'technical-explainer',
  tier: 'snapshot' as const,
  provenance: {
    sourceStyleId: 'technical-explainer-01',
    sourceTier: 'built-in' as const,
    sourceVersion: 1,
    appliedAt: 1_700_000_000_000
  },
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
    headingScale: 'balanced' as const
  },
  camera: {
    projection: 'orthographic' as const,
    allowedMoves: ['pan', 'zoom', 'match-cut'],
    framingRule: 'Keep subject centered inside focal zone'
  },
  motion: {
    pacing: 'measured' as const,
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
    mode: 'word-highlight' as const,
    backgroundColor: '#111827',
    textColor: '#FFFFFF',
    highlightColor: '#FACC15',
    position: 'bottom' as const
  },
  openMotionPackageRef: {
    packageId: 'openmotion/technical-pack',
    version: '0.2.0',
    manifestHash: 'deadbeef'
  }
}

const validAsset = {
  id: 'ac_indoor_001',
  schemaVersion: 1 as const,
  version: 1,
  snapshotRevision: 'rev-1',
  name: 'Indoor AC Unit',
  type: 'object' as const,
  format: 'layered-svg' as const,
  tags: ['hvac', 'explainer'],
  defaultState: 'closed',
  states: {
    closed: {
      file: 'assets/objects/ac_indoor_001/closed.svg',
      sha256: 'a'.repeat(64),
      label: 'Closed shell'
    },
    cutaway: {
      file: 'assets/objects/ac_indoor_001/cutaway.svg',
      sha256: 'b'.repeat(64),
      dependencies: ['assets/objects/ac_indoor_001/labels.json']
    }
  },
  components: [
    {
      id: 'housing',
      name: 'Outer housing',
      selector: '#housing',
      animatable: false
    },
    {
      id: 'evaporator',
      selector: '#evaporator',
      parentComponentId: 'housing',
      animatable: true,
      allowedTransforms: ['opacity', 'color'] as const
    },
    {
      id: 'fan',
      selector: '#fan',
      parentComponentId: 'evaporator',
      animatable: true,
      pivot: { x: 120, y: 80 },
      allowedTransforms: ['rotate'] as const
    }
  ],
  supportedEngines: ['hyperframes' as const],
  dependencies: [],
  provenance: {
    source: 'library' as const,
    libraryAssetId: 'ac_indoor_001',
    libraryVersion: 1
  },
  license: {
    spdx: 'Apache-2.0',
    commercialAllowed: true
  },
  consistency: {
    lockGeometry: true,
    lockProportions: true,
    lockMaterials: true
  },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000
}

describe('StyleProfile & Validation Contracts', () => {
  it('validates the full 9-block StyleProfileSchema and rejects missing required blocks', () => {
    const parsed = StyleProfileSchema.parse(validStyleProfile)
    expect(parsed.visual.palette.accentSecondary).toBe('#EA580C')
    expect(parsed.openMotionPackageRef?.packageId).toBe('openmotion/technical-pack')

    const withoutEffects = { ...validStyleProfile }
    delete (withoutEffects as { effects?: unknown }).effects
    expect(StyleProfileSchema.safeParse(withoutEffects).success).toBe(false)

    const badCorner = {
      ...validStyleProfile,
      visual: { ...validStyleProfile.visual, cornerRadiusPx: -1 }
    }
    expect(StyleProfileSchema.safeParse(badCorner).success).toBe(false)
  })

  it('validates 5-state ValidationReportSchema and HyperFramesEnvironmentReportSchema', () => {
    for (const status of ['passed', 'failed', 'partial', 'error', 'unsupported'] as const) {
      expect(ValidationStatusSchema.parse(status)).toBe(status)
    }

    const report = ValidationReportSchema.parse({
      status: 'partial',
      engine: 'hyperframes',
      engineVersion: '0.9.94',
      inputFingerprint: 'f'.repeat(64),
      revisions: { compositionSha256: 'c'.repeat(64) },
      stale: false,
      findings: [
        {
          severity: 'warning',
          code: 'contrast_low',
          message: 'Low contrast',
          section: 'contrast',
          sourceFile: 'compositions/01-opening.html',
          fixHint: 'Increase foreground contrast',
          suggestedColor: '#111827'
        }
      ],
      skippedChecks: ['browser'],
      sectionStatuses: {
        lint: { status: 'passed', errorCount: 0, warningCount: 1 }
      },
      productionGate: {
        allowed: false,
        blockingReasons: ['Required browser layout/contrast audit was skipped']
      },
      summary: 'Partial check passed with 0 errors (browser skipped)',
      checkedAt: 1_700_000_000_000,
      browserSkipped: true
    })
    expect(report.productionGate.allowed).toBe(false)

    const env = HyperFramesEnvironmentReportSchema.parse({
      engine: 'hyperframes',
      available: true,
      status: 'ready',
      missingTools: [],
      doctorOk: true,
      pinnedVersion: '0.9.94',
      detectedVersion: '0.9.94',
      versionCompatibility: 'exact',
      resolutionSource: 'managed',
      summary: 'HyperFrames 0.9.94 ready'
    })
    expect(env.versionCompatibility).toBe('exact')
  })
})

describe('Storyboard & Research Contracts', () => {
  it('validates Frame-based SceneSpec, StoryboardDocument, and VideoStudioResearchSource', () => {
    const scene = SceneSpecSchema.parse({
      sceneId: 'scene_7a91c0',
      frameNumber: 1,
      title: 'Remote Temperature Trigger',
      status: 'outline',
      duration: '4s',
      transitionIn: 'cut',
      engine: 'hyperframes',
      src: 'compositions/01-remote-trigger.html',
      assets: ['remote_001:idle'],
      motionPresets: ['camera.smooth_zoom', 'typography.counter_up'],
      camera: 'orthographic',
      narrativeRole: 'hook',
      voiceover: 'Lower temperature settings do not cool your room faster.',
      notes: 'Focus on the remote LCD dropping from 25C to 16C.',
      lockedSections: ['timing'],
      extra: { custom_tag: 'lcd-zoom' }
    })
    expect(scene.sceneId).toBe('scene_7a91c0')

    const storyboard = StoryboardDocumentSchema.parse({
      frontmatter: {
        format: '1080x1920',
        duration: '60s',
        message: 'How heat transfer drives AC power consumption',
        arc: 'Hook -> Mechanism -> Comparison -> Conclusion',
        audience: 'General tech-curious viewers',
        styleProfile: 'technical-explainer-01'
      },
      frames: [scene],
      lockedSections: [{ title: 'Locked', body: '- Brand logo timing locked' }]
    })
    expect(storyboard.frames).toHaveLength(1)

    const source = VideoStudioResearchSourceSchema.parse({
      id: 'src_1',
      url: 'https://energy.gov/energysaver/air-conditioning',
      title: 'Air Conditioning Guide',
      domain: 'energy.gov',
      accessedAt: 1_700_000_000_000,
      origin: 'deep-research',
      verificationStatus: 'verified',
      claimIds: ['claim_1']
    })
    expect(source.verificationStatus).toBe('verified')
  })
})

describe('Motion Registry & OpenMotion Contracts', () => {
  it('enforces executionKind consistency so knowledge-only and planned presets are never reported executable', () => {
    const executablePreset = MotionPresetMetadataSchema.parse({
      id: 'camera.smooth_zoom',
      version: '1.0.0',
      name: 'Smooth Zoom',
      category: 'camera',
      parameters: {
        scale: { type: 'number', default: 1.15, min: 1, max: 3 }
      },
      dependencies: ['gsap'],
      executionKind: 'executable',
      implementations: {
        hyperframes: { status: 'executable', adapterType: 'gsap-timeline' },
        remotion: { status: 'planned' }
      }
    })
    expect(isMotionPresetExecutable(executablePreset, 'hyperframes')).toBe(true)
    expect(isMotionPresetExecutable(executablePreset, 'remotion')).toBe(false)

    const knowledgePreset = MotionPresetMetadataSchema.parse({
      id: 'diagram.flow_path',
      version: '1.0.0',
      category: 'diagram',
      parameters: {},
      dependencies: [],
      executionKind: 'knowledge-only',
      implementations: {
        hyperframes: { status: 'knowledge-only' }
      }
    })
    expect(isMotionPresetExecutable(knowledgePreset)).toBe(false)

    expect(
      MotionPresetMetadataSchema.safeParse({
        id: 'diagram.bad',
        version: '1.0.0',
        category: 'diagram',
        parameters: {},
        dependencies: [],
        executionKind: 'knowledge-only',
        implementations: {
          hyperframes: { status: 'executable', adapterType: 'gsap' }
        }
      }).success
    ).toBe(false)

    expect(
      MotionPresetMetadataSchema.safeParse({
        id: 'chart.bad',
        version: '1.0.0',
        category: 'chart',
        parameters: {},
        dependencies: [],
        executionKind: 'planned',
        implementations: {
          hyperframes: { status: 'executable', adapterType: 'svg' }
        }
      }).success
    ).toBe(false)

    expect(
      MotionPresetMetadataSchema.safeParse({
        id: 'camera.unbacked',
        version: '1.0.0',
        category: 'camera',
        parameters: {},
        dependencies: [],
        executionKind: 'executable',
        implementations: {
          hyperframes: { status: 'planned' }
        }
      }).success
    ).toBe(false)
  })
})

describe('Master Asset Invariants', () => {
  it('accepts valid multi-state acyclic assets and rejects invalid defaultState, duplicate component IDs, and parent cycles', () => {
    const parsed = MasterAssetRecordSchema.parse(validAsset)
    expect(validateMasterAssetInvariants(parsed)).toEqual({ ok: true, errors: [] })

    const missingDefault = validateMasterAssetInvariants({
      ...parsed,
      defaultState: 'nonexistent'
    })
    expect(missingDefault.ok).toBe(false)
    expect(missingDefault.errors.join(' ')).toContain('defaultState')

    const duplicateComponent = validateMasterAssetInvariants({
      ...parsed,
      components: [
        { id: 'fan', animatable: true },
        { id: 'fan', animatable: false }
      ]
    })
    expect(duplicateComponent.ok).toBe(false)
    expect(duplicateComponent.errors.join(' ')).toContain('fan')

    const unknownParent = validateMasterAssetInvariants({
      ...parsed,
      components: [{ id: 'fan', parentComponentId: 'missing', animatable: true }]
    })
    expect(unknownParent.ok).toBe(false)

    const selfParent = validateMasterAssetInvariants({
      ...parsed,
      components: [{ id: 'fan', parentComponentId: 'fan', animatable: true }]
    })
    expect(selfParent.ok).toBe(false)

    const cycle = validateMasterAssetInvariants({
      ...parsed,
      components: [
        { id: 'a', parentComponentId: 'b', animatable: true },
        { id: 'b', parentComponentId: 'c', animatable: true },
        { id: 'c', parentComponentId: 'a', animatable: true }
      ]
    })
    expect(cycle.ok).toBe(false)
    expect(cycle.errors.join(' ').toLowerCase()).toContain('cycle')

    const warning = dynamicReferenceWarning(
      'compositions/02-cutaway.html',
      'Dynamic template literal references assets/objects/',
      '`assets/objects/${id}/operating.svg`'
    )
    expect(warning.file).toBe('compositions/02-cutaway.html')
  })
})

describe('Complete Spec RPC Contracts & Passthrough Codes', () => {
  it('binds exact Spec RPC method names and validates all new RPC param schemas', () => {
    expect([
      VIDEO_STUDIO_LIST_STYLE_PROFILES_METHOD,
      VIDEO_STUDIO_SAVE_LIBRARY_STYLE_PROFILE_METHOD,
      VIDEO_STUDIO_DUPLICATE_STYLE_PROFILE_METHOD,
      VIDEO_STUDIO_DELETE_LIBRARY_STYLE_PROFILE_METHOD,
      VIDEO_STUDIO_GET_PROJECT_STYLE_STATE_METHOD,
      VIDEO_STUDIO_APPLY_STYLE_PROFILE_TO_PROJECT_METHOD,
      VIDEO_STUDIO_UPDATE_PROJECT_STYLE_TOKENS_METHOD,
      VIDEO_STUDIO_GET_STYLE_RECONCILIATION_DIFF_METHOD,
      VIDEO_STUDIO_RECONCILE_PROJECT_STYLE_METHOD,
      VIDEO_STUDIO_GET_PROJECT_DOCUMENTS_METHOD,
      VIDEO_STUDIO_UPDATE_PROJECT_BRIEF_METHOD,
      VIDEO_STUDIO_UPDATE_PROJECT_SCRIPT_METHOD,
      VIDEO_STUDIO_UPSERT_RESEARCH_SOURCE_METHOD,
      VIDEO_STUDIO_DELETE_RESEARCH_SOURCE_METHOD,
      VIDEO_STUDIO_APPROVE_PROJECT_EXECUTION_METHOD,
      VIDEO_STUDIO_ADD_STORYBOARD_FRAME_METHOD,
      VIDEO_STUDIO_PATCH_STORYBOARD_FRAME_METHOD,
      VIDEO_STUDIO_DELETE_STORYBOARD_FRAME_METHOD,
      VIDEO_STUDIO_REORDER_STORYBOARD_FRAMES_METHOD,
      VIDEO_STUDIO_LIST_LIBRARY_ASSETS_METHOD,
      VIDEO_STUDIO_LIST_PROJECT_ASSETS_METHOD,
      VIDEO_STUDIO_REGISTER_OR_IMPORT_ASSET_METHOD,
      VIDEO_STUDIO_UPDATE_ASSET_METADATA_METHOD,
      VIDEO_STUDIO_APPLY_LIBRARY_ASSET_TO_PROJECT_METHOD,
      VIDEO_STUDIO_SAVE_PROJECT_ASSET_TO_LIBRARY_METHOD,
      VIDEO_STUDIO_REMOVE_PROJECT_ASSET_METHOD,
      VIDEO_STUDIO_DELETE_LIBRARY_ASSET_METHOD,
      VIDEO_STUDIO_LIST_MOTION_PRESETS_METHOD
    ]).toEqual([
      'videoStudio.listStyleProfiles',
      'videoStudio.saveLibraryStyleProfile',
      'videoStudio.duplicateStyleProfile',
      'videoStudio.deleteLibraryStyleProfile',
      'videoStudio.getProjectStyleState',
      'videoStudio.applyStyleProfileToProject',
      'videoStudio.updateProjectStyleTokens',
      'videoStudio.getStyleReconciliationDiff',
      'videoStudio.reconcileProjectStyle',
      'videoStudio.getProjectDocuments',
      'videoStudio.updateProjectBrief',
      'videoStudio.updateProjectScript',
      'videoStudio.upsertResearchSource',
      'videoStudio.deleteResearchSource',
      'videoStudio.approveProjectExecution',
      'videoStudio.addStoryboardFrame',
      'videoStudio.patchStoryboardFrame',
      'videoStudio.deleteStoryboardFrame',
      'videoStudio.reorderStoryboardFrames',
      'videoStudio.listLibraryAssets',
      'videoStudio.listProjectAssets',
      'videoStudio.registerOrImportAsset',
      'videoStudio.updateAssetMetadata',
      'videoStudio.applyLibraryAssetToProject',
      'videoStudio.saveProjectAssetToLibrary',
      'videoStudio.removeProjectAsset',
      'videoStudio.deleteLibraryAsset',
      'videoStudio.listMotionPresets'
    ])

    expect(VideoStudioListStyleProfilesParams.safeParse({}).success).toBe(true)
    expect(
      VideoStudioSaveLibraryStyleProfileParams.safeParse({
        profile: { ...validStyleProfile, tier: 'library' },
        expectedRevision: 'rev-1',
        designMarkdown: '# Design\n'
      }).success
    ).toBe(true)
    expect(
      VideoStudioDuplicateStyleProfileParams.safeParse({
        sourceStyleId: 'technical-explainer-01',
        newStyleId: 'my-explainer',
        name: 'My Explainer'
      }).success
    ).toBe(true)
    expect(
      VideoStudioDeleteLibraryStyleProfileParams.safeParse({ styleId: 'my-explainer' }).success
    ).toBe(true)
    expect(VideoStudioGetProjectStyleStateParams.safeParse({ projectId: 'p1' }).success).toBe(true)
    expect(
      VideoStudioApplyStyleProfileToProjectParams.safeParse({
        projectId: 'p1',
        styleId: 'technical-explainer-01'
      }).success
    ).toBe(true)
    expect(
      VideoStudioUpdateProjectStyleTokensParams.safeParse({
        projectId: 'p1',
        tokens: { visual: { palette: { accentPrimary: '#1D4ED8' } } },
        expectedRevision: 'sha-1'
      }).success
    ).toBe(true)
    expect(VideoStudioGetStyleReconciliationDiffParams.safeParse({ projectId: 'p1' }).success).toBe(
      true
    )
    expect(
      VideoStudioReconcileProjectStyleParams.safeParse({
        projectId: 'p1',
        mode: 'import-from-markdown',
        sourceFile: 'frame.md'
      }).success
    ).toBe(true)
    expect(VideoStudioGetProjectDocumentsParams.safeParse({ projectId: 'p1' }).success).toBe(true)
    expect(
      VideoStudioUpdateProjectBriefParams.safeParse({
        projectId: 'p1',
        frontmatter: { message: 'Heat transfer' },
        expectedRevision: 'r1'
      }).success
    ).toBe(true)
    expect(
      VideoStudioUpdateProjectScriptParams.safeParse({
        projectId: 'p1',
        scriptMarkdown: '# Narration\nHello world',
        expectedRevision: 'r1'
      }).success
    ).toBe(true)
    expect(
      VideoStudioUpsertResearchSourceParams.safeParse({
        projectId: 'p1',
        source: {
          url: 'https://example.com/paper',
          title: 'Paper',
          origin: 'manual',
          verificationStatus: 'verified',
          claimIds: []
        }
      }).success
    ).toBe(true)
    expect(
      VideoStudioUpsertResearchSourceParams.safeParse({
        projectId: 'p1',
        source: {
          url: 'file:///etc/passwd',
          title: 'Local',
          origin: 'manual',
          verificationStatus: 'unverified',
          claimIds: []
        }
      }).success
    ).toBe(false)
    expect(
      VideoStudioDeleteResearchSourceParams.safeParse({
        projectId: 'p1',
        sourceId: 'src_1'
      }).success
    ).toBe(true)
    expect(
      VideoStudioApproveProjectExecutionParams.safeParse({
        projectId: 'p1',
        trustState: 'approved-render',
        inputFingerprint: 'a'.repeat(64)
      }).success
    ).toBe(true)
    expect(
      VideoStudioAddStoryboardFrameParams.safeParse({
        projectId: 'p1',
        frame: {
          title: 'Hook',
          duration: '4s',
          transitionIn: 'cut',
          motionPresets: ['camera.smooth_zoom']
        }
      }).success
    ).toBe(true)
    expect(
      VideoStudioPatchStoryboardFrameParams.safeParse({
        projectId: 'p1',
        sceneId: 'scene_7a91c0',
        patch: { title: 'Updated Hook', duration: 5 }
      }).success
    ).toBe(true)
    expect(
      VideoStudioDeleteStoryboardFrameParams.safeParse({
        projectId: 'p1',
        sceneId: 'scene_7a91c0'
      }).success
    ).toBe(true)
    expect(
      VideoStudioReorderStoryboardFramesParams.safeParse({
        projectId: 'p1',
        sceneIds: ['scene_2', 'scene_1']
      }).success
    ).toBe(true)
    expect(VideoStudioListLibraryAssetsParams.safeParse({}).success).toBe(true)
    expect(VideoStudioListProjectAssetsParams.safeParse({ projectId: 'p1' }).success).toBe(true)
    expect(
      VideoStudioRegisterOrImportAssetParams.safeParse({
        scope: 'project',
        projectId: 'p1',
        asset: {
          id: 'ac_indoor_001',
          name: 'Indoor AC Unit',
          type: 'object',
          format: 'svg',
          defaultState: 'closed',
          stateFiles: {
            closed: { contentBase64: Buffer.from('<svg/>').toString('base64') }
          }
        }
      }).success
    ).toBe(true)
    expect(
      VideoStudioUpdateAssetMetadataParams.safeParse({
        projectId: 'p1',
        assetId: 'ac_indoor_001',
        changes: {
          tags: ['hvac'],
          upsertStates: { cutaway: { relativePath: 'assets/objects/ac/cutaway.svg' } }
        }
      }).success
    ).toBe(true)
    expect(
      VideoStudioApplyLibraryAssetToProjectParams.safeParse({
        projectId: 'p1',
        assetId: 'ac_indoor_001',
        version: 1
      }).success
    ).toBe(true)
    expect(
      VideoStudioSaveProjectAssetToLibraryParams.safeParse({
        projectId: 'p1',
        assetId: 'ac_indoor_001',
        expectedProjectRevision: 'rev-1'
      }).success
    ).toBe(true)
    expect(
      VideoStudioRemoveProjectAssetParams.safeParse({
        projectId: 'p1',
        assetId: 'ac_indoor_001',
        force: false,
        forceDeleteFiles: false
      }).success
    ).toBe(true)
    expect(
      VideoStudioDeleteLibraryAssetParams.safeParse({
        assetId: 'ac_indoor_001',
        version: 1
      }).success
    ).toBe(true)
    expect(
      VideoStudioListMotionPresetsParams.safeParse({
        category: 'camera',
        engine: 'hyperframes'
      }).success
    ).toBe(true)

    expect(
      VideoStudioStartRenderParams.safeParse({
        projectId: 'p1',
        quality: 'looks',
        startSeconds: 2,
        endSeconds: 8
      }).success
    ).toBe(true)
    expect(
      VideoStudioStartRenderParams.safeParse({
        projectId: 'p1',
        quality: 'looks',
        startSeconds: 5,
        endSeconds: 5
      }).success
    ).toBe(false)
    expect(
      VideoStudioStartRenderParams.safeParse({
        projectId: 'p1',
        quality: 'looks',
        startSeconds: 10,
        endSeconds: 4
      }).success
    ).toBe(false)

    expect(
      StyleProfileTokensPatchSchema.safeParse({
        visual: { palette: { accentPrimary: '#1D4ED8', unknownColor: '#000000' } }
      }).success
    ).toBe(false)

    const filesChanged = {
      type: 'projectFilesChanged' as const,
      projectId: 'p1',
      changedPaths: ['STORYBOARD.md', 'styles/style-profile.json'],
      revisions: { 'STORYBOARD.md': 'sha256:111' },
      externalEdit: true,
      timestamp: 1_700_000_000_000
    }
    expect(VideoStudioProjectFilesChangedEventSchema.parse(filesChanged)).toEqual(filesChanged)
    expect(VideoStudioSubscribeJobsEventSchema.parse(filesChanged)).toEqual(filesChanged)
    expect(
      VideoStudioJobsEventSchema.parse({
        revision: 2,
        jobs: [],
        previews: {},
        projectFilesChanged: {
          projectId: 'p1',
          changedPaths: ['BRIEF.md'],
          revisions: { 'BRIEF.md': 'sha256:222' },
          externalEdit: false,
          timestamp: 1_700_000_000_100
        }
      }).projectFilesChanged?.changedPaths
    ).toEqual(['BRIEF.md'])
  })

  it('enforces SafeResourceIdSchema across styles, assets, scenes, and project styleProfileId', () => {
    const schema = createSafeResourceIdSchema('test id')
    for (const valid of ['ac_indoor_001', 'technical-explainer-01', 'scene_7a91c0']) {
      expect(SafeResourceIdSchema.safeParse(valid).success).toBe(true)
      expect(schema.safeParse(valid).success).toBe(true)
    }
    for (const invalid of ['', '   ', '.env', '.orca', '..', '../escape', 'a/b', 'a\\b']) {
      expect(schema.safeParse(invalid).success).toBe(false)
      expect(
        VideoStudioApplyStyleProfileToProjectParams.safeParse({
          projectId: 'p1',
          styleId: invalid
        }).success
      ).toBe(false)
      expect(
        VideoStudioDeleteStoryboardFrameParams.safeParse({
          projectId: 'p1',
          sceneId: invalid
        }).success
      ).toBe(false)
      expect(
        VideoStudioDeleteLibraryAssetParams.safeParse({
          assetId: invalid
        }).success
      ).toBe(false)
      expect(VideoStudioProjectFields.shape.styleProfileId.safeParse(invalid).success).toBe(false)
    }
  })
})
