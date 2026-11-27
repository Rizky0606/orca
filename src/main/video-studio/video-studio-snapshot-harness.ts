import { join, resolve } from 'node:path'
import * as z from 'zod'
import { createHostVideoEngineDeps } from './engines/host-video-engine-deps'

const SnapshotOutputSchema = z.object({
  frames: z.array(z.object({ path: z.string(), time: z.number() })).optional()
})

const DoctorChecksSchema = z.object({
  checks: z.array(z.object({ name: z.string(), ok: z.boolean() })).optional()
})

export const CONSISTENCY_FIXTURES_ROOT = resolve(import.meta.dirname, '__fixtures__', 'consistency')

export async function runHyperFramesCli(
  args: readonly string[],
  cwd: string,
  timeoutMs = 120_000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const deps = createHostVideoEngineDeps()
  await deps.hydrateShellPath()
  const binary = await deps.resolveCommand('hyperframes')
  if (!binary) {
    throw new Error('hyperframes CLI not resolved on PATH')
  }
  const result = await deps.runProcess({
    program: binary,
    args,
    cwd,
    timeoutMs
  })
  return { code: result.code, stdout: result.stdout, stderr: result.stderr }
}

export async function captureHyperFramesSnapshots(params: {
  projectDir: string
  outputDir: string
  atTimes: readonly number[]
}): Promise<string[]> {
  const atArg = `--at=${params.atTimes.join(',')}`
  const res = await runHyperFramesCli(
    [
      'snapshot',
      '.',
      atArg,
      '--no-end',
      '--no-browser-gpu',
      '--output',
      params.outputDir,
      '--json'
    ],
    params.projectDir
  )
  if (res.code !== 0) {
    throw new Error(`hyperframes snapshot failed (${res.code}): ${res.stderr || res.stdout}`)
  }
  const match = /^\{\r?\n[\s\S]*\r?\n\}/m.exec(res.stdout)
  const parsed = SnapshotOutputSchema.parse(JSON.parse(match ? match[0] : res.stdout))
  return (parsed.frames ?? []).map((frame) => frame.path)
}

export async function checkRenderPrerequisites(): Promise<{
  hasHyperFrames0994: boolean
  hasChrome: boolean
  hasFfmpeg: boolean
  hasFfprobe: boolean
  missing: string[]
}> {
  const deps = createHostVideoEngineDeps()
  await deps.hydrateShellPath()
  const hf = await deps.resolveCommand('hyperframes')
  let versionOk = false
  let chromeOk = false
  let ffmpegOk = Boolean(await deps.resolveCommand('ffmpeg'))
  let ffprobeOk = Boolean(await deps.resolveCommand('ffprobe'))

  if (hf) {
    const ver = await deps.runProcess({ program: hf, args: ['--version'], timeoutMs: 15_000 })
    versionOk = ver.code === 0 && ver.stdout.trim() === '0.9.94'
    const doc = await deps.runProcess({
      program: hf,
      args: ['doctor', '--json'],
      timeoutMs: 30_000
    })
    if (doc.code === 0 || doc.stdout.includes('{')) {
      try {
        const report = DoctorChecksSchema.parse(JSON.parse(doc.stdout))
        for (const chk of report.checks ?? []) {
          if (chk.name === 'Chrome' && chk.ok) {
            chromeOk = true
          }
          if (chk.name === 'FFmpeg' && chk.ok) {
            ffmpegOk = true
          }
          if (chk.name === 'FFprobe' && chk.ok) {
            ffprobeOk = true
          }
        }
      } catch {
        // Leave false when unparseable
      }
    }
  }

  const missing: string[] = []
  if (!versionOk) {
    missing.push('hyperframes@0.9.94')
  }
  if (!chromeOk) {
    missing.push('chrome')
  }
  if (!ffmpegOk) {
    missing.push('ffmpeg')
  }
  if (!ffprobeOk) {
    missing.push('ffprobe')
  }
  return {
    hasHyperFrames0994: versionOk,
    hasChrome: chromeOk,
    hasFfmpeg: ffmpegOk,
    hasFfprobe: ffprobeOk,
    missing
  }
}

export function resolveGoldenFramePath(name: string): string {
  return join(CONSISTENCY_FIXTURES_ROOT, 'golden-frames', name)
}
