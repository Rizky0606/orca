import { randomUUID } from 'node:crypto'
import {
  SceneSpecSchema,
  type SceneSpec,
  type StoryboardDocument
} from '../../../shared/video-studio/video-studio-storyboard-contract'
import type {
  VideoStudioAddStoryboardFrameParams,
  VideoStudioPatchStoryboardFrameParams
} from '../../../shared/video-studio/video-studio-document-rpc-contract'
import { VIDEO_STUDIO_FILE_CONFLICT_ERROR } from '../video-studio-tx-journal'

export function renumberFrames(frames: readonly SceneSpec[]): SceneSpec[] {
  return frames.map((frame, index) => ({ ...frame, frameNumber: index + 1 }))
}

function generateUniqueSceneId(existing: readonly SceneSpec[]): string {
  const used = new Set(existing.map((frame) => frame.sceneId))
  for (let i = 0; i < 8; i += 1) {
    const candidate = `scene_${randomUUID().replaceAll('-', '').slice(0, 8)}`
    if (!used.has(candidate)) {
      return candidate
    }
  }
  return `scene_${randomUUID().replaceAll('-', '')}`
}

export function applyAddStoryboardFrame(
  doc: StoryboardDocument,
  frameInput: VideoStudioAddStoryboardFrameParams['frame'],
  insertAtIndex?: number
): { storyboard: StoryboardDocument; result: { frame: SceneSpec } } {
  const sceneId = frameInput.sceneId ?? generateUniqueSceneId(doc.frames)
  if (doc.frames.some((frame) => frame.sceneId === sceneId)) {
    throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
  }
  const newFrame = SceneSpecSchema.parse({
    ...frameInput,
    sceneId,
    frameNumber: doc.frames.length + 1
  })
  const insertAt =
    insertAtIndex === undefined
      ? doc.frames.length
      : Math.min(Math.max(0, insertAtIndex), doc.frames.length)
  const nextFrames = [...doc.frames]
  nextFrames.splice(insertAt, 0, newFrame)
  const numbered = renumberFrames(nextFrames)
  return {
    storyboard: { ...doc, frames: numbered },
    result: { frame: numbered[insertAt] }
  }
}

export function applyPatchStoryboardFrame(
  doc: StoryboardDocument,
  sceneId: string,
  patch: VideoStudioPatchStoryboardFrameParams['patch']
): { storyboard: StoryboardDocument; result: { frame: SceneSpec } } {
  const idx = doc.frames.findIndex((frame) => frame.sceneId === sceneId)
  if (idx === -1) {
    throw new Error('video_studio_scene_not_found')
  }
  const current = doc.frames[idx]
  const updated = SceneSpecSchema.parse({
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    sceneId: current.sceneId,
    frameNumber: current.frameNumber
  })
  const numbered = renumberFrames(doc.frames.map((frame, i) => (i === idx ? updated : frame)))
  return {
    storyboard: { ...doc, frames: numbered },
    result: { frame: numbered[idx] }
  }
}

export function applyDeleteStoryboardFrame(
  doc: StoryboardDocument,
  sceneId: string
): { storyboard: StoryboardDocument; result: { deleted: boolean } } {
  const idx = doc.frames.findIndex((frame) => frame.sceneId === sceneId)
  if (idx === -1) {
    throw new Error('video_studio_scene_not_found')
  }
  return {
    storyboard: { ...doc, frames: renumberFrames(doc.frames.filter((_, i) => i !== idx)) },
    result: { deleted: true }
  }
}

export function applyReorderStoryboardFrames(
  doc: StoryboardDocument,
  sceneIds: readonly string[]
): { storyboard: StoryboardDocument; result: Record<string, never> } {
  const byId = new Map(doc.frames.map((frame) => [frame.sceneId, frame]))
  const seen = new Set<string>()
  const reordered: SceneSpec[] = []
  for (const sceneId of sceneIds) {
    if (seen.has(sceneId)) {
      throw Object.assign(new Error('invalid_argument: duplicate sceneId'), {
        code: 'invalid_argument'
      })
    }
    seen.add(sceneId)
    const found = byId.get(sceneId)
    if (!found) {
      throw new Error('video_studio_scene_not_found')
    }
    reordered.push(found)
  }
  if (reordered.length !== doc.frames.length) {
    throw Object.assign(new Error('invalid_argument: sceneIds must include all frames'), {
      code: 'invalid_argument'
    })
  }
  return {
    storyboard: { ...doc, frames: renumberFrames(reordered) },
    result: {}
  }
}
