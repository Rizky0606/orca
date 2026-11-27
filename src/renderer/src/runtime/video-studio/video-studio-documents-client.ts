import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  VIDEO_STUDIO_ADD_STORYBOARD_FRAME_METHOD,
  VIDEO_STUDIO_APPROVE_PROJECT_EXECUTION_METHOD,
  VIDEO_STUDIO_DELETE_RESEARCH_SOURCE_METHOD,
  VIDEO_STUDIO_DELETE_STORYBOARD_FRAME_METHOD,
  VIDEO_STUDIO_GET_PROJECT_DOCUMENTS_METHOD,
  VIDEO_STUDIO_PATCH_STORYBOARD_FRAME_METHOD,
  VIDEO_STUDIO_REORDER_STORYBOARD_FRAMES_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_BRIEF_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_SCRIPT_METHOD,
  VIDEO_STUDIO_UPSERT_RESEARCH_SOURCE_METHOD,
  type VideoStudioAddStoryboardFrameParams,
  type VideoStudioAddStoryboardFrameResult,
  type VideoStudioApproveProjectExecutionParams,
  type VideoStudioApproveProjectExecutionResult,
  type VideoStudioDeleteResearchSourceParams,
  type VideoStudioDeleteResearchSourceResult,
  type VideoStudioDeleteStoryboardFrameParams,
  type VideoStudioDeleteStoryboardFrameResult,
  type VideoStudioGetProjectDocumentsParams,
  type VideoStudioGetProjectDocumentsResult,
  type VideoStudioPatchStoryboardFrameParams,
  type VideoStudioPatchStoryboardFrameResult,
  type VideoStudioReorderStoryboardFramesParams,
  type VideoStudioReorderStoryboardFramesResult,
  type VideoStudioUpdateProjectBriefParams,
  type VideoStudioUpdateProjectBriefResult,
  type VideoStudioUpdateProjectScriptParams,
  type VideoStudioUpdateProjectScriptResult,
  type VideoStudioUpsertResearchSourceParams,
  type VideoStudioUpsertResearchSourceResult
} from '../../../../shared/video-studio/video-studio-document-rpc-contract'
import { callRuntimeRpc } from '../rpc/calls/runtime-rpc-call'

export function getVideoStudioProjectDocumentsForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioGetProjectDocumentsParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioGetProjectDocumentsResult>(
    target,
    VIDEO_STUDIO_GET_PROJECT_DOCUMENTS_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function updateVideoStudioProjectBriefForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioUpdateProjectBriefParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioUpdateProjectBriefResult>(
    target,
    VIDEO_STUDIO_UPDATE_PROJECT_BRIEF_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function updateVideoStudioProjectScriptForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioUpdateProjectScriptParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioUpdateProjectScriptResult>(
    target,
    VIDEO_STUDIO_UPDATE_PROJECT_SCRIPT_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function upsertVideoStudioResearchSourceForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioUpsertResearchSourceParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioUpsertResearchSourceResult>(
    target,
    VIDEO_STUDIO_UPSERT_RESEARCH_SOURCE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function deleteVideoStudioResearchSourceForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioDeleteResearchSourceParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioDeleteResearchSourceResult>(
    target,
    VIDEO_STUDIO_DELETE_RESEARCH_SOURCE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function approveVideoStudioProjectExecutionForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioApproveProjectExecutionParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioApproveProjectExecutionResult>(
    target,
    VIDEO_STUDIO_APPROVE_PROJECT_EXECUTION_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function addVideoStudioStoryboardFrameForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioAddStoryboardFrameParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioAddStoryboardFrameResult>(
    target,
    VIDEO_STUDIO_ADD_STORYBOARD_FRAME_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function patchVideoStudioStoryboardFrameForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioPatchStoryboardFrameParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioPatchStoryboardFrameResult>(
    target,
    VIDEO_STUDIO_PATCH_STORYBOARD_FRAME_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function deleteVideoStudioStoryboardFrameForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioDeleteStoryboardFrameParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioDeleteStoryboardFrameResult>(
    target,
    VIDEO_STUDIO_DELETE_STORYBOARD_FRAME_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function reorderVideoStudioStoryboardFramesForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioReorderStoryboardFramesParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioReorderStoryboardFramesResult>(
    target,
    VIDEO_STUDIO_REORDER_STORYBOARD_FRAMES_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}
