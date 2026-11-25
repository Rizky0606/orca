import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export const GENERAL_CHAT_INVALID_SESSION_ID_CODE = 'general_chat_invalid_session_id'
export const GENERAL_CHAT_INVALID_JOB_ID_CODE = 'general_chat_invalid_job_id'

function assertSafeSegment(segment: string, errorCode: string): void {
  const trimmed = segment.trim()
  if (
    !trimmed ||
    trimmed !== segment ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new Error(errorCode)
  }
}

function assertContainedPath(root: string, candidate: string, errorCode: string): string {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  const rel = relative(resolvedRoot, resolvedCandidate)
  if (!rel || rel === '.' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new Error(errorCode)
  }
  return resolvedCandidate
}

/** Root directory for General Chat sources and research jobs under a profile directory. */
export function resolveGeneralChatRootDir(profileDir: string): string {
  return join(resolve(profileDir), 'general-chat')
}

export function resolveGeneralChatSessionSourcesFile(
  profileDir: string,
  sessionId: string
): string {
  assertSafeSegment(sessionId, GENERAL_CHAT_INVALID_SESSION_ID_CODE)
  const sessionsRoot = join(resolveGeneralChatRootDir(profileDir), 'sessions')
  const sessionDir = assertContainedPath(
    sessionsRoot,
    join(sessionsRoot, sessionId),
    GENERAL_CHAT_INVALID_SESSION_ID_CODE
  )
  return join(sessionDir, 'sources.json')
}

export function resolveGeneralChatResearchJobsFile(profileDir: string): string {
  return join(resolveGeneralChatRootDir(profileDir), 'research', 'jobs.json')
}

export function resolveGeneralChatResearchJobDir(profileDir: string, jobId: string): string {
  assertSafeSegment(jobId, GENERAL_CHAT_INVALID_JOB_ID_CODE)
  const jobsRoot = join(resolveGeneralChatRootDir(profileDir), 'research')
  return assertContainedPath(jobsRoot, join(jobsRoot, jobId), GENERAL_CHAT_INVALID_JOB_ID_CODE)
}

export function resolveGeneralChatResearchJobReportFile(profileDir: string, jobId: string): string {
  return join(resolveGeneralChatResearchJobDir(profileDir, jobId), 'report.md')
}

export function resolveGeneralChatResearchJobSourcesFile(
  profileDir: string,
  jobId: string
): string {
  return join(resolveGeneralChatResearchJobDir(profileDir, jobId), 'sources.json')
}
