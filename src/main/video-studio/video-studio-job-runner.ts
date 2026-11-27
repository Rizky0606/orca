import type {
  VideoStudioProject,
  VideoStudioRenderQuality
} from '../../shared/video-studio/video-studio-project'
import type { VideoEngineCheckResult } from '../../shared/video-studio/video-studio-validation-contract'
import type { VideoStudioCatalog } from './video-studio-catalog'
import { computeProjectInputFingerprint } from './engines/project-input-fingerprint'
import type {
  VideoEngineProcessDeps,
  VideoRenderEngineAdapter
} from './engines/video-render-engine'
import { appendJobLogLine, type ActiveJobEntry } from './video-studio-job-state'
import {
  withExecutionVerifiedSnapshot,
  type VideoStudioTrustStore
} from './video-studio-trust-store'

export async function runVideoStudioCheckTask(params: {
  projectId: string
  projectDir: string
  adapter: VideoRenderEngineAdapter
  engineDeps: VideoEngineProcessDeps
  trustStore: VideoStudioTrustStore
  browser?: boolean
  beforeExecutionSpawn?: () => Promise<void>
  entry: ActiveJobEntry
  abortController: AbortController
  isCurrent: () => boolean
  onUpdate: () => void
  onFail: (error: unknown) => void
}): Promise<VideoEngineCheckResult> {
  const {
    projectId,
    projectDir,
    adapter,
    engineDeps,
    trustStore,
    browser,
    beforeExecutionSpawn,
    entry,
    abortController,
    isCurrent,
    onUpdate,
    onFail
  } = params
  try {
    const invokeCheck = () =>
      adapter.checkProject(
        projectDir,
        engineDeps,
        browser === false
          ? { signal: abortController.signal, browser: false }
          : abortController.signal
      )
    const rawResult =
      browser === false
        ? await invokeCheck()
        : await withExecutionVerifiedSnapshot(
            trustStore,
            {
              projectId,
              projectDir,
              mode: 'check',
              prepare: beforeExecutionSpawn
            },
            invokeCheck
          )
    const inputFingerprint =
      rawResult.inputFingerprint ||
      (await computeProjectInputFingerprint(projectDir).catch(() => ({ inputFingerprint: '' })))
        .inputFingerprint
    const checkResult: VideoEngineCheckResult = {
      ...rawResult,
      inputFingerprint,
      stale: false
    }
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
  startSeconds?: number
  endSeconds?: number
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
    startSeconds,
    endSeconds,
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
      { renderId, fileName, quality, project, startSeconds, endSeconds },
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
