import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  VIDEO_STUDIO_CREATE_PROJECT_METHOD,
  VIDEO_STUDIO_DELETE_PROJECT_METHOD,
  VIDEO_STUDIO_LIST_PROJECTS_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_METHOD,
  type VideoStudioCreateProjectParams,
  type VideoStudioCreateProjectResult,
  type VideoStudioDeleteProjectParams,
  type VideoStudioDeleteProjectResult,
  type VideoStudioListProjectsResult,
  type VideoStudioUpdateProjectParams,
  type VideoStudioUpdateProjectResult
} from '../../../../shared/video-studio/video-studio-rpc-contract'
import { callRuntimeRpc } from '../rpc/calls/runtime-rpc-call'

export function listVideoStudioProjectsForTarget(target: RuntimeClientTarget) {
  return callRuntimeRpc<VideoStudioListProjectsResult>(target, VIDEO_STUDIO_LIST_PROJECTS_METHOD)
}

export function createVideoStudioProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioCreateProjectParams
) {
  return callRuntimeRpc<VideoStudioCreateProjectResult>(
    target,
    VIDEO_STUDIO_CREATE_PROJECT_METHOD,
    params
  )
}

export function updateVideoStudioProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioUpdateProjectParams
) {
  return callRuntimeRpc<VideoStudioUpdateProjectResult>(
    target,
    VIDEO_STUDIO_UPDATE_PROJECT_METHOD,
    params
  )
}

export function deleteVideoStudioProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioDeleteProjectParams
) {
  return callRuntimeRpc<VideoStudioDeleteProjectResult>(
    target,
    VIDEO_STUDIO_DELETE_PROJECT_METHOD,
    params
  )
}
