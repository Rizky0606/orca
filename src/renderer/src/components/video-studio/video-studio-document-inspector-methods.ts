import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  addVideoStudioStoryboardFrameForTarget,
  approveVideoStudioProjectExecutionForTarget,
  deleteVideoStudioResearchSourceForTarget,
  deleteVideoStudioStoryboardFrameForTarget,
  patchVideoStudioStoryboardFrameForTarget,
  reorderVideoStudioStoryboardFramesForTarget,
  updateVideoStudioProjectBriefForTarget,
  updateVideoStudioProjectScriptForTarget,
  upsertVideoStudioResearchSourceForTarget,
  type InspectorBundleSnapshot
} from './video-studio-inspector-actions'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

export type InspectorRunner = <T>(
  action: string,
  work: () => Promise<T>,
  fallbackValue: T,
  reloadAfter?: boolean
) => Promise<T>

type DocumentMethodSlice = Pick<
  VideoStudioInspectorController,
  | 'updateBrief'
  | 'updateScript'
  | 'upsertSource'
  | 'deleteSource'
  | 'addFrame'
  | 'patchFrame'
  | 'deleteFrame'
  | 'reorderFrames'
  | 'approveExecution'
>

export function createVideoStudioDocumentInspectorMethods(params: {
  target: RuntimeClientTarget
  pairingRevision: number | undefined
  projectId: string | undefined
  bundle: InspectorBundleSnapshot
  run: InspectorRunner
}): DocumentMethodSlice {
  const { target, pairingRevision, projectId, bundle, run } = params
  const forProject = <T>(
    action: string,
    work: (id: string) => Promise<T>,
    fallback: T
  ): Promise<T> =>
    projectId ? run(action, () => work(projectId), fallback) : Promise.resolve(fallback)
  const docRev = (name: string) => bundle.documents?.revisions[name]

  return {
    updateBrief: (input) =>
      forProject(
        'updateBrief',
        async (id) => {
          await updateVideoStudioProjectBriefForTarget(
            target,
            { projectId: id, ...input, expectedRevision: docRev('BRIEF.md') },
            pairingRevision
          )
          return true
        },
        false
      ),
    updateScript: (scriptMarkdown) =>
      forProject(
        'updateScript',
        async (id) => {
          await updateVideoStudioProjectScriptForTarget(
            target,
            { projectId: id, scriptMarkdown, expectedRevision: docRev('SCRIPT.md') },
            pairingRevision
          )
          return true
        },
        false
      ),
    upsertSource: (source) =>
      forProject(
        'upsertSource',
        async (id) => {
          await upsertVideoStudioResearchSourceForTarget(
            target,
            {
              projectId: id,
              source: { ...source, origin: 'manual', claimIds: [] },
              expectedRevision: docRev('references/sources.json')
            },
            pairingRevision
          )
          return true
        },
        false
      ),
    deleteSource: (sourceId) =>
      forProject(
        'deleteSource',
        async (id) => {
          await deleteVideoStudioResearchSourceForTarget(
            target,
            { projectId: id, sourceId, expectedRevision: docRev('references/sources.json') },
            pairingRevision
          )
          return true
        },
        false
      ),
    addFrame: (frame) =>
      forProject(
        'addFrame',
        async (id) => {
          await addVideoStudioStoryboardFrameForTarget(
            target,
            {
              projectId: id,
              frame: {
                ...frame,
                status: 'outline',
                engine: frame.engine ?? 'hyperframes',
                assets: frame.assets ?? [],
                motionPresets: frame.motionPresets ?? [],
                lockedSections: [],
                extra: {}
              },
              expectedRevision: docRev('STORYBOARD.md')
            },
            pairingRevision
          )
          return true
        },
        false
      ),
    patchFrame: (sceneId, patch) =>
      forProject(
        'patchFrame',
        async (id) => {
          await patchVideoStudioStoryboardFrameForTarget(
            target,
            { projectId: id, sceneId, patch, expectedRevision: docRev('STORYBOARD.md') },
            pairingRevision
          )
          return true
        },
        false
      ),
    deleteFrame: (sceneId) =>
      forProject(
        'deleteFrame',
        async (id) => {
          await deleteVideoStudioStoryboardFrameForTarget(
            target,
            { projectId: id, sceneId, expectedRevision: docRev('STORYBOARD.md') },
            pairingRevision
          )
          return true
        },
        false
      ),
    reorderFrames: (sceneIds) =>
      forProject(
        'reorderFrames',
        async (id) => {
          await reorderVideoStudioStoryboardFramesForTarget(
            target,
            { projectId: id, sceneIds, expectedRevision: docRev('STORYBOARD.md') },
            pairingRevision
          )
          return true
        },
        false
      ),
    approveExecution: (trustState, fallbackFingerprint) =>
      forProject(
        'approveExecution',
        async (id) => {
          const inputFingerprint = bundle.documents?.currentInputFingerprint ?? fallbackFingerprint
          if (!inputFingerprint) {
            return false
          }
          await approveVideoStudioProjectExecutionForTarget(
            target,
            { projectId: id, trustState, inputFingerprint },
            pairingRevision
          )
          return true
        },
        false
      )
  }
}
