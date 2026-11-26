import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StyleProfileSchema } from '../../../shared/video-studio/video-studio-style-contract'
import { resolveVideoStudioProjectDir } from '../video-studio-composition-paths'
import { buildDefaultStyleProfile } from '../video-studio-default-styles'
import { buildDocumentSeeds } from '../video-studio-document-seeds'
import { buildIndexHtml, buildOpeningCompositionHtml } from '../video-studio-html-templates'
import { scaffoldHyperFramesComposition } from '../video-studio-hyperframes-template'
import { BUILTIN_STYLE_PRESETS, getBuiltinStylePreset } from './builtin-style-presets'
import { VideoStudioStyleStore } from './video-studio-style-store'

const mockProject = {
  id: 'proj-style-1',
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

let tempRoot: string
let profileDir: string
let projectDir: string

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'orca-vs-style-'))
  profileDir = join(tempRoot, 'profile')
  projectDir = resolveVideoStudioProjectDir(profileDir, mockProject.id)
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Built-in StyleProfile presets and CSS/HTML token validation', () => {
  it('defines technical-explainer-01 and clean-editorial-01 with full 9-block schemas and shared single source of truth', () => {
    expect(BUILTIN_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      'technical-explainer-01',
      'clean-editorial-01'
    ])

    const tech = getBuiltinStylePreset('technical-explainer-01')!
    expect(tech).not.toBeNull()
    expect(tech.tier).toBe('built-in')
    expect(tech.visual.palette).toMatchObject({
      background: '#F7F3E9',
      surface: '#EFE7D6',
      primaryText: '#1E242B',
      accentPrimary: '#2563EB',
      accentSecondary: '#EA580C',
      highlight: '#FACC15'
    })
    expect(tech.visual.renderingStyle).toBe('2.5d-semi-realistic')
    expect(tech.typography).toMatchObject({
      displayFont: 'Space Grotesk',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono'
    })
    expect(tech.camera).toMatchObject({
      projection: 'orthographic',
      allowedMoves: ['pan', 'zoom', 'match-cut']
    })
    expect(tech.subtitle).toMatchObject({
      mode: 'word-highlight',
      backgroundColor: '#111827',
      textColor: '#FFFFFF',
      highlightColor: '#FACC15'
    })
    expect(tech.effects.allowedEffects).toContain('callout')
    expect(tech.composition.titleSafePercent).toBe(80)

    const editorial = getBuiltinStylePreset('clean-editorial-01')!
    expect(editorial.visual.renderingStyle).toBe('flat-editorial')
    expect(editorial.camera.projection).toBe('2d-flat')
    expect(editorial.subtitle.mode).toBe('anchor-rail')
    expect(editorial.visual.palette.background).toBe('#FAF9F6')
    expect(editorial.visual.palette.accentPrimary).toBe('#1D4ED8')

    // Consolidated with video-studio-default-styles.ts (zero divergence)
    const defaultTechSnapshot = buildDefaultStyleProfile(mockProject, 'technical-explainer-01')
    expect(defaultTechSnapshot.tier).toBe('snapshot')
    expect(defaultTechSnapshot.visual).toEqual(tech.visual)
    expect(defaultTechSnapshot.typography).toEqual(tech.typography)
    expect(defaultTechSnapshot.subtitle).toEqual(tech.subtitle)
    expect(defaultTechSnapshot.provenance).toEqual({
      sourceStyleId: 'technical-explainer-01',
      sourceTier: 'built-in',
      sourceVersion: 1,
      appliedAt: mockProject.createdAt
    })
  })

  it('rejects CSS/HTML injection in color palette and font family strings across stores and HTML/Markdown generators', async () => {
    const store = new VideoStudioStyleStore(profileDir)
    await scaffoldHyperFramesComposition(projectDir, mockProject)

    await expect(
      store.updateProjectStyleTokens({
        projectId: mockProject.id,
        tokens: {
          visual: {
            palette: {
              background: '#fff; } </style><script>alert(1)</script>'
            }
          }
        }
      })
    ).rejects.toThrow(/invalid/i)

    await expect(
      store.updateProjectStyleTokens({
        projectId: mockProject.id,
        tokens: {
          typography: {
            displayFont: 'Space Grotesk"; body { background: url(https://evil.test) }'
          }
        }
      })
    ).rejects.toThrow(/invalid/i)

    await expect(
      store.updateProjectStyleTokens({
        projectId: mockProject.id,
        tokens: {
          subtitle: {
            highlightColor: 'expression(alert(1))'
          }
        }
      })
    ).rejects.toThrow(/invalid/i)

    const base = buildDefaultStyleProfile(mockProject)
    const poisoned = StyleProfileSchema.parse({
      ...base,
      visual: {
        ...base.visual,
        palette: { ...base.visual.palette, background: '#fff; color: red' }
      }
    })
    expect(() => buildIndexHtml(mockProject, poisoned)).toThrow(/invalid/i)
    expect(() => buildOpeningCompositionHtml(mockProject, poisoned)).toThrow(/invalid/i)
    expect(() => buildDocumentSeeds(mockProject, poisoned)).toThrow(/invalid/i)
  })
})

