import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BUILTIN_MOTION_PRESETS,
  type MotionPresetMetadata
} from '../../../shared/video-studio/motion-registry-contract'
import { StoryboardFramePatchSchema } from '../../../shared/video-studio/video-studio-document-rpc-contract'
import { StoryboardDocumentSchema } from '../../../shared/video-studio/video-studio-storyboard-contract'
import { UniversalMotionRegistry } from '../motion/builtin-motion-presets'
import { BUILTIN_STYLE_PRESETS } from '../style/builtin-style-presets'
import { resolveVideoStudioProjectDir } from '../video-studio-composition-paths'
import { buildDefaultStyleProfile } from '../video-studio-default-styles'
import { buildDocumentSeeds } from '../video-studio-document-seeds'
import { scaffoldHyperFramesComposition } from '../video-studio-hyperframes-template'
import { computeCompositionDrift } from './video-studio-composition-drift'
import { formatStoryboardMarkdown, parseStoryboardMarkdown } from './video-studio-markdown-sync'
import { VideoStudioProjectDocumentsStore } from './video-studio-project-documents'

const mockProject = {
  id: 'proj-doc-1',
  title: 'AC Heat Transfer Explainer',
  prompt: 'Show why 16C does not cool faster than 24C.',
  aspectRatio: '9:16' as const,
  durationSeconds: 30,
  workflowStage: 'style' as const,
  engine: 'hyperframes' as const,
  fps: 30,
  renders: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000
}

const VERBATIM_HYPERFRAMES_STORYBOARD_CRLF = [
  '---',
  'format: 1080x1920',
  'duration: 60s',
  'message: "How heat transfer drives AC power consumption"',
  'arc: Hook -> Mechanism -> Comparison -> Conclusion',
  'audience: General tech-curious viewers',
  'style_profile: technical-explainer-01',
  'custom_project_tag: phase-03-benchmark',
  '---',
  '',
  '## Frame 1 — Remote Temperature Trigger',
  '',
  '- scene_id: scene_7a91c0',
  '- status: outline',
  '- duration: 4s',
  '- transition_in: cut',
  '- engine: hyperframes',
  '- src: compositions/01-remote-trigger.html',
  '- assets: remote_001:idle',
  '- motion_presets: camera.smooth_zoom, typography.counter_up',
  '- camera: orthographic',
  '- narrative_role: hook',
  '- voiceover: "Lower temperature settings do not cool your room faster."',
  '- custom_beat: lcd-focus',
  '',
  'Focus on the remote LCD rising/dropping from 25°C to 16°C at center frame.',
  '',
  '## Frame 2 — Compressor Steady Output',
  '',
  '- scene_id: scene_8b42d1',
  '- status: built',
  '- duration: 8s',
  '- transition_in: slide-left',
  '- engine: hyperframes',
  '- src: compositions/02-compressor.html',
  '- assets:',
  '- motion_presets: diagram.flow_path',
  '- camera: orthographic',
  '- narrative_role: mechanism',
  '- voiceover: ""',
  '',
  'Show steady refrigerant flow inside evaporator coils.',
  '',
  '## Locked',
  '',
  'Keep 80% title-safe margin and disclaimer timing intact.',
  ''
].join('\r\n')

