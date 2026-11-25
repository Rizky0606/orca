import type {
  VideoStudioCheckFinding,
  VideoStudioCheckResult
} from '../../../shared/video-studio/video-studio-rpc-contract'
import type { VideoRenderProgressUpdate } from './video-render-engine'

export function tryParseJson<T>(raw: string): T | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed) as T
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T
      } catch {
        return null
      }
    }
    return null
  }
}

export function parseNodeMajor(versionStdout: string): number | null {
  const match = /v?(\d+)\./.exec(versionStdout.trim())
  return match ? Number(match[1]) : null
}

function toCheckFindings(
  items: readonly unknown[] | undefined,
  defaultSeverity: 'error' | 'warning'
): VideoStudioCheckFinding[] {
  if (!Array.isArray(items)) {
    return []
  }
  const findings: VideoStudioCheckFinding[] = []
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      findings.push({ severity: defaultSeverity, message: item.trim() })
    } else if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      const severity =
        rec.severity === 'error' || rec.severity === 'warning' || rec.severity === 'info'
          ? rec.severity
          : defaultSeverity
      const message =
        typeof rec.message === 'string'
          ? rec.message
          : typeof rec.summary === 'string'
            ? rec.summary
            : JSON.stringify(rec)
      findings.push({
        severity,
        code: typeof rec.code === 'string' ? rec.code : undefined,
        message,
        file: typeof rec.file === 'string' ? rec.file : undefined
      })
    }
  }
  return findings
}

export function parseHyperFramesCheckResult(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  durationMs: number
): VideoStudioCheckResult {
  const parsed = tryParseJson<{
    ok?: boolean
    lint?: { errors?: unknown[]; warnings?: unknown[] }
    runtime?: { errors?: unknown[]; warnings?: unknown[] }
    layout?: { errors?: unknown[]; warnings?: unknown[] }
    motion?: { errors?: unknown[]; warnings?: unknown[] }
    contrast?: { errors?: unknown[]; warnings?: unknown[] }
    errors?: unknown[]
    warnings?: unknown[]
    issues?: unknown[]
  }>(stdout)

  if (parsed) {
    const errors = [
      ...toCheckFindings(parsed.errors, 'error'),
      ...toCheckFindings(parsed.lint?.errors, 'error'),
      ...toCheckFindings(parsed.runtime?.errors, 'error'),
      ...toCheckFindings(parsed.layout?.errors, 'error'),
      ...toCheckFindings(parsed.motion?.errors, 'error'),
      ...toCheckFindings(parsed.contrast?.errors, 'error')
    ]
    const warnings = [
      ...toCheckFindings(parsed.warnings, 'warning'),
      ...toCheckFindings(parsed.lint?.warnings, 'warning'),
      ...toCheckFindings(parsed.runtime?.warnings, 'warning'),
      ...toCheckFindings(parsed.layout?.warnings, 'warning'),
      ...toCheckFindings(parsed.motion?.warnings, 'warning'),
      ...toCheckFindings(parsed.contrast?.warnings, 'warning')
    ]
    if (Array.isArray(parsed.issues)) {
      for (const issue of toCheckFindings(parsed.issues, 'error')) {
        if (issue.severity === 'error') {
          errors.push(issue)
        } else if (issue.severity === 'warning') {
          warnings.push(issue)
        }
      }
    }
    const passed = (parsed.ok ?? exitCode === 0) && errors.length === 0
    return {
      passed,
      errors,
      warnings,
      summary: passed
        ? warnings.length > 0
          ? `Check passed with ${warnings.length} warning(s)`
          : 'Composition check passed'
        : `Check found ${errors.length} error(s)`,
      checkedAt: Date.now(),
      durationMs
    }
  }

  const passed = exitCode === 0
  const textLines = `${stderr}\n${stdout}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const errors = passed
    ? []
    : textLines.slice(0, 20).map((message) => ({ severity: 'error' as const, message }))
  return {
    passed,
    errors,
    warnings: [],
    summary: passed
      ? 'Composition check passed'
      : (errors[0]?.message ?? 'Composition check failed'),
    checkedAt: Date.now(),
    durationMs
  }
}

export function parsePreviewUrl(line: string, fallbackPort: number): string | null {
  const json = tryParseJson<{ url?: string; port?: number }>(line)
  if (json?.url && /^https?:\/\//i.test(json.url)) {
    return json.url
  }
  const urlMatch = /(https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/\S*)?)/i.exec(line)
  if (urlMatch) {
    return urlMatch[1]
  }
  if (/ready|listening|studio/i.test(line)) {
    return `http://127.0.0.1:${fallbackPort}/#project/`
  }
  return null
}

export function parseRenderProgressLine(line: string): VideoRenderProgressUpdate | null {
  const json = tryParseJson<{ progress?: number; percent?: number; stage?: string }>(line)
  if (json) {
    const rawPct =
      typeof json.percent === 'number'
        ? json.percent
        : typeof json.progress === 'number'
          ? json.progress <= 1
            ? json.progress * 100
            : json.progress
          : undefined
    return {
      progressPercent:
        rawPct !== undefined ? Math.max(0, Math.min(100, Math.round(rawPct))) : undefined,
      stageLabel: typeof json.stage === 'string' ? json.stage : undefined,
      logLine: line
    }
  }
  const pctMatch = /(\d+(?:\.\d+)?)%/.exec(line)
  const stageMatch = /\b(compile|setup|capture|encode|audio)\b/i.exec(line)
  return {
    progressPercent: pctMatch
      ? Math.max(0, Math.min(100, Math.round(Number(pctMatch[1]))))
      : undefined,
    stageLabel: stageMatch ? stageMatch[1].toLowerCase() : undefined,
    logLine: line
  }
}