describe('Dual-Scope Host Style Library, Snapshot Isolation & Markdown Reconciliation', () => {
  it('enforces readonly built-ins, immutable Host Library v1/v2 with DESIGN.md preservation, expectedRevision, and snapshot isolation', async () => {
    const store = new VideoStudioStyleStore(profileDir)
    const projA = mockProject.id
    const projB = 'proj-style-2'
    const dirA = resolveVideoStudioProjectDir(profileDir, projA)
    const dirB = resolveVideoStudioProjectDir(profileDir, projB)
    await scaffoldHyperFramesComposition(dirA, mockProject)
    await scaffoldHyperFramesComposition(dirB, { ...mockProject, id: projB, title: 'Inflation' })

    const tech = getBuiltinStylePreset('technical-explainer-01')!
    await expect(
      store.saveLibraryStyleProfile({
        profile: { ...tech, tier: 'library' }
      })
    ).rejects.toThrow('video_studio_style_readonly')

    await expect(
      store.deleteLibraryStyleProfile({ styleId: 'clean-editorial-01' })
    ).rejects.toThrow('video_studio_style_readonly')

    const duplicated = await store.duplicateStyleProfile({
      sourceStyleId: 'technical-explainer-01',
      newStyleId: 'brand-tech-01',
      name: 'Brand Tech 01'
    })
    expect(duplicated.profile.id).toBe('brand-tech-01')
    expect(duplicated.profile.tier).toBe('library')
    expect(duplicated.profile.version).toBe(1)

    const customDesignMd = [
      '# Design System — Brand Tech 01',
      '',
      '- Style Profile: `brand-tech-01` (v1)',
      '- Background: `#F7F3E9`',
      '',
      '## Brand Philosophy',
      '',
      'Always keep callout pills crisp with 2px charcoal outlines.'
    ].join('\n')

    const savedV1 = await store.saveLibraryStyleProfile({
      profile: duplicated.profile,
      expectedRevision: duplicated.revision,
      designMarkdown: customDesignMd
    })
    expect(savedV1.profile.version).toBe(2)

    await store.applyStyleProfileToProject({ projectId: projA, styleId: 'brand-tech-01' })
    const projADesign = await readFile(join(dirA, 'DESIGN.md'), 'utf8')
    expect(projADesign).toContain('Always keep callout pills crisp with 2px charcoal outlines.')

    // Stale expectedRevision fails
    await expect(
      store.saveLibraryStyleProfile({
        profile: {
          ...savedV1.profile,
          visual: {
            ...savedV1.profile.visual,
            palette: { ...savedV1.profile.visual.palette, accentPrimary: '#0F766E' }
          }
        },
        expectedRevision: duplicated.revision
      })
    ).rejects.toThrow('video_studio_file_conflict')

    // Save v3 in library: v2 immutable directory must remain untouched and proj-a snapshot must remain at v2
    const savedV3 = await store.saveLibraryStyleProfile({
      profile: {
        ...savedV1.profile,
        visual: {
          ...savedV1.profile.visual,
          palette: { ...savedV1.profile.visual.palette, accentPrimary: '#0F766E' }
        }
      },
      expectedRevision: savedV1.revision
    })
    expect(savedV3.profile.version).toBe(3)

    const stylesDir = join(profileDir, 'video-studio', 'styles', 'brand-tech-01')
    const immutableV2Profile = JSON.parse(
      await readFile(join(stylesDir, 'v2', 'style-profile.json'), 'utf8')
    )
    expect(immutableV2Profile.visual.palette.accentPrimary).toBe('#2563EB')

    const projAStateAfterLibUpdate = await store.getProjectStyleState(projA)
    expect(projAStateAfterLibUpdate.profile?.version).toBe(2)
    expect(projAStateAfterLibUpdate.profile?.visual.palette.accentPrimary).toBe('#2563EB')

    await store.applyStyleProfileToProject({ projectId: projB, styleId: 'brand-tech-01' })
    const projBState = await store.getProjectStyleState(projB)
    expect(projBState.profile?.version).toBe(3)
    expect(projBState.profile?.visual.palette.accentPrimary).toBe('#0F766E')
    expect(await readFile(join(dirB, 'DESIGN.md'), 'utf8')).toContain(
      'Always keep callout pills crisp with 2px charcoal outlines.'
    )

    // Deleting library style must not touch project snapshots
    const listed = await store.listStyleProfiles()
    expect(listed.profiles.map((p) => p.id)).toContain('brand-tech-01')
    await store.deleteLibraryStyleProfile({
      styleId: 'brand-tech-01',
      expectedRevision: savedV3.revision
    })
    expect((await store.getProjectStyleState(projB)).profile?.id).toBe('brand-tech-01')

    // Corrupt JSON in Host Style Library directory should skip cleanly without throwing SyntaxError
    const corruptDir = join(profileDir, 'video-studio', 'styles', 'corrupt-style')
    await mkdir(corruptDir, { recursive: true })
    await writeFile(join(corruptDir, 'library-meta.json'), '{corrupt', 'utf8')
    await writeFile(join(corruptDir, 'style-profile.json'), '{corrupt', 'utf8')
    expect((await store.listStyleProfiles()).profiles.map((p) => p.id)).toEqual([
      'technical-explainer-01',
      'clean-editorial-01'
    ])
  })

  it('syncs project tokens cleanly while preserving manual prose, detects external frame.md/MOTION.md drift, and reconciles both directions', async () => {
    const store = new VideoStudioStyleStore(profileDir)
    await scaffoldHyperFramesComposition(projectDir, mockProject)

    const initialState = await store.getProjectStyleState(mockProject.id)
    expect(initialState.markdownDrift).toBe(false)
    expect(initialState.driftedFiles).toEqual([])
    expect((await store.getStyleReconciliationDiff(mockProject.id)).inSync).toBe(true)

    // Append manual prose to frame.md and MOTION.md
    await writeFile(
      join(projectDir, 'frame.md'),
      `${await readFile(join(projectDir, 'frame.md'), 'utf8')}\n## Custom Agent Note\n\nPreserve diagram breathing room.\n`,
      'utf8'
    )
    await writeFile(
      join(projectDir, 'MOTION.md'),
      `${await readFile(join(projectDir, 'MOTION.md'), 'utf8')}\n## Custom Motion Note\n\nEase out slowly at ending frame.\n`,
      'utf8'
    )

    // Update token via store -> syncs JSON + frontmatter while preserving manual prose
    const updated = await store.updateProjectStyleTokens({
      projectId: mockProject.id,
      tokens: {
        visual: { palette: { accentSecondary: '#DC2626' } }
      },
      expectedRevision: initialState.revision!
    })
    expect(updated.profile.visual.palette.accentSecondary).toBe('#DC2626')
    expect(updated.profile.snapshotRevision).toBe('rev-2')
    expect(await readFile(join(projectDir, 'frame.md'), 'utf8')).toContain(
      'Preserve diagram breathing room.'
    )
    expect(await readFile(join(projectDir, 'MOTION.md'), 'utf8')).toContain(
      'Ease out slowly at ending frame.'
    )

    await expect(
      store.updateProjectStyleTokens({
        projectId: mockProject.id,
        tokens: { visual: { cornerRadiusPx: 16 } },
        expectedRevision: initialState.revision!
      })
    ).rejects.toThrow('video_studio_file_conflict')

    // Simulate external agent edit to frame.md + MOTION.md
    const frameContent = await readFile(join(projectDir, 'frame.md'), 'utf8')
    await writeFile(
      join(projectDir, 'frame.md'),
      frameContent.replace('#F7F3E9', '#101820').replace('Space Grotesk', 'IBM Plex Sans'),
      'utf8'
    )
    const motionContent = await readFile(join(projectDir, 'MOTION.md'), 'utf8')
    await writeFile(
      join(projectDir, 'MOTION.md'),
      motionContent.replace('pacing: measured', 'pacing: snappy'),
      'utf8'
    )

    const driftedState = await store.getProjectStyleState(mockProject.id)
    expect(driftedState.markdownDrift).toBe(true)
    expect(driftedState.driftedFiles.sort()).toEqual(['MOTION.md', 'frame.md'])

    const diff = await store.getStyleReconciliationDiff(mockProject.id)
    expect(diff.inSync).toBe(false)
    expect(diff.diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'frame.md',
          tokenPath: 'visual.palette.background',
          jsonValue: '#F7F3E9',
          markdownValue: '#101820'
        }),
        expect.objectContaining({
          file: 'frame.md',
          tokenPath: 'typography.displayFont',
          jsonValue: 'Space Grotesk',
          markdownValue: 'IBM Plex Sans'
        }),
        expect.objectContaining({
          file: 'MOTION.md',
          tokenPath: 'motion.pacing',
          jsonValue: 'measured',
          markdownValue: 'snappy'
        })
      ])
    )

    // Mode 1: import-from-markdown adopts agent tokens into JSON and aligns DESIGN.md
    const imported = await store.reconcileProjectStyle({
      projectId: mockProject.id,
      mode: 'import-from-markdown',
      expectedRevision: updated.revision
    })
    expect(imported.profile.visual.palette.background).toBe('#101820')
    expect(imported.profile.typography.displayFont).toBe('IBM Plex Sans')
    expect(imported.profile.motion.pacing).toBe('snappy')
    expect(await readFile(join(projectDir, 'DESIGN.md'), 'utf8')).toContain('#101820')
    expect((await store.getStyleReconciliationDiff(mockProject.id)).inSync).toBe(true)

    // Mode 2: reapply-json overwrites external markdown drift from canonical JSON while preserving prose
    await writeFile(
      join(projectDir, 'frame.md'),
      (await readFile(join(projectDir, 'frame.md'), 'utf8')).replace('#101820', '#FAFAFA'),
      'utf8'
    )
    const reapplied = await store.reconcileProjectStyle({
      projectId: mockProject.id,
      mode: 'reapply-json',
      expectedRevision: imported.revision
    })
    expect(reapplied.profile.visual.palette.background).toBe('#101820')
    expect(await readFile(join(projectDir, 'frame.md'), 'utf8')).toContain('#101820')
    expect(await readFile(join(projectDir, 'frame.md'), 'utf8')).toContain(
      'Preserve diagram breathing room.'
    )
    expect((await store.getStyleReconciliationDiff(mockProject.id)).inSync).toBe(true)

    // Reject CSS/HTML injection imported from externally edited frame.md
    await writeFile(
      join(projectDir, 'frame.md'),
      (await readFile(join(projectDir, 'frame.md'), 'utf8')).replace(
        '#101820',
        '#101820; }</style>'
      ),
      'utf8'
    )
    await expect(
      store.reconcileProjectStyle({
        projectId: mockProject.id,
        mode: 'import-from-markdown',
        expectedRevision: reapplied.revision
      })
    ).rejects.toThrow(/invalid/i)
  })
})
