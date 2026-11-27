import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StoryboardDocumentSchema } from '../../shared/video-studio/video-studio-storyboard-contract'
import { StyleProfileSchema } from '../../shared/video-studio/video-studio-style-contract'
import {
  AssetRegistryDocumentSchema,
  assertAssetInvariantsAndFiles
} from './assets/video-studio-asset-invariants'
import { computeCompositionDrift } from './documents/video-studio-composition-drift'
import { parseStoryboardMarkdown } from './documents/video-studio-markdown-sync'
import { VideoStudioStyleStore } from './style/video-studio-style-store'
import { CONSISTENCY_FIXTURES_ROOT } from './video-studio-snapshot-harness'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }))
  )
})

function mod360Distance(a: number, b: number): number {
  const raw = Math.abs((((a % 360) + 360) % 360) - (((b % 360) + 360) % 360))
  return Math.min(raw, 360 - raw)
}

describe('Video Studio Consistency Fixtures A/B/C', () => {
  it('validates StyleProfile, MasterAsset invariants, STORYBOARD.md, drift, and pinned 0.9.94 smoke manifests', async () => {
    const specs = [
      {
        dir: 'fixture-a-ac-explainer',
        styleId: 'technical-explainer-01',
        assetId: 'ac_indoor_001'
      },
      {
        dir: 'fixture-b-inflation-explainer',
        styleId: 'technical-explainer-01',
        assetId: 'inflation_chart'
      },
      { dir: 'fixture-c-product-showcase', styleId: 'clean-editorial-01', assetId: 'showcase_card' }
    ]

    for (const spec of specs) {
      const fixtureDir = join(CONSISTENCY_FIXTURES_ROOT, spec.dir)
      const style = StyleProfileSchema.parse(
        JSON.parse(await readFile(join(fixtureDir, 'styles', 'style-profile.json'), 'utf8'))
      )
      expect(style.id).toBe(spec.styleId)

      const registry = AssetRegistryDocumentSchema.parse(
        JSON.parse(await readFile(join(fixtureDir, 'assets', 'asset-registry.json'), 'utf8'))
      )
      expect(registry.assets.map((a) => a.id)).toContain(spec.assetId)
      for (const asset of registry.assets) {
        const verified = await assertAssetInvariantsAndFiles(fixtureDir, asset)
        expect(verified.asset.id).toBe(asset.id)
        expect(verified.fileBytesByPath.size).toBeGreaterThanOrEqual(1)
      }

      const storyboardRaw = await readFile(join(fixtureDir, 'STORYBOARD.md'), 'utf8')
      const parsedBoard = StoryboardDocumentSchema.parse(parseStoryboardMarkdown(storyboardRaw))
      expect(parsedBoard.frames.length).toBeGreaterThanOrEqual(2)

      const drift = await computeCompositionDrift(fixtureDir)
      expect(drift.inSync).toBe(true)
      expect(drift.unmountedScenes).toEqual([])
      expect(drift.missingFiles).toEqual([])

      const smokePkg = JSON.parse(
        await readFile(join(fixtureDir, 'smoke', 'package.json'), 'utf8')
      ) as {
        dependencies?: Record<string, string>
      }
      expect(smokePkg.dependencies?.hyperframes).toBe('0.9.94')
      const smokeHtml = await readFile(join(fixtureDir, 'smoke', 'index.html'), 'utf8')
      expect(smokeHtml).toContain('data-width="1080"')
      expect(smokeHtml).toContain('data-height="1920"')
      expect(smokeHtml).toContain('data-fps="30"')
      expect(smokeHtml).toContain('data-duration="2"')
    }
  })

  it('enforces non-congruent 217deg/sec #fan angular separation at 0.5s, 4.2s, and 7.9s', async () => {
    const html = await readFile(
      join(CONSISTENCY_FIXTURES_ROOT, 'fixture-a-ac-explainer', 'index.html'),
      'utf8'
    )
    expect(html).toContain('9 * 217')

    const angles = [0.5, 4.2, 7.9].map((t) => (t * 217) % 360)
    expect(angles[0]).toBeCloseTo(108.5, 5)
    expect(angles[1]).toBeCloseTo(191.4, 5)
    expect(angles[2]).toBeCloseTo(274.3, 5)
    expect(mod360Distance(angles[0]!, angles[1]!)).toBeGreaterThan(80)
    expect(mod360Distance(angles[1]!, angles[2]!)).toBeGreaterThan(80)
    expect(mod360Distance(angles[0]!, angles[2]!)).toBeGreaterThan(160)
  })

  it('keeps copied project portable outside profileDir with valid assets and isolated style snapshots', async () => {
    const externalDir = await mkdtemp(join(tmpdir(), 'orca-portable-fixture-'))
    const profileDir = await mkdtemp(join(tmpdir(), 'orca-profile-isolation-'))
    tempDirs.push(externalDir, profileDir)

    const relocatedFixture = join(externalDir, 'relocated-ac')
    await cp(join(CONSISTENCY_FIXTURES_ROOT, 'fixture-a-ac-explainer'), relocatedFixture, {
      recursive: true
    })

    const registry = AssetRegistryDocumentSchema.parse(
      JSON.parse(await readFile(join(relocatedFixture, 'assets', 'asset-registry.json'), 'utf8'))
    )
    for (const asset of registry.assets) {
      const verified = await assertAssetInvariantsAndFiles(relocatedFixture, asset)
      expect(verified.asset.id).toBe(asset.id)
      expect(verified.fileBytesByPath.size).toBeGreaterThanOrEqual(1)
    }

    const styleStore = new VideoStudioStyleStore(profileDir)
    await styleStore.applyStyleProfileToProject({
      projectId: 'proj-isolated',
      styleId: 'technical-explainer-01'
    })
    await styleStore.updateProjectStyleTokens({
      projectId: 'proj-isolated',
      tokens: { visual: { palette: { accentPrimary: '#0F766E' } } }
    })

    const untouchedFixtureStyle = JSON.parse(
      await readFile(
        join(CONSISTENCY_FIXTURES_ROOT, 'fixture-a-ac-explainer', 'styles', 'style-profile.json'),
        'utf8'
      )
    ) as { visual: { palette: { accentPrimary: string } } }
    expect(untouchedFixtureStyle.visual.palette.accentPrimary).toBe('#2563EB')

    const listed = await styleStore.listStyleProfiles()
    const builtin = listed.profiles.find((p) => p.id === 'technical-explainer-01')
    expect(builtin?.visual.palette.accentPrimary).toBe('#2563EB')
  })
})
