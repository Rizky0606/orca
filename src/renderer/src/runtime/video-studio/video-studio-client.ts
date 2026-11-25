import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  VIDEO_STUDIO_CANCEL_RENDER_METHOD,
  VIDEO_STUDIO_CHECK_COMPOSITION_METHOD,
  VIDEO_STUDIO_CREATE_PROJECT_METHOD,
  VIDEO_STUDIO_DELETE_PROJECT_METHOD,
  VIDEO_STUDIO_GET_COMPOSITION_STATE_METHOD,
  VIDEO_STUDIO_LIST_PROJECTS_METHOD,
  VIDEO_STUDIO_OPEN_COMPOSITION_WORKSPACE_METHOD,
  VIDEO_STUDIO_PROBE_ENGINES_METHOD,
  VIDEO_STUDIO_READ_RENDER_OUTPUT_CHUNK_METHOD,
  VIDEO_STUDIO_SCAFFOLD_COMPOSITION_METHOD,
  VIDEO_STUDIO_START_PREVIEW_METHOD,
  VIDEO_STUDIO_START_RENDER_METHOD,
  VIDEO_STUDIO_STOP_PREVIEW_METHOD,
  VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_METHOD,
  VideoStudioJobsEventSchema,
  type VideoStudioCancelRenderParams,
  type VideoStudioCancelRenderResult,
  type VideoStudioCheckCompositionParams,
  type VideoStudioCheckCompositionResult,
  type VideoStudioCreateProjectParams,
  type VideoStudioCreateProjectResult,
  type VideoStudioDeleteProjectParams,
  type VideoStudioDeleteProjectResult,
  type VideoStudioGetCompositionStateParams,
  type VideoStudioGetCompositionStateResult,
  type VideoStudioJobsEvent,
  type VideoStudioListProjectsResult,
  type VideoStudioOpenCompositionWorkspaceParams,
  type VideoStudioOpenCompositionWorkspaceResult,
  type VideoStudioProbeEnginesResult,
  type VideoStudioReadRenderOutputChunkParams,
  type VideoStudioReadRenderOutputChunkResult,
  type VideoStudioScaffoldCompositionParams,
  type VideoStudioScaffoldCompositionResult,
  type VideoStudioStartPreviewParams,
  type VideoStudioStartPreviewResult,
  type VideoStudioStartRenderParams,
  type VideoStudioStartRenderResult,
  type VideoStudioStopPreviewParams,
  type VideoStudioStopPreviewResult,
  type VideoStudioSubscribeJobsParams,
  type VideoStudioUpdateProjectParams,
  type VideoStudioUpdateProjectResult
} from '../../../../shared/video-studio/video-studio-rpc-contract'
import { callRuntimeRpc } from '../rpc/calls/runtime-rpc-call'
import { subscribeRuntimeRpc } from '../rpc/subscriptions/runtime-rpc-subscribe'

export function listVideoStudioProjectsForTarget(
  target: RuntimeClientTarget,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioListProjectsResult>(
    target,
    VIDEO_STUDIO_LIST_PROJECTS_METHOD,
    {},
    { expectedEnvironmentPairingRevision }
  )
}

export function createVideoStudioProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioCreateProjectParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioCreateProjectResult>(
    target,
    VIDEO_STUDIO_CREATE_PROJECT_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function updateVideoStudioProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioUpdateProjectParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioUpdateProjectResult>(
    target,
    VIDEO_STUDIO_UPDATE_PROJECT_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function deleteVideoStudioProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioDeleteProjectParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioDeleteProjectResult>(
    target,
    VIDEO_STUDIO_DELETE_PROJECT_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function probeVideoStudioEnginesForTarget(
  target: RuntimeClientTarget,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioProbeEnginesResult>(
    target,
    VIDEO_STUDIO_PROBE_ENGINES_METHOD,
    {},
    { expectedEnvironmentPairingRevision }
  )
}

export function getVideoStudioCompositionStateForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioGetCompositionStateParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioGetCompositionStateResult>(
    target,
    VIDEO_STUDIO_GET_COMPOSITION_STATE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function scaffoldVideoStudioCompositionForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioScaffoldCompositionParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioScaffoldCompositionResult>(
    target,
    VIDEO_STUDIO_SCAFFOLD_COMPOSITION_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function openVideoStudioCompositionWorkspaceForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioOpenCompositionWorkspaceParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioOpenCompositionWorkspaceResult>(
    target,
    VIDEO_STUDIO_OPEN_COMPOSITION_WORKSPACE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function checkVideoStudioCompositionForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioCheckCompositionParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioCheckCompositionResult>(
    target,
    VIDEO_STUDIO_CHECK_COMPOSITION_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function startVideoStudioRenderForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioStartRenderParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioStartRenderResult>(
    target,
    VIDEO_STUDIO_START_RENDER_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function cancelVideoStudioRenderForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioCancelRenderParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioCancelRenderResult>(
    target,
    VIDEO_STUDIO_CANCEL_RENDER_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function startVideoStudioPreviewForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioStartPreviewParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioStartPreviewResult>(
    target,
    VIDEO_STUDIO_START_PREVIEW_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function stopVideoStudioPreviewForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioStopPreviewParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioStopPreviewResult>(
    target,
    VIDEO_STUDIO_STOP_PREVIEW_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function readVideoStudioRenderOutputChunkForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioReadRenderOutputChunkParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioReadRenderOutputChunkResult>(
    target,
    VIDEO_STUDIO_READ_RENDER_OUTPUT_CHUNK_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function subscribeVideoStudioJobsForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioSubscribeJobsParams,
  handlers: {
    onEvent: (event: VideoStudioJobsEvent) => void
    onError?: (error: unknown) => void
    onClose?: () => void
  }
) {
  return subscribeRuntimeRpc(target, VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD, params, {
    onEvent: (result) => {
      const parsed = VideoStudioJobsEventSchema.safeParse(result)
      if (parsed.success) {
        handlers.onEvent(parsed.data)
      }
    },
    onError: handlers.onError ?? (() => {}),
    onClose: handlers.onClose ?? (() => {})
  })
}
