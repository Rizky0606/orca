import { readFile } from 'node:fs/promises'
import type { StoryboardDocument } from '../../../shared/video-studio/video-studio-storyboard-contract'
import {
  DEFAULT_UNIVERSAL_MOTION_REGISTRY,
  type UniversalMotionRegistry
} from '../motion/builtin-motion-presets'
import { inspectVideoStudioCompositionState } from '../video-studio-composition-paths'
import { resolveContainedPath } from '../video-studio-path-containment'
import {
  checkContainedFileExists,
  type MountedCompositionTag,
  parseMountedCompositionsFromIndexHtml,
  readAssetRegistryLookup,
  readCompositionFileDurations
} from './composition-html-inspector'
import {
  type CompositionDriftItem,
  type CompositionDriftReport,
  evaluateSceneDrift,
  type SceneDriftSummary
} from './scene-drift-evaluator'
import { parseStoryboardMarkdown } from './video-studio-markdown-sync'

export {
  parseCompositionDurationFromHtml,
  parseDurationSeconds,
  parseMountedCompositionsFromIndexHtml
} from './composition-html-inspector'
export type {
  CompositionDriftItem,
  CompositionDriftKind,
  CompositionDriftReport,
  SceneDriftSummary
} from './scene-drift-evaluator'

/** Compares `STORYBOARD.md` frames against mounted `index.html` slots and `compositions/*.html` files. */
export async function computeCompositionDrift(
  projectDir: string,
  options: { motionRegistry?: UniversalMotionRegistry; storyboard?: StoryboardDocument } = {}
): Promise<CompositionDriftReport> {
  const motionRegistry = options.motionRegistry ?? DEFAULT_UNIVERSAL_MOTION_REGISTRY
  const state = await inspectVideoStudioCompositionState(projectDir)
  const compositionFiles = state.files.filter(
    (file) =>
      (file.startsWith('compositions/') || file.startsWith('scenes/')) &&
      file.endsWith('.html') &&
      !file.startsWith('compositions/components/')
  )

  const storyboard =
    options.storyboard ??
    (await readFile(await resolveContainedPath(projectDir, 'STORYBOARD.md'), 'utf8')
      .then((raw) => parseStoryboardMarkdown(raw))
      .catch(() => ({ frontmatter: {}, frames: [], lockedSections: [] })))

  const indexHtml = await readFile(
    await resolveContainedPath(projectDir, 'index.html'),
    'utf8'
  ).catch(() => '')
  const mountedTags = indexHtml ? parseMountedCompositionsFromIndexHtml(indexHtml) : []
  const mountedBySrc = new Map<string, MountedCompositionTag>()
  const mountedSources: string[] = []
  for (const tag of mountedTags) {
    if (tag.normalizedSrc) {
      mountedBySrc.set(tag.normalizedSrc, tag)
      mountedSources.push(tag.normalizedSrc)
    }
  }

  const fileDurations = await readCompositionFileDurations(projectDir, [
    ...compositionFiles,
    ...mountedSources
  ])
  const assetRegistry = await readAssetRegistryLookup(projectDir)
  const items: CompositionDriftItem[] = []
  const missingFiles = new Set<string>()
  const unmountedScenes: string[] = []
  const scenes: SceneDriftSummary[] = []
  const frameSrcSet = new Set<string>()
  let plannedTotalDurationSeconds = 0

  for (const frame of storyboard.frames) {
    const evaluated = await evaluateSceneDrift({
      projectDir,
      frame,
      mountedBySrc,
      fileDurations,
      motionRegistry,
      assetRegistry
    })
    if (evaluated.summary.plannedDurationSeconds !== null) {
      plannedTotalDurationSeconds += evaluated.summary.plannedDurationSeconds
    }
    if (evaluated.normalizedSrc) {
      frameSrcSet.add(evaluated.normalizedSrc)
    }
    if (evaluated.unmounted) {
      unmountedScenes.push(frame.sceneId)
    }
    if (evaluated.missingFile) {
      missingFiles.add(evaluated.missingFile)
    }
    items.push(...evaluated.summary.issues)
    scenes.push(evaluated.summary)
  }

  let actualTotalDurationSeconds = 0
  for (const tag of mountedTags) {
    if (!tag.normalizedSrc) {
      items.push({
        kind: 'missing-composition-file',
        severity: 'warning',
        src: tag.rawSrc,
        message: `Mounted data-composition-src "${tag.rawSrc}" is not a safe contained path.`
      })
      continue
    }
    const dur = fileDurations.get(tag.normalizedSrc) ?? tag.durationSeconds
    if (dur !== null) {
      actualTotalDurationSeconds += dur
    }
    if (!(await checkContainedFileExists(projectDir, tag.normalizedSrc))) {
      missingFiles.add(tag.normalizedSrc)
      items.push({
        kind: 'missing-composition-file',
        severity: 'warning',
        src: tag.normalizedSrc,
        message: `Mounted composition "${tag.normalizedSrc}" in index.html does not exist on disk.`
      })
    } else if (!frameSrcSet.has(tag.normalizedSrc)) {
      items.push({
        kind: 'orphan-mounted-composition',
        severity: 'info',
        src: tag.normalizedSrc,
        message: `Mounted composition "${tag.normalizedSrc}" has no matching frame in STORYBOARD.md.`
      })
    }
  }

  for (const compFile of compositionFiles) {
    if (!mountedBySrc.has(compFile)) {
      items.push({
        kind: 'unmounted-composition-file',
        severity: 'info',
        src: compFile,
        message: `Composition file "${compFile}" on disk is not mounted in index.html.`
      })
    }
  }

  const hasWarnings = items.some((item) => item.severity === 'warning')
  return {
    inSync: !hasWarnings,
    hasWarnings,
    plannedTotalDurationSeconds,
    actualTotalDurationSeconds,
    mountedSources,
    compositionFiles,
    unmountedScenes,
    missingFiles: [...missingFiles],
    scenes,
    items
  }
}
