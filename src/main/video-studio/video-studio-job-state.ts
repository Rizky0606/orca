import type {
  VideoStudioEngineStatus,
  VideoStudioJobsEvent,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot
} from '../../shared/video-studio/video-studio-rpc-contract'

export const MAX_JOB_LOG_LINES = 100

export const ACTIVE_JOB_STATUSES: ReadonlySet<VideoStudioRenderJobSnapshot['status']> = new Set([
  'queued',
  'checking',
  'rendering'
])

export type ActiveJobEntry = {
  snapshot: VideoStudioRenderJobSnapshot
  abortController?: AbortController
  promise?: Promise<void>
}

export function appendJobLogLine(ring: readonly string[], line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) {
    return [...ring]
  }
  const next = [...ring, trimmed]
  return next.length > MAX_JOB_LOG_LINES ? next.slice(next.length - MAX_JOB_LOG_LINES) : next
}

export function projectVideoStudioJobsEvent(params: {
  jobs: ReadonlyMap<string, ActiveJobEntry>
  previews: ReadonlyMap<string, VideoStudioPreviewState>
  engines?: VideoStudioEngineStatus[]
  revision: number
  projectIdFilter?: string
}): VideoStudioJobsEvent {
  const snapshots: VideoStudioRenderJobSnapshot[] = []
  for (const entry of params.jobs.values()) {
    if (!params.projectIdFilter || entry.snapshot.projectId === params.projectIdFilter) {
      snapshots.push(entry.snapshot)
    }
  }
  const previews: Record<string, VideoStudioPreviewState> = {}
  for (const [projectId, state] of params.previews.entries()) {
    if (!params.projectIdFilter || projectId === params.projectIdFilter) {
      previews[projectId] = state
    }
  }
  return {
    revision: params.revision,
    ...(params.engines ? { engines: params.engines } : {}),
    jobs: snapshots,
    previews
  }
}
