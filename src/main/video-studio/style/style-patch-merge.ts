import { readFile } from 'node:fs/promises'
import {
  StyleProfileSchema,
  type StyleProfile,
  type StyleProfileTokensPatch
} from '../../../shared/video-studio/video-studio-style-contract'
import { resolveContainedPath } from '../video-studio-path-containment'
import type { VideoStudioTransactionCoordinator } from '../video-studio-transactions'
import { readFileWithSha256, VIDEO_STUDIO_FILE_CONFLICT_ERROR } from '../video-studio-tx-journal'
import { syncDesignMarkdown, syncFrameMarkdown, syncMotionMarkdown } from './style-markdown-sync'
import { assertSafeStyleProfileTokens } from './style-token-validation'

export const STYLE_SYNC_FILES = [
  'styles/style-profile.json',
  'frame.md',
  'DESIGN.md',
  'MOTION.md'
] as const

export function bumpSnapshotRevision(current?: string): string {
  const match = current ? /^rev-(\d+)$/.exec(current) : null
  return match ? `rev-${Number.parseInt(match[1], 10) + 1}` : current ? 'rev-2' : 'rev-1'
}

/** Deep-merges validated token patches onto a `StyleProfile` snapshot and increments `snapshotRevision`. */
export function mergeStyleTokens(
  profile: StyleProfile,
  patch: StyleProfileTokensPatch
): StyleProfile {
  assertSafeStyleProfileTokens(patch)
  const next = structuredClone(profile)
  if (patch.name !== undefined) {
    next.name = patch.name
  }
  if (patch.description !== undefined) {
    next.description = patch.description
  }
  if (patch.category !== undefined) {
    next.category = patch.category
  }
  if (patch.visual) {
    const { palette, ...visualRest } = patch.visual
    Object.assign(next.visual, visualRest)
    if (palette) {
      Object.assign(next.visual.palette, palette)
    }
  }
  if (patch.typography) {
    Object.assign(next.typography, patch.typography)
  }
  if (patch.camera) {
    Object.assign(next.camera, patch.camera)
  }
  if (patch.motion) {
    Object.assign(next.motion, patch.motion)
  }
  if (patch.effects) {
    Object.assign(next.effects, patch.effects)
  }
  if (patch.composition) {
    Object.assign(next.composition, patch.composition)
  }
  if (patch.subtitle) {
    Object.assign(next.subtitle, patch.subtitle)
  }
  if (patch.openMotionPackageRef === null) {
    delete next.openMotionPackageRef
  } else if (patch.openMotionPackageRef !== undefined) {
    next.openMotionPackageRef = patch.openMotionPackageRef
  }
  next.snapshotRevision = bumpSnapshotRevision(next.snapshotRevision)
  const validated = StyleProfileSchema.parse(next)
  assertSafeStyleProfileTokens(validated)
  return validated
}

export async function readProjectFileText(
  projectDir: string,
  relativePath: string
): Promise<string | null> {
  const abs = await resolveContainedPath(projectDir, relativePath)
  return readFile(abs, 'utf8').catch(() => null)
}

export async function readProjectStyleMarkdown(projectDir: string) {
  const [frameMarkdown, designMarkdown, motionMarkdown] = await Promise.all([
    readProjectFileText(projectDir, 'frame.md'),
    readProjectFileText(projectDir, 'DESIGN.md'),
    readProjectFileText(projectDir, 'MOTION.md')
  ])
  return { frameMarkdown, designMarkdown, motionMarkdown }
}

export async function assertExpectedRevisions(
  projectDir: string,
  expectedRevision?: string,
  expectedRevisions?: Record<string, string>
): Promise<Map<string, string>> {
  const expectedMap = new Map<string, string>(Object.entries(expectedRevisions ?? {}))
  if (expectedRevision !== undefined && !expectedMap.has('styles/style-profile.json')) {
    expectedMap.set('styles/style-profile.json', expectedRevision)
  }
  for (const [relPath, expectedSha] of expectedMap.entries()) {
    const abs = await resolveContainedPath(projectDir, relPath)
    const disk = await readFileWithSha256(abs)
    if (!disk.exists || disk.sha256 !== expectedSha) {
      throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
    }
  }
  return expectedMap
}

export async function commitProjectStyleSync(params: {
  tx: VideoStudioTransactionCoordinator
  projectDir: string
  projectId: string
  profile: StyleProfile
  expectedMap: Map<string, string>
  mdOverride?: {
    frameMarkdown: string | null
    designMarkdown: string | null
    motionMarkdown: string | null
  }
}): Promise<{ profile: StyleProfile; revision: string }> {
  const md = params.mdOverride ?? (await readProjectStyleMarkdown(params.projectDir))
  const txResult = await params.tx.runProjectTransaction({
    projectDir: params.projectDir,
    projectId: params.projectId,
    operations: [
      {
        relativePath: 'styles/style-profile.json',
        content: `${JSON.stringify(params.profile, null, 2)}\n`,
        expectedSha256: params.expectedMap.get('styles/style-profile.json')
      },
      {
        relativePath: 'frame.md',
        content: syncFrameMarkdown(md.frameMarkdown, params.profile),
        expectedSha256: params.expectedMap.get('frame.md')
      },
      {
        relativePath: 'DESIGN.md',
        content: syncDesignMarkdown(md.designMarkdown, params.profile),
        expectedSha256: params.expectedMap.get('DESIGN.md')
      },
      {
        relativePath: 'MOTION.md',
        content: syncMotionMarkdown(md.motionMarkdown, params.profile),
        expectedSha256: params.expectedMap.get('MOTION.md')
      }
    ]
  })
  return { profile: params.profile, revision: txResult.revisions['styles/style-profile.json']! }
}
