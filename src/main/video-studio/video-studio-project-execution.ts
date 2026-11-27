import { mkdir, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { VideoStudioProject } from '../../shared/video-studio/video-studio-project'
import type { VideoStudioCompositionState } from '../../shared/video-studio/video-studio-rpc-contract'
import type { VideoStudioPreviewState } from '../../shared/video-studio/video-studio-rpc-contract'
import type { VideoEngineCheckResult } from '../../shared/video-studio/video-studio-validation-contract'
import { computeCompositionDrift } from './documents/video-studio-composition-drift'
import { computeProjectInputFingerprint } from './engines/project-input-fingerprint'
import type { VideoEngineAdapter } from './engines/video-render-engine'
import { getBuiltinStylePreset } from './style/builtin-style-presets'
import type { VideoStudioStyleStore } from './style/video-studio-style-store'
import { inspectVideoStudioCompositionState } from './video-studio-composition-paths'
import type { VideoStudioFileWatcher } from './video-studio-file-watcher'
import type { ActiveJobEntry } from './video-studio-job-state'
import { canonicalRealpath, isWithinCanonicalRoot } from './video-studio-path-containment'
import type { VideoStudioTrustStore } from './video-studio-trust-store'

const SKIP_SCAN_DIRS = new Set(['.git', 'node_modules', '.orca', '.hyperframes', 'renders'])
const EXECUTABLE_EXTS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.svg'])
const EXECUTABLE_CONFIGS = new Set([
  'hyperframes.json',
  'package.json',
  'styles/style-profile.json',
  'assets/asset-registry.json'
])

async function scanForExistingExecutableInputs(
  rootReal: string,
  currentDir: string,
  relPrefix = ''
): Promise<boolean> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(currentDir, entry.name)
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) {
      const targetReal = await canonicalRealpath(full).catch(() => null)
      if (!targetReal || !isWithinCanonicalRoot(rootReal, targetReal, false)) {
        return true
      }
      continue
    }
    if (entry.isDirectory()) {
      if (SKIP_SCAN_DIRS.has(entry.name)) {
        continue
      }
      if (await scanForExistingExecutableInputs(rootReal, full, rel)) {
        return true
      }
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (EXECUTABLE_EXTS.has(extname(entry.name).toLowerCase()) || EXECUTABLE_CONFIGS.has(rel)) {
      return true
    }
  }
  return false
}

export async function hasPreExistingExecutableInputs(projectDir: string): Promise<boolean> {
  const rootReal = await canonicalRealpath(projectDir).catch(() => null)
  if (!rootReal) {
    return false
  }
  return scanForExistingExecutableInputs(rootReal, rootReal)
}

export async function scaffoldProjectWithBaselineTrust(params: {
  projectDir: string
  project: VideoStudioProject
  adapter: VideoEngineAdapter
  styleStore: VideoStudioStyleStore
  trustStore: VideoStudioTrustStore
  watcher: VideoStudioFileWatcher
  previewState: VideoStudioPreviewState
  options?: { overwrite?: boolean; styleProfileId?: string }
}): Promise<VideoStudioCompositionState> {
  const { projectDir, project, adapter, styleStore, trustStore, watcher, previewState, options } =
    params
  const requestedStyleId = options?.styleProfileId
  let isCustomLibraryStyle = false
  if (requestedStyleId) {
    if (!getBuiltinStylePreset(requestedStyleId)) {
      const listed = await styleStore.listStyleProfiles()
      if (!listed.profiles.some((p) => p.id === requestedStyleId)) {
        throw new Error('video_studio_style_not_found')
      }
      isCustomLibraryStyle = true
    }
  }

  const hadPreExistingInputs = await hasPreExistingExecutableInputs(projectDir)
  const effectiveProject = requestedStyleId
    ? { ...project, styleProfileId: requestedStyleId }
    : project

  const state = await watcher.suppressDuring(project.id, projectDir, async () => {
    const scaffolded = await adapter.scaffoldProject(projectDir, effectiveProject, {
      overwrite: options?.overwrite
    })
    await mkdir(projectDir, { recursive: true })
    if (requestedStyleId && (isCustomLibraryStyle || options?.overwrite)) {
      await styleStore
        .applyStyleProfileToProject({
          projectId: project.id,
          styleId: requestedStyleId
        })
        .catch((error) => {
          if (isCustomLibraryStyle) {
            throw error
          }
        })
    }
    return scaffolded
  })

  if (!hadPreExistingInputs) {
    const live = await computeProjectInputFingerprint(projectDir)
    await trustStore.approveProjectExecution({
      projectId: project.id,
      projectDir,
      trustState: 'approved-render',
      inputFingerprint: live.inputFingerprint
    })
  }

  return {
    ...state,
    previewActive: previewState.active,
    ...(previewState.url ? { previewUrl: previewState.url } : {})
  }
}

