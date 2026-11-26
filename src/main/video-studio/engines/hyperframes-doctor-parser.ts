import { z } from 'zod'
import type { HyperFramesVersionCompatibility } from './video-render-engine'

export const HYPERFRAMES_PINNED_VERSION = '0.9.94'

export type HyperFramesDoctorCheck = {
  name: string
  ok: boolean
  detail?: string
  hint?: string
}

export type ParsedHyperFramesDoctor = {
  ok: boolean
  platform?: string
  arch?: string
  detectedVersion?: string
  versionCompatibility: HyperFramesVersionCompatibility
  checks: HyperFramesDoctorCheck[]
  nodeOk: boolean | null
  ffmpegOk: boolean | null
  ffprobeOk: boolean | null
  chromeOk: boolean | null
  cliBinaryOk: boolean | null
  missingRequiredTools: string[]
  meta?: {
    version?: string
    latestVersion?: string
    updateAvailable?: boolean
    checkedAt?: string
    skillsOutdated?: number
    skillsMissing?: number
  }
}

export function parseRawJsonValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  try {
    const value: unknown = JSON.parse(trimmed)
    return value
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        const value: unknown = JSON.parse(trimmed.slice(start, end + 1))
        return value
      } catch {
        return null
      }
    }
    return null
  }
}

export function tryParseJson<S extends z.ZodTypeAny>(raw: string, schema: S): z.infer<S> | null {
  const value = parseRawJsonValue(raw)
  if (value === null) {
    return null
  }
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseNodeMajor(versionStdout: string): number | null {
  const match = /v?(\d+)\./.exec(versionStdout.trim())
  return match ? Number(match[1]) : null
}

export function parseHyperFramesVersionOutput(stdout: string): string | null {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }
  const match = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(trimmed)
  return match ? match[1] : null
}

export function checkHyperFramesVersionCompatibility(
  detectedVersion: string | null | undefined
): HyperFramesVersionCompatibility {
  const normalized = detectedVersion?.trim()
  if (!normalized) {
    return 'missing'
  }
  return normalized === HYPERFRAMES_PINNED_VERSION ? 'exact' : 'unverified'
}

const DoctorCheckSchema = z
  .object({
    name: z.string(),
    ok: z.boolean(),
    detail: z.string().optional(),
    hint: z.string().optional()
  })
  .passthrough()

const DoctorPayloadSchema = z
  .object({
    ok: z.boolean().optional(),
    platform: z.string().optional(),
    arch: z.string().optional(),
    version: z.string().optional(),
    checks: z.array(DoctorCheckSchema).optional(),
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
      .optional(),
    ffprobe: z
      .object({
        ok: z.boolean().optional(),
        installed: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    _meta: z
      .object({
        version: z.string().optional(),
        latestVersion: z.string().optional(),
        updateAvailable: z.boolean().optional(),
        checkedAt: z.string().optional(),
        skillsOutdated: z.number().optional(),
        skillsMissing: z.number().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()

export function parseHyperFramesDoctorJson(stdout: string): ParsedHyperFramesDoctor | null {
  const payload = tryParseJson(stdout, DoctorPayloadSchema)
  if (!payload) {
    return null
  }
  const checks = payload.checks ?? []
  let nodeOk: boolean | null = null
  let ffmpegOk: boolean | null = payload.ffmpeg?.ok ?? payload.ffmpeg?.installed ?? null
  let ffprobeOk: boolean | null = payload.ffprobe?.ok ?? payload.ffprobe?.installed ?? null
  let chromeOk: boolean | null = null
  let cliBinaryOk: boolean | null = payload.hyperframes?.installed ?? null
  let versionDetail: string | undefined

  for (const check of checks) {
    const key = check.name.trim().toLowerCase()
    if (key === 'node.js' || key === 'node') {
      nodeOk = check.ok
    } else if (key === 'ffmpeg') {
      ffmpegOk = check.ok
    } else if (key === 'ffprobe') {
      ffprobeOk = check.ok
    } else if (key === 'chrome' || key === 'chromium' || key === 'browser') {
      chromeOk = check.ok
    } else if (key === 'cli binary') {
      cliBinaryOk = check.ok
    } else if (key === 'version') {
      versionDetail = check.detail
    }
  }

  const versionFromDetail = versionDetail
    ? /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(versionDetail.trim())?.[1]
    : undefined
  const detectedVersion =
    payload._meta?.version?.trim() ||
    payload.version?.trim() ||
    payload.hyperframes?.version?.trim() ||
    versionFromDetail ||
    undefined

  const missingRequiredTools: string[] = []
  if (nodeOk === false) {
    missingRequiredTools.push('node22')
  }
  if (ffmpegOk === false) {
    missingRequiredTools.push('ffmpeg')
  }
  if (ffprobeOk === false) {
    missingRequiredTools.push('ffprobe')
  }
  if (chromeOk === false) {
    missingRequiredTools.push('chrome')
  }

  return {
    ok: payload.ok ?? missingRequiredTools.length === 0,
    platform: payload.platform,
    arch: payload.arch,
    detectedVersion,
    versionCompatibility: checkHyperFramesVersionCompatibility(detectedVersion),
    checks,
    nodeOk,
    ffmpegOk,
    ffprobeOk,
    chromeOk,
    cliBinaryOk,
    missingRequiredTools,
    meta: payload._meta
  }
}
