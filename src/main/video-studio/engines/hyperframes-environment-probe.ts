import { join } from 'node:path'
import type { VideoStudioMissingTool } from '../../../shared/video-studio/video-studio-rpc-contract'
import {
  HYPERFRAMES_PINNED_VERSION,
  checkHyperFramesVersionCompatibility,
  parseHyperFramesDoctorJson,
  parseHyperFramesVersionOutput,
  parseNodeMajor
} from './hyperframes-cli-parsers'
import type {
  HyperFramesEnvironmentReport,
  VideoEngineProcessDeps,
  VideoProbeOptions
} from './video-render-engine'

export type HyperFramesInvocation = {
  program: string
  prefixArgs: string[]
  source: 'managed' | 'local-bin' | 'path' | 'npx'
}

export type ResolveHyperFramesOptions = VideoProbeOptions & {
  allowNpxFallback?: boolean
}

function normalizeResolveOptions(
  options?: boolean | ResolveHyperFramesOptions
): ResolveHyperFramesOptions {
  if (typeof options === 'boolean') {
    return { allowNpxFallback: options }
  }
  return options ?? {}
}

function buildManagedCandidatePaths(options: ResolveHyperFramesOptions): string[] {
  const candidates: string[] = []
  if (options.managedPaths) {
    candidates.push(...options.managedPaths)
  }
  const explicitBin = process.env.ORCA_HYPERFRAMES_BIN?.trim()
  if (explicitBin) {
    candidates.push(explicitBin)
  }
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    candidates.push(
      join(resourcesPath, 'video-studio', 'runtime', 'node_modules', '.bin', 'hyperframes')
    )
  }
  return candidates
}

export async function resolveHyperFramesInvocation(
  deps: VideoEngineProcessDeps,
  options?: boolean | ResolveHyperFramesOptions
): Promise<HyperFramesInvocation | null> {
  const normalized = normalizeResolveOptions(options)

  for (const candidate of buildManagedCandidatePaths(normalized)) {
    const resolved = await deps.resolveCommand(candidate)
    if (resolved) {
      return { program: resolved, prefixArgs: [], source: 'managed' }
    }
  }

  if (normalized.projectDir) {
    const localBin = join(normalized.projectDir, 'node_modules', '.bin', 'hyperframes')
    const resolvedLocal = await deps.resolveCommand(localBin)
    if (resolvedLocal) {
      return { program: resolvedLocal, prefixArgs: [], source: 'local-bin' }
    }
  }

  const direct = await deps.resolveCommand('hyperframes')
  if (direct) {
    return { program: direct, prefixArgs: [], source: 'path' }
  }

  if (!normalized.allowNpxFallback) {
    return null
  }

  const npxBin = await deps.resolveCommand('npx')
  if (!npxBin) {
    return null
  }
  const npxCheck = await deps
    .runProcess({
      program: npxBin,
      args: ['--no', 'hyperframes', '--version'],
      timeoutMs: 8000
    })
    .catch(() => null)
  if (npxCheck && npxCheck.code === 0) {
    return { program: npxBin, prefixArgs: ['--no', 'hyperframes'], source: 'npx' }
  }
  return null
}