export async function buildDetailedCompositionState(params: {
  projectDir: string
  previewState: VideoStudioPreviewState
  lastCheck: VideoEngineCheckResult | undefined
}): Promise<{ state: VideoStudioCompositionState; updatedCheck?: VideoEngineCheckResult }> {
  const { projectDir, previewState, lastCheck } = params
  const baseState = await inspectVideoStudioCompositionState(projectDir, previewState)
  if (!baseState.initialized && baseState.files.length === 0) {
    return { state: baseState }
  }

  const live = await computeProjectInputFingerprint(projectDir).catch(() => null)
  let updatedCheck = lastCheck
  let checkStale: boolean | undefined
  if (lastCheck && live) {
    const isStale =
      Boolean(lastCheck.stale) ||
      (Boolean(lastCheck.inputFingerprint) && lastCheck.inputFingerprint !== live.inputFingerprint)
    checkStale = isStale
    if (isStale && !lastCheck.stale) {
      updatedCheck = { ...lastCheck, stale: true }
    }
  }

  const driftReport = await computeCompositionDrift(projectDir).catch(() => null)
  return {
    updatedCheck,
    state: {
      ...baseState,
      ...(checkStale !== undefined ? { checkStale } : {}),
      ...(live ? { currentInputFingerprint: live.inputFingerprint } : {}),
      ...(driftReport
        ? {
            drift: {
              inSync: driftReport.inSync,
              hasWarnings: driftReport.hasWarnings,
              plannedTotalDurationSeconds: driftReport.plannedTotalDurationSeconds,
              actualTotalDurationSeconds: driftReport.actualTotalDurationSeconds,
              unmountedScenes: driftReport.unmountedScenes,
              missingFiles: driftReport.missingFiles
            }
          }
        : {})
    }
  }
}

export async function refreshVideoStudioCompositionState(params: {
  projectId: string
  projectDir: string
  previewState: VideoStudioPreviewState
  lastChecks: Map<string, VideoEngineCheckResult>
  jobs: Map<string, ActiveJobEntry>
}): Promise<VideoStudioCompositionState> {
  const { projectId, projectDir, previewState, lastChecks, jobs } = params
  const detailed = await buildDetailedCompositionState({
    projectDir,
    previewState,
    lastCheck: lastChecks.get(projectId)
  })
  if (detailed.updatedCheck) {
    lastChecks.set(projectId, detailed.updatedCheck)
    const entry = jobs.get(projectId)
    if (entry?.snapshot.kind === 'check') {
      entry.snapshot = { ...entry.snapshot, checkResult: detailed.updatedCheck }
    }
  }
  return detailed.state
}

export async function disposeVideoStudioJobResources(params: {
  jobs: Iterable<{ abortController?: AbortController; promise?: Promise<void> }>
  previewManager: { dispose: () => Promise<void> }
  watcher: { dispose: () => Promise<void> }
  trustStore: { close: () => void }
  listeners: { clear: () => void }
}): Promise<void> {
  const stops: Promise<unknown>[] = []
  for (const entry of params.jobs) {
    entry.abortController?.abort()
    if (entry.promise) {
      stops.push(entry.promise.catch(() => {}))
    }
  }
  stops.push(params.previewManager.dispose().catch(() => {}))
  stops.push(params.watcher.dispose().catch(() => {}))
  await Promise.all(stops)
  params.trustStore.close()
  params.listeners.clear()
}
