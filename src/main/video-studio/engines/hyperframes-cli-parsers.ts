import { z } from 'zod'
import {
  isEligibleLocalCertificateHost,
  normalizeExternalBrowserUrl
} from '../../../shared/browser/navigation/browser-url'
import {
  HYPERFRAMES_PINNED_VERSION,
  checkHyperFramesVersionCompatibility,
  parseHyperFramesDoctorJson,
  parseHyperFramesVersionOutput,
  parseNodeMajor,
  tryParseJson,
  type HyperFramesDoctorCheck,
  type ParsedHyperFramesDoctor
} from './hyperframes-doctor-parser'
import {
  parseHyperFramesCheckJson,
  parseHyperFramesCheckResult,
  type ParseHyperFramesCheckOptions
} from './hyperframes-check-parser'
import type { VideoRenderProgressUpdate } from './video-render-engine'

export {
  HYPERFRAMES_PINNED_VERSION,
  checkHyperFramesVersionCompatibility,
  parseHyperFramesCheckJson,
  parseHyperFramesCheckResult,
  parseHyperFramesDoctorJson,
  parseHyperFramesVersionOutput,
  parseNodeMajor,
  tryParseJson,
  type HyperFramesDoctorCheck,
  type ParseHyperFramesCheckOptions,
  type ParsedHyperFramesDoctor
}

export type ParsedHyperFramesPreviewEvent =
  | {
      ok: true
      ready: boolean
      url: string
      serverUrl?: string
      studioUrl?: string
      port: number
      host: '127.0.0.1' | 'localhost'
      pid?: number
      projectName?: string
      projectDir?: string
    }
  | {
      ok: false
      errorCode: string
      message: string
    }

const TopLevelErrorSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional()
  })
  .passthrough()

const PreviewLifecyclePayloadSchema = z
  .object({
    schemaVersion: z.number().optional(),
    operation: z.string().optional(),
    ok: z.boolean(),
    result: z
      .object({
        state: z.string().optional(),
        mode: z.string().optional(),
        projectName: z.string().optional(),
        projectDir: z.string().optional(),
        host: z.string().optional(),
        port: z.number().optional(),
        pid: z.number().optional(),
        serverUrl: z.string().optional(),
        studioUrl: z.string().optional(),
        ready: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    error: TopLevelErrorSchema.optional()
  })
  .passthrough()

const LegacyPreviewUrlPayloadSchema = z
  .object({
    url: z.string().optional(),
    port: z.number().optional()
  })
  .passthrough()

const RenderProgressPayloadSchema = z
  .object({
    code: z.string().optional(),
    stage: z.string().optional(),
    pct: z.number().optional(),
    percent: z.number().optional(),
    progress: z.number().optional(),
    done: z.number().optional(),
    total: z.number().optional()
  })
  .passthrough()

export function validateLoopbackPreviewUrl(rawUrl: string): {
  url: string
  host: '127.0.0.1' | 'localhost'
  port: number
} | null {
  const normalized = normalizeExternalBrowserUrl(rawUrl)
  if (!normalized) {
    return null
  }
  try {
    const parsed = new URL(normalized)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      !isEligibleLocalCertificateHost(parsed.hostname)
    ) {
      return null
    }
    const port = Number(parsed.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return null
    }
    return {
      url: parsed.toString(),
      host: parsed.hostname.toLowerCase() === 'localhost' ? 'localhost' : '127.0.0.1',
      port
    }
  } catch {
    return null
  }
}

export function parseHyperFramesPreviewJson(
  line: string,
  fallbackPort = 3002
): ParsedHyperFramesPreviewEvent | null {
  const lifecycle = tryParseJson(line, PreviewLifecyclePayloadSchema)
  if (lifecycle) {
    if (!lifecycle.ok) {
      return {
        ok: false,
        errorCode: lifecycle.error?.code ?? 'preview_failed',
        message: lifecycle.error?.message ?? 'HyperFrames preview failed'
      }
    }
    const result = lifecycle.result
    const rawTargetUrl = result?.studioUrl ?? result?.serverUrl
    if (!result || !rawTargetUrl) {
      return null
    }
    const validatedTarget = validateLoopbackPreviewUrl(rawTargetUrl)
    if (!validatedTarget || (result.host && !isEligibleLocalCertificateHost(result.host))) {
      return {
        ok: false,
        errorCode: 'invalid_preview_url',
        message: `Rejected non-loopback or invalid preview URL: ${rawTargetUrl}`
      }
    }
    const validatedServer = result.serverUrl ? validateLoopbackPreviewUrl(result.serverUrl) : null
    const validatedStudio = result.studioUrl ? validateLoopbackPreviewUrl(result.studioUrl) : null
    return {
      ok: true,
      ready: result.ready ?? true,
      url: validatedTarget.url,
      ...(validatedServer ? { serverUrl: validatedServer.url } : {}),
      ...(validatedStudio ? { studioUrl: validatedStudio.url } : {}),
      port:
        typeof result.port === 'number' && result.port > 0
          ? result.port
          : validatedTarget.port || fallbackPort,
      host: validatedTarget.host,
      ...(typeof result.pid === 'number' ? { pid: result.pid } : {}),
      ...(result.projectName ? { projectName: result.projectName } : {}),
      ...(result.projectDir ? { projectDir: result.projectDir } : {})
    }
  }

  const legacyJson = tryParseJson(line, LegacyPreviewUrlPayloadSchema)
  if (legacyJson?.url) {
    const validated = validateLoopbackPreviewUrl(legacyJson.url)
    if (!validated) {
      return {
        ok: false,
        errorCode: 'invalid_preview_url',
        message: `Rejected non-loopback preview URL: ${legacyJson.url}`
      }
    }
    return {
      ok: true,
      ready: true,
      url: validated.url,
      port: legacyJson.port ?? validated.port,
      host: validated.host
    }
  }

  const urlMatch = /(https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/\S*)?)/i.exec(line)
  if (urlMatch) {
    const validated = validateLoopbackPreviewUrl(urlMatch[1])
    if (validated) {
      return {
        ok: true,
        ready: true,
        url: validated.url,
        port: validated.port,
        host: validated.host
      }
    }
  }
  return null
}