let tempRoot: string
let profileDir: string
let projectDir: string

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'orca-vs-docs-'))
  profileDir = join(tempRoot, 'profile')
  projectDir = resolveVideoStudioProjectDir(profileDir, mockProject.id)
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Universal Motion Registry status separation', () => {
  it('resolves all preset/seed motion_presets IDs and never reports knowledge-only or planned presets as executable', () => {
    const registry = new UniversalMotionRegistry()
    const listed = registry.listMotionPresets()
    expect(listed.map((p) => p.id)).toEqual(BUILTIN_MOTION_PRESETS.map((p) => p.id))

    // Built-in knowledge-only / planned presets must NEVER appear when executableOnly: true
    expect(registry.listMotionPresets({ executableOnly: true })).toEqual([])
    expect(registry.listMotionPresets({ engine: 'hyperframes', executableOnly: true })).toEqual([])
    expect(registry.listMotionPresets({ engine: 'remotion', executableOnly: true })).toEqual([])

    for (const preset of BUILTIN_STYLE_PRESETS) {
      const check = registry.resolveMotionPresetRefs(preset.motion.motionPresetRefs, 'hyperframes')
      expect(check.unknownIds).toEqual([])
      expect(check.executableIds).toEqual([])
      expect(check.nonExecutableIds).toEqual(preset.motion.motionPresetRefs)
    }

    expect(registry.getPresetStatus('camera.smooth_zoom', 'hyperframes')).toEqual({
      found: true,
      executionKind: 'knowledge-only',
      engineStatus: 'knowledge-only',
      executable: false
    })
    expect(registry.getPresetStatus('camera.smooth_zoom', 'remotion')).toEqual({
      found: true,
      executionKind: 'knowledge-only',
      engineStatus: 'planned',
      executable: false
    })

    // Registering an explicitly executable custom preset cleanly separates it from knowledge-only/planned
    const customExecutable: MotionPresetMetadata = {
      id: 'custom.fade_in',
      version: '1.0.0',
      category: 'object',
      parameters: {},
      dependencies: [],
      executionKind: 'executable',
      implementations: {
        hyperframes: { status: 'executable', adapterType: 'gsap' },
        remotion: { status: 'planned' }
      }
    }
    const extended = new UniversalMotionRegistry([...BUILTIN_MOTION_PRESETS, customExecutable])
    expect(
      extended.listMotionPresets({ engine: 'hyperframes', executableOnly: true }).map((p) => p.id)
    ).toEqual(['custom.fade_in'])
    expect(extended.listMotionPresets({ engine: 'remotion', executableOnly: true })).toEqual([])
  })
})

