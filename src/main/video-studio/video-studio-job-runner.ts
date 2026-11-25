import type {
  VideoStudioProject,
  VideoStudioRenderQuality
} from '../../shared/video-studio/video-studio-project'
import type { VideoStudioCheckResult } from '../../shared/video-studio/video-studio-rpc-contract'
import type { VideoStudioCatalog } from './video-studio-catalog'
import type {
  VideoEngineProcessDeps,
  VideoRenderEngineAdapter
} from './engines/video-render-engine'
import { appendJobLogLine, type ActiveJobEntry } from './video-studio-job-state'

export async function runVideoStudioCheckTask(params: {
  projectDir: string
  adapter: VideoRenderEngineAdapter
  engineDeps: VideoEngineProcessDeps
  entry: ActiveJobEntry
  abortController: AbortController
  isCurrent: () => boolean
  onUpdate: () => void
  onFail: (error: unknown) => void
}): Promise<VideoStudioCheckResult> {
  const { projectDir, adapter, engineDeps, entry, abortController, isCurrent, onUpdate, onFail } =
    params
  try {
    const checkResult = await adapter.checkProject(projectDir, engineDeps, abortController.signal)
    if (isCurrent()) {
      entry.snapshot = {
        ...entry.snapshot,
        status: abortController.signal.aborted
          ? 'cancelled'
          : checkResult.passed
            ? 'completed'
            : 'failed',
        completedAt: Date.now(),
        checkResult,
        logLines: appendJobLogLine(entry.snapshot.logLines, checkResult.summary)
      }
      entry.abortController = undefined
      onUpdate()
    }
    return checkResult
  } catch (error) {
    onFail(error)
    throw error
  }
}

export async function runVideoStudioRenderTask(params: {
  project: VideoStudioProject
  projectDir: string
  renderId: string
  fileName: string
  quality: VideoStudioRenderQuality
  adapter: VideoRenderEngineAdapter
  engineDeps: VideoEngineProcessDeps
  catalog: VideoStudioCatalog
  entry: ActiveJobEntry
  abortController: AbortController
  isCurrent: () => boolean
  onUpdate: () => void
  onFail: (error: unknown) => void
}): Promise<void> {
  const {
    project,
    projectDir,
    renderId,
    fileName,
    quality,
    adapter,
    engineDeps,
    catalog,
    entry,
    abortController,
    isCurrent,
    onUpdate,
    onFail
  } = params
  try {
    const record = await adapter.renderProject(
      projectDir,
      { renderId, fileName, quality, project },
      engineDeps,
      (update) => {
        if (!isCurrent()) {
          return
        }
        entry.snapshot = {
          ...entry.snapshot,
          ...(update.progressPercent !== undefined
            ? { progressPercent: update.progressPercent }
            : {}),
          ...(update.stageLabel !== undefined ? { stageLabel: update.stageLabel } : {}),
          logLines: update.logLine
            ? appendJobLogLine(entry.snapshot.logLines, update.logLine)
            : entry.snapshot.logLines
        }
        onUpdate()
      },
      abortController.signal
    )
    await catalog.appendRender(project.id, record).catch(() => {})
    if (isCurrent()) {
      entry.snapshot = {
        ...entry.snapshot,
        status: 'completed',
        progressPercent: 100,
        completedAt: Date.now(),
        record
      }
      entry.abortController = undefined
      onUpdate()
    }
  } catch (error) {
    onFail(error)
  }
}