export async function probeHyperFramesEnvironment(
  deps: VideoEngineProcessDeps,
  options: VideoProbeOptions = {}
): Promise<HyperFramesEnvironmentReport> {
  await deps.hydrateShellPath(true)
  const [nodeBin, ffmpegBin, ffprobeBin, hfInvocation] = await Promise.all([
    deps.resolveCommand('node'),
    deps.resolveCommand('ffmpeg'),
    deps.resolveCommand('ffprobe'),
    resolveHyperFramesInvocation(deps, { ...options, allowNpxFallback: true })
  ])

  const missingTools: VideoStudioMissingTool[] = []
  const missingDetails: string[] = []
  const nodeRes = nodeBin
    ? await deps.runProcess({ program: nodeBin, args: ['-v'], timeoutMs: 5000 }).catch(() => null)
    : null
  const major = nodeRes ? parseNodeMajor(nodeRes.stdout) : null
  const nodeOk = major !== null && major >= 22
  if (!nodeOk) {
    missingTools.push('node22')
    missingDetails.push('node22')
  }
  if (!ffmpegBin) {
    missingTools.push('ffmpeg')
    missingDetails.push('ffmpeg')
  }

  if (!hfInvocation) {
    missingTools.push('hyperframes')
    missingDetails.push('hyperframes')
    if (!ffprobeBin) {
      missingDetails.push('ffprobe')
    }
    return {
      engine: 'hyperframes',
      available: false,
      status: 'missing-tools',
      missingTools,
      missingDetails,
      doctorOk: false,
      pinnedVersion: HYPERFRAMES_PINNED_VERSION,
      versionCompatibility: 'missing',
      resolutionSource: 'missing',
      summary: `HyperFrames CLI ${HYPERFRAMES_PINNED_VERSION} not found on PATH. Install pinned hyperframes@${HYPERFRAMES_PINNED_VERSION} (requires Node 22+, FFmpeg, and FFprobe).`
    }
  }

  const doctorRes = await deps
    .runProcess({
      program: hfInvocation.program,
      args: [...hfInvocation.prefixArgs, 'doctor', '--json'],
      timeoutMs: 15_000
    })
    .catch(() => null)
  const doctor = doctorRes ? parseHyperFramesDoctorJson(doctorRes.stdout) : null

  let detectedVersion = doctor?.detectedVersion
  if (!detectedVersion) {
    const versionRes = await deps
      .runProcess({
        program: hfInvocation.program,
        args: [...hfInvocation.prefixArgs, '--version'],
        timeoutMs: 5000
      })
      .catch(() => null)
    detectedVersion = versionRes
      ? (parseHyperFramesVersionOutput(versionRes.stdout) ?? undefined)
      : undefined
  }

  const versionCompatibility = checkHyperFramesVersionCompatibility(detectedVersion)

  if (doctor?.ffmpegOk === false && !missingTools.includes('ffmpeg')) {
    missingTools.push('ffmpeg')
    if (!missingDetails.includes('ffmpeg')) {
      missingDetails.push('ffmpeg')
    }
  }
  const ffprobeOk =
    doctor?.ffprobeOk === true || (doctor?.ffprobeOk !== false && Boolean(ffprobeBin))
  if (!ffprobeOk) {
    if (!missingDetails.includes('ffprobe')) {
      missingDetails.push('ffprobe')
    }
    if (!missingTools.includes('ffmpeg')) {
      missingTools.push('ffmpeg')
    }
  }
  if (doctor?.chromeOk === false && !missingDetails.includes('chrome')) {
    missingDetails.push('chrome')
  }

  const hasDoctorChecks = Boolean(doctor && doctor.checks.length > 0)
  const doctorOk = hasDoctorChecks
    ? Boolean(
        nodeOk &&
        doctor?.ffmpegOk !== false &&
        doctor?.ffprobeOk !== false &&
        doctor?.chromeOk !== false &&
        doctor?.cliBinaryOk !== false
      )
    : Boolean(doctor?.ok) && doctor?.ffmpegOk !== false && ffprobeOk && nodeOk

  const available = missingTools.length === 0 && missingDetails.length === 0 && doctorOk
  if (!available) {
    const detailList = missingDetails.length > 0 ? missingDetails : missingTools
    const versionNote =
      versionCompatibility === 'unverified' && detectedVersion
        ? ` (CLI ${detectedVersion} is unverified; pinned to ${HYPERFRAMES_PINNED_VERSION})`
        : ''
    return {
      engine: 'hyperframes',
      available: false,
      status: 'missing-tools',
      missingTools,
      missingDetails,
      doctorOk,
      pinnedVersion: HYPERFRAMES_PINNED_VERSION,
      ...(detectedVersion ? { detectedVersion, version: detectedVersion } : {}),
      versionCompatibility,
      executablePath: hfInvocation.program,
      resolutionSource: hfInvocation.source,
      summary: detailList.length
        ? `Missing tools: ${detailList.join(', ')}. Install prerequisites and click Recheck.${versionNote}`
        : `HyperFrames doctor reported incomplete environment setup. Click Recheck after fixing prerequisites.${versionNote}`
    }
  }

  const summary =
    versionCompatibility === 'exact'
      ? `HyperFrames ${HYPERFRAMES_PINNED_VERSION} ready`
      : versionCompatibility === 'unverified'
        ? `HyperFrames ${detectedVersion} detected (unverified; pinned to ${HYPERFRAMES_PINNED_VERSION})`
        : `HyperFrames version unverified (expected ${HYPERFRAMES_PINNED_VERSION})`

  return {
    engine: 'hyperframes',
    available: true,
    status: 'ready',
    missingTools: [],
    missingDetails: [],
    doctorOk: true,
    pinnedVersion: HYPERFRAMES_PINNED_VERSION,
    ...(detectedVersion ? { detectedVersion, version: detectedVersion } : {}),
    versionCompatibility,
    executablePath: hfInvocation.program,
    resolutionSource: hfInvocation.source,
    summary
  }
}
