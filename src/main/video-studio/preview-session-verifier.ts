import { basename, resolve } from 'node:path'
import { z } from 'zod'
import {
  resolveRealpathDefault,
  tokenizeCommandLine,
  type ObservedPreviewProcess,
  type PreviewOsControl
} from './preview-os-control'

const CREATION_TIME_TOLERANCE_MS = 500
const ALLOWED_PREVIEW_EXECUTABLE_PATTERN =
  /^(?:node(?:js)?(?:\d+)?(?:\.exe)?|hyperframes(?:\.(?:exe|cmd|bat|mjs|js))?)$/i

export const PreviewSessionRecordSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  projectDirRealpath: z.string().min(1),
  pid: z.number().int().positive(),
  creationTimeMs: z.number().positive(),
  executablePath: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  host: z.enum(['127.0.0.1', 'localhost']),
  url: z.string().min(1),
  projectName: z.string().min(1),
  startedAt: z.number().nonnegative()
})
export type PreviewSessionRecord = z.infer<typeof PreviewSessionRecordSchema>

export type PreviewVerificationFailureReason =
  | 'session-id-mismatch'
  | 'pid-dead'
  | 'creation-time-mismatch'
  | 'executable-mismatch'
  | 'project-dir-mismatch'
  | 'port-owner-mismatch'
  | 'http-identity-mismatch'
  | 'http-unhealthy'
  | 'port-not-listening'

export type PreviewSessionVerificationResult =
  | { status: 'none' }
  | { status: 'healthy'; record: PreviewSessionRecord; observed: ObservedPreviewProcess }
  | {
      status: 'unhealthy'
      reason: 'http-unhealthy' | 'port-not-listening'
      record: PreviewSessionRecord
      belongsToProject: true
      portOwnedByOtherPid: false
    }
  | {
      status: 'stale'
      reason: PreviewVerificationFailureReason
      record: PreviewSessionRecord
      belongsToProject: false
    }

function canonicalizePath(targetPath: string): string {
  const resolved = resolve(targetPath)
  const trimmed =
    resolved.length > 3 && (resolved.endsWith('/') || resolved.endsWith('\\'))
      ? resolved.slice(0, -1)
      : resolved
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
}

function normalizeExecutablePath(exePath: string): string {
  const trimmed = exePath.trim()
  if (!trimmed) {
    return ''
  }
  return process.platform === 'win32' ? resolve(trimmed).toLowerCase() : resolve(trimmed)
}

function isAllowedPreviewExecutablePath(exePath: string | null): boolean {
  if (!exePath) {
    return false
  }
  return ALLOWED_PREVIEW_EXECUTABLE_PATTERN.test(basename(exePath.trim()))
}

async function processMatchesProjectDir(
  observed: ObservedPreviewProcess,
  expectedDirCanonical: string,
  resolvePath: (targetPath: string) => Promise<string>
): Promise<boolean> {
  if (observed.cwd && canonicalizePath(await resolvePath(observed.cwd)) === expectedDirCanonical) {
    return true
  }
  for (const token of tokenizeCommandLine(observed.commandLine)) {
    if (!token || token.startsWith('-') || (!token.includes('/') && !token.includes('\\'))) {
      continue
    }
    if (canonicalizePath(await resolvePath(token)) === expectedDirCanonical) {
      return true
    }
  }
  return false
}

export async function verifyStoredPreviewSession(params: {
  record: PreviewSessionRecord | undefined
  projectDir: string
  expectedSessionId?: string
  osControl: PreviewOsControl
}): Promise<PreviewSessionVerificationResult> {
  const { record, projectDir, expectedSessionId, osControl } = params
  if (!record) {
    return { status: 'none' }
  }
  const resolvePath = osControl.resolveRealpath ?? resolveRealpathDefault

  if (!record.sessionId || (expectedSessionId && expectedSessionId !== record.sessionId)) {
    return { status: 'stale', reason: 'session-id-mismatch', record, belongsToProject: false }
  }

  const observed = await osControl.inspectProcess(record.pid)
  if (!observed) {
    return { status: 'stale', reason: 'pid-dead', record, belongsToProject: false }
  }

  if (
    observed.creationTimeMs === null ||
    Math.abs(observed.creationTimeMs - record.creationTimeMs) > CREATION_TIME_TOLERANCE_MS
  ) {
    return { status: 'stale', reason: 'creation-time-mismatch', record, belongsToProject: false }
  }

  const resolvedObservedExe = observed.executablePath
    ? normalizeExecutablePath(await resolvePath(observed.executablePath))
    : ''
  const resolvedExpectedExe = normalizeExecutablePath(await resolvePath(record.executablePath))
  if (
    !resolvedObservedExe ||
    !isAllowedPreviewExecutablePath(resolvedObservedExe) ||
    resolvedObservedExe !== resolvedExpectedExe
  ) {
    return { status: 'stale', reason: 'executable-mismatch', record, belongsToProject: false }
  }

  const expectedDirCanonical = canonicalizePath(await resolvePath(projectDir))
  const storedDirCanonical = canonicalizePath(await resolvePath(record.projectDirRealpath))
  if (
    storedDirCanonical !== expectedDirCanonical ||
    !(await processMatchesProjectDir(observed, expectedDirCanonical, resolvePath))
  ) {
    return { status: 'stale', reason: 'project-dir-mismatch', record, belongsToProject: false }
  }

  const [portOwner, httpIdentity] = await Promise.all([
    osControl.findLoopbackPortOwner(record.port),
    osControl.probeHttpIdentity(record.host, record.port)
  ])

  if (portOwner && portOwner.pid !== record.pid) {
    return { status: 'stale', reason: 'port-owner-mismatch', record, belongsToProject: false }
  }
  if (!portOwner) {
    return {
      status: 'unhealthy',
      reason: 'port-not-listening',
      record,
      belongsToProject: true,
      portOwnedByOtherPid: false
    }
  }
  if (!httpIdentity) {
    return {
      status: 'unhealthy',
      reason: 'http-unhealthy',
      record,
      belongsToProject: true,
      portOwnedByOtherPid: false
    }
  }

  const httpProjectDirCanonical = httpIdentity.projectDir
    ? canonicalizePath(await resolvePath(httpIdentity.projectDir))
    : null
  const httpPidMatches = httpIdentity.pid === undefined || httpIdentity.pid === record.pid
  const httpDirMatches =
    httpProjectDirCanonical !== null
      ? httpProjectDirCanonical === expectedDirCanonical
      : httpIdentity.projectName === record.projectName
  const httpSessionMatches =
    httpIdentity.sessionId === undefined || httpIdentity.sessionId === record.sessionId

  if (!httpIdentity.isHyperframes || !httpPidMatches || !httpDirMatches || !httpSessionMatches) {
    return { status: 'stale', reason: 'http-identity-mismatch', record, belongsToProject: false }
  }

  return { status: 'healthy', record, observed }
}
