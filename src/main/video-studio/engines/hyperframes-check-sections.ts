import { z } from 'zod'
import type { ValidationFinding, ValidationSectionStatus } from './video-render-engine'

const NON_SECTION_KEYS = new Set([
  'ok',
  'strict',
  'browserSkipped',
  'skippedChecks',
  '_meta',
  'saved',
  'snapshots',
  'error',
  'fixtureSource',
  'filesScanned',
  'unmountedCompositions',
  'errorCount',
  'warningCount',
  'infoCount',
  'scope',
  'components',
  'errors',
  'warnings',
  'issues',
  'findings'
])

const CheckIssueRecordSchema = z
  .object({
    severity: z.enum(['error', 'warning', 'info']).optional(),
    code: z.string().optional(),
    message: z.string().optional(),
    summary: z.string().optional(),
    file: z.string().optional(),
    sourceFile: z.string().optional(),
    time: z.number().optional(),
    selector: z.string().optional(),
    fixHint: z.string().optional(),
    suggestedColor: z.string().optional()
  })
  .passthrough()

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toValidationFindings(
  items: readonly unknown[] | undefined,
  defaultSeverity: 'error' | 'warning' | 'info',
  section?: string
): ValidationFinding[] {
  if (!Array.isArray(items)) {
    return []
  }
  const findings: ValidationFinding[] = []
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      findings.push({
        severity: defaultSeverity,
        message: item.trim(),
        ...(section ? { section } : {})
      })
      continue
    }
    if (typeof item === 'object' && item !== null) {
      const parsed = CheckIssueRecordSchema.safeParse(item)
      if (!parsed.success) {
        findings.push({
          severity: defaultSeverity,
          message: JSON.stringify(item),
          ...(section ? { section } : {})
        })
        continue
      }
      const rec = parsed.data
      const file = rec.file ?? rec.sourceFile
      findings.push({
        severity: rec.severity ?? defaultSeverity,
        ...(rec.code ? { code: rec.code } : {}),
        message: rec.message ?? rec.summary ?? JSON.stringify(rec),
        ...(file ? { file } : {}),
        ...(section ? { section } : {}),
        ...(typeof rec.time === 'number' ? { time: rec.time } : {}),
        ...(rec.selector ? { selector: rec.selector } : {}),
        ...(rec.sourceFile ? { sourceFile: rec.sourceFile } : {}),
        ...(rec.fixHint ? { fixHint: rec.fixHint } : {}),
        ...(rec.suggestedColor ? { suggestedColor: rec.suggestedColor } : {})
      })
    }
  }
  return findings
}

export function collectCheckSectionFindings(
  rawValue: Record<string, unknown>,
  staticLintMode: boolean | undefined
): { findings: ValidationFinding[]; sectionStatuses: Record<string, ValidationSectionStatus> } {
  const findings: ValidationFinding[] = []
  const sectionStatuses: Record<string, ValidationSectionStatus> = {}

  if (
    Array.isArray(rawValue.findings) ||
    Array.isArray(rawValue.errors) ||
    Array.isArray(rawValue.warnings) ||
    Array.isArray(rawValue.issues)
  ) {
    const section = staticLintMode ? 'lint' : undefined
    const rootFindings = [
      ...toValidationFindings(
        Array.isArray(rawValue.findings) ? rawValue.findings : undefined,
        'error',
        section
      ),
      ...toValidationFindings(
        Array.isArray(rawValue.errors) ? rawValue.errors : undefined,
        'error',
        section
      ),
      ...toValidationFindings(
        Array.isArray(rawValue.warnings) ? rawValue.warnings : undefined,
        'warning',
        section
      ),
      ...toValidationFindings(
        Array.isArray(rawValue.issues) ? rawValue.issues : undefined,
        'error',
        section
      )
    ]
    findings.push(...rootFindings)
    if (staticLintMode) {
      const lintErrors = rootFindings.filter((f) => f.severity === 'error').length
      const lintWarnings = rootFindings.filter((f) => f.severity === 'warning').length
      const lintInfo = rootFindings.filter((f) => f.severity === 'info').length
      const declaredErrorCount = typeof rawValue.errorCount === 'number' ? rawValue.errorCount : 0
      sectionStatuses.lint = {
        status:
          Math.max(lintErrors, declaredErrorCount) > 0 || rawValue.ok === false
            ? 'failed'
            : 'passed',
        errorCount: Math.max(lintErrors, declaredErrorCount),
        warningCount: Math.max(
          lintWarnings,
          typeof rawValue.warningCount === 'number' ? rawValue.warningCount : 0
        ),
        infoCount: Math.max(
          lintInfo,
          typeof rawValue.infoCount === 'number' ? rawValue.infoCount : 0
        )
      }
    }
  }

  for (const [key, sectionVal] of Object.entries(rawValue)) {
    if (NON_SECTION_KEYS.has(key) || !isPlainRecord(sectionVal)) {
      continue
    }
    const findingsList = Array.isArray(sectionVal.findings) ? sectionVal.findings : null
    const errorsList = Array.isArray(sectionVal.errors) ? sectionVal.errors : null
    const warningsList = Array.isArray(sectionVal.warnings) ? sectionVal.warnings : null
    if (!findingsList && !errorsList && !warningsList) {
      continue
    }
    const sectionFindings = [
      ...(findingsList ? toValidationFindings(findingsList, 'error', key) : []),
      ...(errorsList ? toValidationFindings(errorsList, 'error', key) : []),
      ...(warningsList ? toValidationFindings(warningsList, 'warning', key) : [])
    ]
    findings.push(...sectionFindings)

    const errorCount = Math.max(
      typeof sectionVal.errorCount === 'number' ? sectionVal.errorCount : 0,
      sectionFindings.filter((f) => f.severity === 'error').length
    )
    const warningCount = Math.max(
      typeof sectionVal.warningCount === 'number' ? sectionVal.warningCount : 0,
      sectionFindings.filter((f) => f.severity === 'warning').length
    )
    const infoCount = Math.max(
      typeof sectionVal.infoCount === 'number' ? sectionVal.infoCount : 0,
      sectionFindings.filter((f) => f.severity === 'info').length
    )
    sectionStatuses[key] = {
      status: errorCount > 0 || sectionVal.ok === false ? 'failed' : 'passed',
      errorCount,
      warningCount,
      infoCount
    }
  }

  return { findings, sectionStatuses }
}
