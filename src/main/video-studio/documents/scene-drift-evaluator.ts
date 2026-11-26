import type { MotionImplementationStatus } from '../../../shared/video-studio/motion-registry-contract'
import type { SceneSpec } from '../../../shared/video-studio/video-studio-storyboard-contract'
import type { UniversalMotionRegistry } from '../motion/builtin-motion-presets'
import {
  type AssetRegistryLookup,
  checkContainedFileExists,
  isReferencedAssetAvailable,
  type MountedCompositionTag,
  normalizeRelativeCompositionPath,
  parseDurationSeconds
} from './composition-html-inspector'

export type CompositionDriftKind =
  | 'duration-mismatch'
  | 'missing-composition-file'
  | 'unmounted-scene'
  | 'orphan-mounted-composition'
  | 'unmounted-composition-file'
  | 'missing-asset-file'
  | 'unknown-motion-preset'
  | 'non-executable-motion-preset'

export type CompositionDriftItem = {
  kind: CompositionDriftKind
  severity: 'warning' | 'info'
  sceneId?: string
  frameNumber?: number
  src?: string
  message: string
  plannedDurationSeconds?: number
  actualDurationSeconds?: number
  presetId?: string
  presetStatus?: MotionImplementationStatus | 'unknown'
  assetRef?: string
}

export type SceneDriftSummary = {
  sceneId: string
  frameNumber: number
  title: string
  src?: string
  mounted: boolean
  fileExists: boolean
  plannedDurationSeconds: number | null
  actualDurationSeconds: number | null
  durationDeltaSeconds: number | null
  issues: CompositionDriftItem[]
}

export type CompositionDriftReport = {
  inSync: boolean
  hasWarnings: boolean
  plannedTotalDurationSeconds: number
  actualTotalDurationSeconds: number
  mountedSources: string[]
  compositionFiles: string[]
  unmountedScenes: string[]
  missingFiles: string[]
  scenes: SceneDriftSummary[]
  items: CompositionDriftItem[]
}

export async function evaluateSceneDrift(params: {
  projectDir: string
  frame: SceneSpec
  mountedBySrc: ReadonlyMap<string, MountedCompositionTag>
  fileDurations: ReadonlyMap<string, number | null>
  motionRegistry: UniversalMotionRegistry
  assetRegistry: AssetRegistryLookup | null
}): Promise<{
  summary: SceneDriftSummary
  normalizedSrc: string | null
  missingFile: string | null
  unmounted: boolean
}> {
  const { projectDir, frame, mountedBySrc, fileDurations, motionRegistry, assetRegistry } = params
  const sceneIssues: CompositionDriftItem[] = []
  const plannedDuration = parseDurationSeconds(frame.duration)
  const normalizedSrc = frame.src ? normalizeRelativeCompositionPath(frame.src) : null
  const mountedTag = normalizedSrc ? mountedBySrc.get(normalizedSrc) : undefined
  const mounted = Boolean(mountedTag)
  const fileExists = normalizedSrc
    ? await checkContainedFileExists(projectDir, normalizedSrc)
    : false
  const actualDuration = normalizedSrc
    ? (fileDurations.get(normalizedSrc) ?? mountedTag?.durationSeconds ?? null)
    : null

  if (!mounted) {
    sceneIssues.push({
      kind: 'unmounted-scene',
      severity: 'warning',
      sceneId: frame.sceneId,
      frameNumber: frame.frameNumber,
      ...(frame.src ? { src: frame.src } : {}),
      message: frame.src
        ? `Frame ${frame.frameNumber} (${frame.src}) is not mounted in index.html.`
        : `Frame ${frame.frameNumber} has no composition src mounted in index.html.`
    })
  }

  let missingFile: string | null = null
  if (frame.src && (!normalizedSrc || !fileExists)) {
    missingFile = normalizedSrc ?? frame.src
    sceneIssues.push({
      kind: 'missing-composition-file',
      severity: 'warning',
      sceneId: frame.sceneId,
      frameNumber: frame.frameNumber,
      src: missingFile,
      message: `Composition file ${missingFile} referenced by Frame ${frame.frameNumber} is missing.`
    })
  }

  let durationDeltaSeconds: number | null = null
  if (plannedDuration !== null && actualDuration !== null) {
    durationDeltaSeconds = actualDuration - plannedDuration
    if (Math.abs(durationDeltaSeconds) > 0.001) {
      sceneIssues.push({
        kind: 'duration-mismatch',
        severity: 'warning',
        sceneId: frame.sceneId,
        frameNumber: frame.frameNumber,
        ...(normalizedSrc ? { src: normalizedSrc } : {}),
        plannedDurationSeconds: plannedDuration,
        actualDurationSeconds: actualDuration,
        message: `Frame ${frame.frameNumber} planned ${plannedDuration}s differs from actual ${actualDuration}s.`
      })
    }
  }

  for (const presetId of frame.motionPresets) {
    const status = motionRegistry.getPresetStatus(presetId, frame.engine)
    if (!status.found) {
      sceneIssues.push({
        kind: 'unknown-motion-preset',
        severity: 'warning',
        sceneId: frame.sceneId,
        frameNumber: frame.frameNumber,
        presetId,
        presetStatus: 'unknown',
        message: `Unknown motion preset "${presetId}" on Frame ${frame.frameNumber}.`
      })
    } else if (!status.executable) {
      sceneIssues.push({
        kind: 'non-executable-motion-preset',
        severity: 'info',
        sceneId: frame.sceneId,
        frameNumber: frame.frameNumber,
        presetId,
        presetStatus: status.engineStatus ?? status.executionKind,
        message: `Motion preset "${presetId}" is ${status.engineStatus ?? status.executionKind} (not executable) on ${frame.engine}.`
      })
    }
  }

  for (const assetRef of frame.assets) {
    if (!(await isReferencedAssetAvailable(projectDir, assetRef, assetRegistry))) {
      sceneIssues.push({
        kind: 'missing-asset-file',
        severity: 'warning',
        sceneId: frame.sceneId,
        frameNumber: frame.frameNumber,
        assetRef,
        message: `Referenced asset "${assetRef}" is missing from asset-registry.json or disk.`
      })
    }
  }

  return {
    normalizedSrc,
    missingFile,
    unmounted: !mounted,
    summary: {
      sceneId: frame.sceneId,
      frameNumber: frame.frameNumber,
      title: frame.title,
      ...(frame.src ? { src: frame.src } : {}),
      mounted,
      fileExists,
      plannedDurationSeconds: plannedDuration,
      actualDurationSeconds: actualDuration,
      durationDeltaSeconds,
      issues: sceneIssues
    }
  }
}
