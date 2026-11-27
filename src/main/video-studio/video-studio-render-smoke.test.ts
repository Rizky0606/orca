import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as z from 'zod'
import { afterEach, describe, expect, it } from 'vitest'
import { createHyperFramesEngineAdapter } from './engines/hyperframes-engine-adapter'
import { createHostVideoEngineDeps } from './engines/host-video-engine-deps'
import { computeRegionDiffFraction, readDecodedPng, sampleAverageRgb } from './png-pixel-inspector'
import {
  CONSISTENCY_FIXTURES_ROOT,
  captureHyperFramesSnapshots,
  checkRenderPrerequisites,
  resolveGoldenFramePath,
  runHyperFramesCli
} from './video-studio-snapshot-harness'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) =>
        rm(dir, { recursive: true, force: true, maxRetries: 1, retryDelay: 50 }).catch(() => {})
      )
  )
})

describe('Video Studio Render Smoke, Seek & Causal Consistency Gate', () => {
  // Sequential CLI lint across 6 fixtures takes up to ~30s on Windows hosts.
  it('validates smoke & full compositions with pinned HyperFrames 0.9.94 CLI', async () => {
    const prereqs = await checkRenderPrerequisites()
    expect(prereqs.hasHyperFrames0994).toBe(true)

    for (const fixtureName of [
      'fixture-a-ac-explainer',
      'fixture-b-inflation-explainer',
      'fixture-c-product-showcase'
    ]) {
      const dir = join(CONSISTENCY_FIXTURES_ROOT, fixtureName)
      const smokeLint = await runHyperFramesCli(['lint', '--json', '.'], join(dir, 'smoke'))
      expect(smokeLint.code).toBe(0)
      const fullLint = await runHyperFramesCli(['lint', '--json', '.'], dir)
      expect(fullLint.code).toBe(0)
    }
  }, 60_000)

  // End-to-end Chrome check, 4 headless snapshot batches, and optional MP4 encode require >60s.
  it('proves 1080x1920 Chrome check, non-congruent #fan pixels, seek determinism, golden match, Style & Asset causal changes, and mandatory render gate', async () => {
    const prereqs = await checkRenderPrerequisites()
    const requireRenderSmoke = process.env.ORCA_REQUIRE_RENDER_SMOKE === '1'
    if (requireRenderSmoke && prereqs.missing.length > 0) {
      throw new Error(
        `[PREREQUISITE_MISSING] ORCA_REQUIRE_RENDER_SMOKE=1 requires all tools: missing ${prereqs.missing.join(', ')}`
      )
    }

    expect(prereqs.hasHyperFrames0994).toBe(true)
    expect(prereqs.hasChrome).toBe(true)

    const workDir = await mkdtemp(join(tmpdir(), 'orca-render-smoke-'))
    tempDirs.push(workDir)
    const workA = join(workDir, 'fixture-a')
    await cp(join(CONSISTENCY_FIXTURES_ROOT, 'fixture-a-ac-explainer'), workA, { recursive: true })

    // 1. Live HyperFrames 0.9.94 Chrome check
    const deps = createHostVideoEngineDeps()
    const adapter = createHyperFramesEngineAdapter()
    const check = await adapter.checkProject(workA, deps)
    expect(check.passed).toBe(true)
    expect(check.status).toBe('passed')
    expect(check.browserSkipped).toBe(false)

    // 2. Non-congruent #fan angles (0.5s, 4.2s, 7.9s) + Deterministic Seek + Golden Match
    const snapDirA = join(workDir, 'snap-a')
    const framesA = await captureHyperFramesSnapshots({
      projectDir: workA,
      outputDir: snapDirA,
      atTimes: [0.5, 4.2, 7.9]
    })
    expect(framesA).toHaveLength(3)

    const [png05, png42, png79] = await Promise.all(framesA.map((p) => readDecodedPng(p)))
    expect(png05!.width).toBe(1080)
    expect(png05!.height).toBe(1920)

    const fanRect = { x: 390, y: 1210, width: 300, height: 300 }
    expect(computeRegionDiffFraction(png05!, png42!, fanRect)).toBeGreaterThan(0.05)
    expect(computeRegionDiffFraction(png42!, png79!, fanRect)).toBeGreaterThan(0.05)
    expect(computeRegionDiffFraction(png05!, png79!, fanRect)).toBeGreaterThan(0.05)

    // Isolated seek at t=4.2s matches both sequential run and committed golden frame
    const seekOnlyDir = join(workDir, 'snap-seek-42')
    const [seekPath] = await captureHyperFramesSnapshots({
      projectDir: workA,
      outputDir: seekOnlyDir,
      atTimes: [4.2]
    })
    const seekPng = await readDecodedPng(seekPath!)
    expect(computeRegionDiffFraction(png42!, seekPng, fanRect)).toBeLessThan(0.005)
    expect(
      computeRegionDiffFraction(png42!, seekPng, { x: 0, y: 0, width: 1080, height: 1920 })
    ).toBeLessThan(0.025)

    const goldenPng = await readDecodedPng(resolveGoldenFramePath('fixture-a-at-4.2s.png'))
    expect(computeRegionDiffFraction(seekPng, goldenPng, fanRect)).toBeLessThan(0.005)
    expect(
      computeRegionDiffFraction(seekPng, goldenPng, { x: 0, y: 0, width: 1080, height: 1920 })
    ).toBeLessThan(0.025)

    // 3. Causal Style Profile Proof (mutate ONLY styles/style-profile.json -> teal editorial colors)
    const styleMutated = join(workDir, 'fixture-style-mutated')
    await cp(join(CONSISTENCY_FIXTURES_ROOT, 'fixture-a-ac-explainer'), styleMutated, {
      recursive: true
    })
    const StyleJsonSchema = z
      .object({
        visual: z
          .object({
            palette: z.object({ background: z.string(), accentPrimary: z.string() }).passthrough()
          })
          .passthrough()
      })
      .passthrough()
    const rawStyle = StyleJsonSchema.parse(
      JSON.parse(await readFile(join(styleMutated, 'styles', 'style-profile.json'), 'utf8'))
    )
    rawStyle.visual.palette.background = '#E2F8F3'
    rawStyle.visual.palette.accentPrimary = '#0F766E'
    await writeFile(
      join(styleMutated, 'styles', 'style-profile.json'),
      JSON.stringify(rawStyle, null, 2),
      'utf8'
    )
    const [styleShot] = await captureHyperFramesSnapshots({
      projectDir: styleMutated,
      outputDir: join(workDir, 'snap-style'),
      atTimes: [0.5]
    })
    const stylePng = await readDecodedPng(styleShot!)
    const origHeader = sampleAverageRgb(png05!, { x: 200, y: 12, width: 680, height: 36 })
    const tealHeader = sampleAverageRgb(stylePng, { x: 200, y: 12, width: 680, height: 36 })
    expect(origHeader.b - origHeader.r).toBeGreaterThan(120)
    expect(tealHeader.g - tealHeader.r).toBeGreaterThan(70)
    expect(
      computeRegionDiffFraction(png05!, stylePng, { x: 40, y: 250, width: 200, height: 150 })
    ).toBeGreaterThan(0.9)

    // 4. Causal Asset State Proof (mutate ONLY assets/asset-registry.json defaultState closed -> cutaway)
    const assetMutated = join(workDir, 'fixture-asset-mutated')
    await cp(join(CONSISTENCY_FIXTURES_ROOT, 'fixture-a-ac-explainer'), assetMutated, {
      recursive: true
    })
    const AssetJsonSchema = z
      .object({
        assets: z.array(z.object({ id: z.string(), defaultState: z.string() }).passthrough())
      })
      .passthrough()
    const rawReg = AssetJsonSchema.parse(
      JSON.parse(await readFile(join(assetMutated, 'assets', 'asset-registry.json'), 'utf8'))
    )
    rawReg.assets[0]!.defaultState = 'cutaway'
    await writeFile(
      join(assetMutated, 'assets', 'asset-registry.json'),
      JSON.stringify(rawReg, null, 2),
      'utf8'
    )
    const [assetShot] = await captureHyperFramesSnapshots({
      projectDir: assetMutated,
      outputDir: join(workDir, 'snap-asset'),
      atTimes: [0.5]
    })
    const assetPng = await readDecodedPng(assetShot!)
    const closedBoxDiff = computeRegionDiffFraction(png05!, assetPng, {
      x: 180,
      y: 420,
      width: 720,
      height: 520
    })
    expect(closedBoxDiff).toBeGreaterThan(0.08)

    // 5. MP4 Render & ffprobe gate vs honest [PREREQUISITE_MISSING] reporting
    if (!prereqs.hasFfmpeg || !prereqs.hasFfprobe) {
      process.stderr.write(
        `[PREREQUISITE_MISSING] Skipping MP4 encode/ffprobe verification: missing ${prereqs.missing.join(', ')}. Real Chrome check & PNG snapshot pixel checks passed.\n`
      )
      return
    }

    const smokeOut = join(workDir, 'smoke.mp4')
    const renderRes = await runHyperFramesCli(
      ['render', '--quality=draft', '--output', smokeOut],
      join(workA, 'smoke'),
      180_000
    )
    expect(renderRes.code).toBe(0)
    const ffprobePath = await deps.resolveCommand('ffprobe')
    expect(ffprobePath).toBeTruthy()
    const probe = await deps.runProcess({
      program: ffprobePath!,
      args: ['-v', 'error', '-print_format', 'json', '-show_streams', smokeOut]
    })
    expect(probe.code).toBe(0)
    const ProbeStreamsSchema = z.object({
      streams: z
        .array(
          z
            .object({
              codec_type: z.string().optional(),
              width: z.number().optional(),
              height: z.number().optional(),
              r_frame_rate: z.string().optional()
            })
            .passthrough()
        )
        .optional()
    })
    const streams = ProbeStreamsSchema.parse(JSON.parse(probe.stdout))
    const videoStream = streams.streams?.find((s) => s.codec_type === 'video')
    expect(videoStream).toMatchObject({ width: 1080, height: 1920, r_frame_rate: '30/1' })
  }, 180_000)
})