export function parsePreviewUrl(line: string, fallbackPort: number): string | null {
  const parsed = parseHyperFramesPreviewJson(line, fallbackPort)
  if (parsed?.ok) {
    return parsed.url
  }
  if (parsed && !parsed.ok) {
    return null
  }
  if (/ready|listening|studio/i.test(line)) {
    return validateLoopbackPreviewUrl(`http://127.0.0.1:${fallbackPort}/#project/`)?.url ?? null
  }
  return null
}

export function parseRenderProgressLine(line: string): VideoRenderProgressUpdate | null {
  const trimmed = line.trim()
  const hfPrefix = '@hf-progress'
  const jsonSource = trimmed.startsWith(hfPrefix) ? trimmed.slice(hfPrefix.length).trim() : trimmed
  const json = tryParseJson(jsonSource, RenderProgressPayloadSchema)
  if (json) {
    let rawPct: number | undefined
    if (typeof json.pct === 'number') {
      rawPct = json.pct
    } else if (typeof json.percent === 'number') {
      rawPct = json.percent
    } else if (typeof json.progress === 'number') {
      rawPct = json.progress <= 1 ? json.progress * 100 : json.progress
    } else if (typeof json.done === 'number' && typeof json.total === 'number' && json.total > 0) {
      rawPct = (json.done / json.total) * 100
    }
    const stage =
      typeof json.code === 'string'
        ? json.code
        : typeof json.stage === 'string'
          ? json.stage
          : undefined
    return {
      progressPercent:
        rawPct !== undefined ? Math.max(0, Math.min(100, Math.round(rawPct))) : undefined,
      stageLabel: stage,
      logLine: line
    }
  }
  const pctMatch = /(\d+(?:\.\d+)?)%/.exec(line)
  const stageMatch = /\b(compile|setup|extract_video|capture|encode|audio)\b/i.exec(line)
  return {
    progressPercent: pctMatch
      ? Math.max(0, Math.min(100, Math.round(Number(pctMatch[1]))))
      : undefined,
    stageLabel: stageMatch ? stageMatch[1].toLowerCase() : undefined,
    logLine: line
  }
}