describe('STORYBOARD.md Frame round-trip, ProjectDocumentsStore & Composition Drift', () => {
  it('round-trips verbatim HyperFrames ## Frame N fixture across reorder/rename preserving scene_id, ## Locked, extra YAML, and CRLF', async () => {
    const parsed = StoryboardDocumentSchema.parse(
      parseStoryboardMarkdown(VERBATIM_HYPERFRAMES_STORYBOARD_CRLF)
    )
    expect(parsed.frontmatter.styleProfile).toBe('technical-explainer-01')
    expect(parsed.frontmatter.extra).toEqual({ custom_project_tag: 'phase-03-benchmark' })
    expect(parsed.frames).toHaveLength(2)
    expect(parsed.frames[0]).toMatchObject({
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
      extra: { custom_beat: 'lcd-focus' }
    })
    expect(parsed.frames[1].assets).toEqual([])
    expect(parsed.frames[1].voiceover).toBe('')
    expect(parsed.lockedSections).toEqual([
      { title: 'Locked', body: 'Keep 80% title-safe margin and disclaimer timing intact.' }
    ])

    await scaffoldHyperFramesComposition(projectDir, mockProject)
    await writeFile(join(projectDir, 'STORYBOARD.md'), VERBATIM_HYPERFRAMES_STORYBOARD_CRLF, 'utf8')
    const docStore = new VideoStudioProjectDocumentsStore(profileDir)
    const initialDocs = await docStore.getProjectDocuments(mockProject.id)
    const sbRev = initialDocs.revisions['STORYBOARD.md']

    const reordered = await docStore.reorderStoryboardFrames({
      projectId: mockProject.id,
      sceneIds: ['scene_8b42d1', 'scene_7a91c0'],
      expectedRevision: sbRev
    })
    expect(reordered.storyboard.frames.map((f) => [f.frameNumber, f.sceneId])).toEqual([
      [1, 'scene_8b42d1'],
      [2, 'scene_7a91c0']
    ])

    expect(StoryboardFramePatchSchema.parse({ title: 'Remote Setpoint Drop' })).toEqual({
      title: 'Remote Setpoint Drop'
    })
    const patched = await docStore.patchStoryboardFrame({
      projectId: mockProject.id,
      sceneId: 'scene_7a91c0',
      patch: { title: 'Remote Setpoint Drop' },
      expectedRevision: reordered.revision
    })
    expect(patched.frame.sceneId).toBe('scene_7a91c0')
    expect(patched.frame.frameNumber).toBe(2)
    expect(patched.frame.assets).toEqual(['remote_001:idle'])
    expect(patched.frame.motionPresets).toEqual(['camera.smooth_zoom', 'typography.counter_up'])

    const rawAfter = await readFile(join(projectDir, 'STORYBOARD.md'), 'utf8')
    expect(rawAfter).toContain('\r\n')
    const reparsed = parseStoryboardMarkdown(rawAfter)
    expect(reparsed.frontmatter.extra).toEqual({ custom_project_tag: 'phase-03-benchmark' })
    expect(reparsed.frames[1].sceneId).toBe('scene_7a91c0')
    expect(reparsed.frames[1].title).toBe('Remote Setpoint Drop')
    expect(reparsed.frames[1].extra).toEqual({ custom_beat: 'lcd-focus' })
    expect(reparsed.lockedSections).toEqual([
      { title: 'Locked', body: 'Keep 80% title-safe margin and disclaimer timing intact.' }
    ])

    // Seeded STORYBOARD.md parses cleanly with empty `- assets:` -> []
    const seeds = buildDocumentSeeds(mockProject, buildDefaultStyleProfile(mockProject))
    const parsedSeed = parseStoryboardMarkdown(seeds['STORYBOARD.md'])
    expect(parsedSeed.frames[0].assets).toEqual([])
    expect(formatStoryboardMarkdown(parsedSeed)).toContain('- assets:')
  })

  it('enforces expectedRevision and video_studio_scene_not_found across brief, script, research sources, and storyboard mutations', async () => {
    await scaffoldHyperFramesComposition(projectDir, mockProject)
    const docStore = new VideoStudioProjectDocumentsStore(profileDir)
    const docs = await docStore.getProjectDocuments(mockProject.id)

    await expect(
      docStore.updateProjectBrief({
        projectId: mockProject.id,
        frontmatter: { audience: 'Engineers' },
        expectedRevision: 'stale-sha'
      })
    ).rejects.toThrow('video_studio_file_conflict')

    const briefRes = await docStore.updateProjectBrief({
      projectId: mockProject.id,
      frontmatter: { audience: 'Engineers' },
      expectedRevision: docs.revisions['BRIEF.md']
    })
    expect(briefRes.revision).not.toBe(docs.revisions['BRIEF.md'])
    expect((await docStore.getProjectDocuments(mockProject.id)).briefFrontmatter.audience).toBe(
      'Engineers'
    )

    await expect(
      docStore.updateProjectScript({
        projectId: mockProject.id,
        scriptMarkdown: '# Final Narration\n\nWait.',
        expectedRevision: 'stale-sha'
      })
    ).rejects.toThrow('video_studio_file_conflict')

    const scriptRes = await docStore.updateProjectScript({
      projectId: mockProject.id,
      scriptMarkdown: '# Final Narration\n\nLocked copy.',
      expectedRevision: docs.revisions['SCRIPT.md']
    })
    expect(scriptRes.revision).toBeTruthy()

    const addedSource = await docStore.upsertResearchSource({
      projectId: mockProject.id,
      source: {
        url: 'https://energy.gov/energysaver/air-conditioning',
        title: 'Air Conditioning Guide',
        origin: 'manual',
        verificationStatus: 'verified',
        claimIds: ['claim_1']
      },
      expectedRevision: docs.revisions['references/sources.json']
    })
    expect(addedSource.source.domain).toBe('energy.gov')
    expect(await readFile(join(projectDir, 'references', 'research-notes.md'), 'utf8')).toContain(
      'Air Conditioning Guide'
    )
    expect(await readFile(join(projectDir, 'references', 'research-notes.md'), 'utf8')).toContain(
      mockProject.prompt
    )

    await expect(
      docStore.deleteResearchSource({
        projectId: mockProject.id,
        sourceId: addedSource.source.id,
        expectedRevision: docs.revisions['references/sources.json']
      })
    ).rejects.toThrow('video_studio_file_conflict')

    await docStore.deleteResearchSource({
      projectId: mockProject.id,
      sourceId: addedSource.source.id,
      expectedRevision: addedSource.revision
    })
    expect((await docStore.getProjectDocuments(mockProject.id)).researchSources).toEqual([])

    const addedFrame = await docStore.addStoryboardFrame({
      projectId: mockProject.id,
      frame: {
        title: 'New Scene',
        status: 'outline',
        duration: '6s',
        engine: 'hyperframes',
        src: 'compositions/02-new.html',
        assets: [],
        motionPresets: ['camera.pan'],
        lockedSections: [],
        extra: {}
      },
      expectedRevision: docs.revisions['STORYBOARD.md']
    })
    expect(addedFrame.frame.sceneId).toMatch(/^scene_/)
    expect(addedFrame.storyboard.frames).toHaveLength(2)

    await expect(
      docStore.patchStoryboardFrame({
        projectId: mockProject.id,
        sceneId: 'scene_missing',
        patch: { title: 'Nope' }
      })
    ).rejects.toThrow('video_studio_scene_not_found')

    await expect(
      docStore.deleteStoryboardFrame({
        projectId: mockProject.id,
        sceneId: 'scene_missing'
      })
    ).rejects.toThrow('video_studio_scene_not_found')

    const deletedFrame = await docStore.deleteStoryboardFrame({
      projectId: mockProject.id,
      sceneId: addedFrame.frame.sceneId,
      expectedRevision: addedFrame.revision
    })
    expect(deletedFrame.deleted).toBe(true)
    expect(deletedFrame.storyboard.frames).toHaveLength(1)
  })

  it('computes composition drift for 6s planned vs 8s actual, unmounted scenes, missing files, and motion preset statuses', async () => {
    await scaffoldHyperFramesComposition(projectDir, mockProject)
    const cleanDrift = await computeCompositionDrift(projectDir)
    expect(cleanDrift.inSync).toBe(true)
    expect(cleanDrift.hasWarnings).toBe(false)
    expect(cleanDrift.items).toEqual([
      expect.objectContaining({
        kind: 'non-executable-motion-preset',
        severity: 'info',
        presetId: 'camera.smooth_zoom',
        presetStatus: 'knowledge-only'
      })
    ])

    await writeFile(
      join(projectDir, 'compositions', '01-opening.html'),
      `<template id="tpl-01-opening"><div data-composition-id="01-opening" data-duration="8"></div></template>`,
      'utf8'
    )
    await mkdir(join(projectDir, 'compositions'), { recursive: true })
    await writeFile(
      join(projectDir, 'compositions', '02-unmounted.html'),
      `<template id="tpl-02"><div data-composition-id="02-unmounted" data-duration="5"></div></template>`,
      'utf8'
    )
    await writeFile(
      join(projectDir, 'STORYBOARD.md'),
      [
        '---',
        'format: 1920x1080',
        'duration: 15s',
        '---',
        '',
        '## Frame 1 — Opening',
        '',
        '- scene_id: scene_01',
        '- status: built',
        '- duration: 6s',
        '- engine: hyperframes',
        '- src: compositions/01-opening.html',
        '- assets:',
        '- motion_presets: camera.smooth_zoom, unknown.magic_fx',
        '',
        '## Frame 2 — Detail',
        '',
        '- scene_id: scene_02',
        '- status: outline',
        '- duration: 5s',
        '- engine: hyperframes',
        '- src: compositions/02-unmounted.html',
        '- assets:',
        '- motion_presets: diagram.flow_path',
        '',
        '## Frame 3 — Missing',
        '',
        '- scene_id: scene_03',
        '- status: outline',
        '- duration: 4s',
        '- engine: hyperframes',
        '- src: compositions/03-missing.html',
        '- assets:',
        '- motion_presets:',
        ''
      ].join('\n'),
      'utf8'
    )

    const drift = await computeCompositionDrift(projectDir)
    expect(drift.inSync).toBe(false)
    expect(drift.hasWarnings).toBe(true)
    expect(drift.plannedTotalDurationSeconds).toBe(15)
    expect(drift.unmountedScenes).toEqual(['scene_02', 'scene_03'])
    expect(drift.missingFiles).toEqual(['compositions/03-missing.html'])
    expect(drift.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'duration-mismatch',
          sceneId: 'scene_01',
          plannedDurationSeconds: 6,
          actualDurationSeconds: 8
        }),
        expect.objectContaining({
          kind: 'unmounted-scene',
          sceneId: 'scene_02',
          src: 'compositions/02-unmounted.html'
        }),
        expect.objectContaining({
          kind: 'missing-composition-file',
          sceneId: 'scene_03',
          src: 'compositions/03-missing.html'
        }),
        expect.objectContaining({
          kind: 'unknown-motion-preset',
          sceneId: 'scene_01',
          presetId: 'unknown.magic_fx',
          presetStatus: 'unknown'
        }),
        expect.objectContaining({
          kind: 'non-executable-motion-preset',
          sceneId: 'scene_01',
          presetId: 'camera.smooth_zoom',
          presetStatus: 'knowledge-only'
        })
      ])
    )
  })
})
