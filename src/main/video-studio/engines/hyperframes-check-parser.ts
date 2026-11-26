import { z } from 'zod'
import type { VideoStudioEngine } from '../../../shared/video-studio/video-studio-project'
import type { VideoStudioCheckResult } from '../../../shared/video-studio/video-studio-rpc-contract'
import { collectCheckSectionFindings, isPlainRecord } from './hyperframes-check-sections'
import { parseRawJsonValue } from './hyperframes-doctor-parser'
import type {
  ValidationFinding,
  ValidationStatus,
  VideoEngineCheckResult
} from './video-render-engine'

export type ParseHyperFramesCheckOptions = {
  engine?: VideoStudioEngine
  inputFingerprint?: string
  revisions?: {
    compositionSha256: string
    styleSha256?: string
    assetsSha256?: string
  }
  staticLintMode?: boolean
  timedOut?: boolean
  aborted?: boolean
}

const STATIC_SKIPPED_CHECKS = [
  'browser',
  'runtime',
  'layout',
  'motion',
  'contrast',
  'craft',
  'audio'
] as const

const TopLevelErrorSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    hint: z.string().optional()
  })
  .passthrough()

const SnapshotsMetaSchema = z
  .object({
    enabled: z.boolean().optional(),
    files: z.array(z.string()).optional(),
    findingFiles: z.array(z.string()).optional()
  })
  .passthrough()

function buildErrorReport(params: {
  engine: VideoStudioEngine
  engineVersion?: string
  inputFingerprint: string
  revisions?: ParseHyperFramesCheckOptions['revisions']
  findings: ValidationFinding[]
  summary: string
  durationMs: number
}): VideoEngineCheckResult {
  return {
    passed: false,
    status: 'error',
    engine: params.engine,
    ...(params.engineVersion ? { engineVersion: params.engineVersion } : {}),
    inputFingerprint: params.inputFingerprint,
    ...(params.revisions ? { revisions: params.revisions } : {}),
    findings: params.findings,
    errors: params.findings.filter((f) => f.severity === 'error'),
    warnings: params.findings.filter((f) => f.severity === 'warning'),
    skippedChecks: [],
    sectionStatuses: {},
    productionGate: { allowed: false, blockingReasons: [params.summary] },
    summary: params.summary,
    checkedAt: Date.now(),
    durationMs: params.durationMs
  }
}

