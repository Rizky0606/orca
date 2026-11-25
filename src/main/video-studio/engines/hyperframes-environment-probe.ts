import { z } from 'zod'
import type {
  VideoStudioEngineStatus,
  VideoStudioMissingTool
} from '../../../shared/video-studio/video-studio-rpc-contract'
import { parseNodeMajor, tryParseJson } from './hyperframes-cli-parsers'
import type { VideoEngineProcessDeps } from './video-render-engine'

export type HyperFramesInvocation = {
  program: string
  prefixArgs: string[]
}

export async function resolveHyperFramesInvocation(
  deps: VideoEngineProcessDeps,
  allowNpxFallback: boolean
): Promise<HyperFramesInvocation | null> {
  const direct = await deps.resolveCommand('hyperframes')
  if (direct) {
    return { program: direct, prefixArgs: [] }
  }
  if (!allowNpxFallback) {
    return null
  }
  const npx = await deps.resolveCommand('npx')
  return npx ? { program: npx, prefixArgs: ['--no', 'hyperframes'] } : null
}

const DoctorPayloadSchema = z
  .object({
    ok: z.boolean().optional(),
    version: z.string().optional(),
    hyperframes: z
      .object({
        installed: z.boolean().optional(),
        version: z.string().optional()
      })
      .passthrough()
      .optional(),
    ffmpeg: z
      .object({
        ok: z.boolean().optional(),
        installed: z.boolean().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()

export async function probeHyperFramesEnvironment(
  deps: VideoEngineProcessDeps
): Promise<VideoStudioEngineStatus> {
  await deps.hydrateShellPath(true)
  const [nodeBin, ffmpegBin, directHf, npxBin] = await Promise.all([
    deps.resolveCommand('node'),
    deps.resolveCommand('ffmpeg'),
    deps.resolveCommand('hyperframes'),
    deps.resolveCommand('npx')
  ])

  const missingTools: VideoStudioMissingTool[] = []
  const nodeRes = nodeBin
    ? await deps.runProcess({ program: nodeBin, args: ['-v'], timeoutMs: 5000 }).catch(() => null)
    : null
  const major = nodeRes ? parseNodeMajor(nodeRes.stdout) : null
  const nodeOk = major !== null && major >= 22
  if (!nodeOk) {
    missingTools.push('node22')
  }
  if (!ffmpegBin) {
    missingTools.push('ffmpeg')
  }

  let hfInvocation: HyperFramesInvocation | null = directHf
    ? { program: directHf, prefixArgs: [] }
    : null
  if (!hfInvocation && npxBin) {
    const npxCheck = await deps
      .runProcess({
        program: npxBin,
        args: ['--no', 'hyperframes', '--version'],
        timeoutMs: 8000
      })
      .catch(() => null)
    if (npxCheck && npxCheck.code === 0) {
      hfInvocation = { program: npxBin, prefixArgs: ['--no', 'hyperframes'] }
    }
  }

  if (!hfInvocation) {
    missingTools.push('hyperframes')
    return {
      engine: 'hyperframes',
      available: false,
      status: 'missing-tools',
      missingTools,
      doctorOk: false,
      summary:
        'HyperFrames CLI not found on PATH. Install with `npm i -g hyperframes` (requires Node 22+ and FFmpeg).'
    }
  }

  const doctorRes = await deps
    .runProcess({
      program: hfInvocation.program,
      args: [...hfInvocation.prefixArgs, 'doctor', '--json'],
      timeoutMs: 15_000
    })
    .catch(() => null)
  const doctor = doctorRes ? tryParseJson(doctorRes.stdout, DoctorPayloadSchema) : null
  const version = doctor?.version ?? doctor?.hyperframes?.version
  const doctorFfmpegOk = doctor?.ffmpeg?.ok ?? doctor?.ffmpeg?.installed
  if (doctorFfmpegOk === false && !missingTools.includes('ffmpeg')) {
    missingTools.push('ffmpeg')
  }

  const doctorOk =
    Boolean(doctor?.ok) ||
    (Boolean(doctor?.hyperframes?.installed) && doctorFfmpegOk !== false && nodeOk)
  const available = missingTools.length === 0 && doctorOk
  if (!available) {
    return {
      engine: 'hyperframes',
      available: false,
      status: 'missing-tools',
      missingTools,
      doctorOk,
      ...(version ? { version } : {}),
      summary: missingTools.length
        ? `Missing tools: ${missingTools.join(', ')}. Install prerequisites and click Recheck.`
        : 'HyperFrames doctor reported incomplete environment setup. Click Recheck after fixing prerequisites.'
    }
  }

  return {
    engine: 'hyperframes',
    available: true,
    status: 'ready',
    missingTools: [],
    doctorOk: true,
    ...(version ? { version } : {}),
    summary: version ? `HyperFrames ${version} ready` : 'HyperFrames ready'
  }
}