export function parseHyperFramesCheckJson(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  durationMs: number,
  options: ParseHyperFramesCheckOptions = {}
): VideoEngineCheckResult {
  const engine = options.engine ?? 'hyperframes'
  const inputFingerprint = options.inputFingerprint ?? ''

  if (options.aborted) {
    return buildErrorReport({
      engine,
      inputFingerprint,
      revisions: options.revisions,
      findings: [
        { severity: 'error', code: 'check_aborted', message: 'Composition check cancelled.' }
      ],
      summary: 'Composition check cancelled.',
      durationMs
    })
  }
  if (options.timedOut) {
    return buildErrorReport({
      engine,
      inputFingerprint,
      revisions: options.revisions,
      findings: [
        { severity: 'error', code: 'check_timeout', message: 'Composition check timed out.' }
      ],
      summary: 'Composition check timed out.',
      durationMs
    })
  }

  const rawValue = parseRawJsonValue(stdout)
  if (!isPlainRecord(rawValue)) {
    const textLines = `${stderr}\n${stdout}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const findings: ValidationFinding[] = textLines.slice(0, 20).map((message) => ({
      severity: 'error',
      code: 'unparseable_check_output',
      message
    }))
    const summary =
      findings[0]?.message ??
      (exitCode !== null && exitCode !== 0
        ? `HyperFrames check failed with exit code ${exitCode}`
        : 'HyperFrames check returned unparseable output')
    return buildErrorReport({
      engine,
      inputFingerprint,
      revisions: options.revisions,
      findings:
        findings.length > 0
          ? findings
          : [{ severity: 'error', code: 'unparseable_check_output', message: summary }],
      summary,
      durationMs
    })
  }

  const metaObj = isPlainRecord(rawValue._meta) ? rawValue._meta : null
  const engineVersion = typeof metaObj?.version === 'string' ? metaObj.version.trim() : undefined

  if (rawValue.ok === false && isPlainRecord(rawValue.error)) {
    const parsedErr = TopLevelErrorSchema.safeParse(rawValue.error)
    const errObj = parsedErr.success ? parsedErr.data : {}
    const message = errObj.message ?? 'HyperFrames check invocation failed'
    return buildErrorReport({
      engine,
      engineVersion,
      inputFingerprint,
      revisions: options.revisions,
      findings: [
        {
          severity: 'error',
          ...(errObj.code ? { code: errObj.code } : {}),
          message,
          ...(errObj.hint ? { fixHint: errObj.hint } : {})
        }
      ],
      summary: message,
      durationMs
    })
  }

  const { findings, sectionStatuses } = collectCheckSectionFindings(
    rawValue,
    options.staticLintMode
  )
  const browserSkipped = Boolean(rawValue.browserSkipped) || Boolean(options.staticLintMode)
  const skippedSet = new Set<string>(
    options.staticLintMode ? STATIC_SKIPPED_CHECKS : browserSkipped ? ['browser'] : []
  )
  if (Array.isArray(rawValue.skippedChecks)) {
    for (const item of rawValue.skippedChecks) {
      if (typeof item === 'string' && item.trim()) {
        skippedSet.add(item.trim())
      }
    }
  }
  const skippedChecks = [...skippedSet]

  const errors = findings.filter((f) => f.severity === 'error')
  const warnings = findings.filter((f) => f.severity === 'warning')
  const topErrorCount = typeof rawValue.errorCount === 'number' ? rawValue.errorCount : 0
  const hasErrors =
    errors.length > 0 ||
    topErrorCount > 0 ||
    Object.values(sectionStatuses).some((s) => s.status === 'failed')

  let status: ValidationStatus
  if (hasErrors) {
    status = 'failed'
  } else if (rawValue.ok === false || (exitCode !== null && exitCode !== 0)) {
    status = 'error'
  } else if (skippedChecks.length > 0) {
    status = 'partial'
  } else {
    status = 'passed'
  }

  const blockingReasons: string[] = []
  if (status === 'error') {
    blockingReasons.push('Validator exited with an error without structured failure findings.')
  }
  if (hasErrors) {
    blockingReasons.push(
      `Check reported ${Math.max(errors.length, topErrorCount)} validation error(s).`
    )
  }
  if (skippedChecks.includes('browser')) {
    blockingReasons.push('Required browser layout/contrast audit was skipped')
  } else if (skippedChecks.length > 0) {
    blockingReasons.push(`Skipped required check(s): ${skippedChecks.join(', ')}`)
  }

  const summary =
    status === 'passed'
      ? warnings.length > 0
        ? `Check passed with ${warnings.length} warning(s)`
        : 'Composition check passed'
      : status === 'partial'
        ? `Partial check passed with 0 errors (${skippedChecks.join(', ')} skipped)`
        : status === 'failed'
          ? `Check found ${Math.max(errors.length, topErrorCount)} error(s)`
          : (blockingReasons[0] ?? 'Composition check failed')

  const parsedSnapshots = isPlainRecord(rawValue.snapshots)
    ? SnapshotsMetaSchema.safeParse(rawValue.snapshots)
    : null
  const snapshots =
    parsedSnapshots && parsedSnapshots.success
      ? {
          enabled: Boolean(parsedSnapshots.data.enabled),
          files: parsedSnapshots.data.files ?? [],
          findingFiles: parsedSnapshots.data.findingFiles ?? []
        }
      : undefined

  return {
    passed: status === 'passed',
    status,
    engine,
    ...(engineVersion ? { engineVersion } : {}),
    inputFingerprint,
    ...(options.revisions ? { revisions: options.revisions } : {}),
    findings,
    errors,
    warnings,
    skippedChecks,
    sectionStatuses,
    productionGate: {
      allowed: status === 'passed' && blockingReasons.length === 0,
      blockingReasons
    },
    summary,
    checkedAt: Date.now(),
    durationMs,
    browserSkipped,
    ...(snapshots ? { snapshots } : {})
  }
}

export function parseHyperFramesCheckResult(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  durationMs: number
): VideoStudioCheckResult {
  return parseHyperFramesCheckJson(stdout, stderr, exitCode, durationMs)
}
