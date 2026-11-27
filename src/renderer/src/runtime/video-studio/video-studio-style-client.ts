import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  VIDEO_STUDIO_APPLY_STYLE_PROFILE_TO_PROJECT_METHOD,
  VIDEO_STUDIO_DELETE_LIBRARY_STYLE_PROFILE_METHOD,
  VIDEO_STUDIO_DUPLICATE_STYLE_PROFILE_METHOD,
  VIDEO_STUDIO_GET_PROJECT_STYLE_STATE_METHOD,
  VIDEO_STUDIO_GET_STYLE_RECONCILIATION_DIFF_METHOD,
  VIDEO_STUDIO_LIST_MOTION_PRESETS_METHOD,
  VIDEO_STUDIO_LIST_STYLE_PROFILES_METHOD,
  VIDEO_STUDIO_RECONCILE_PROJECT_STYLE_METHOD,
  VIDEO_STUDIO_SAVE_LIBRARY_STYLE_PROFILE_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_STYLE_TOKENS_METHOD,
  type VideoStudioApplyStyleProfileToProjectParams,
  type VideoStudioApplyStyleProfileToProjectResult,
  type VideoStudioDeleteLibraryStyleProfileParams,
  type VideoStudioDeleteLibraryStyleProfileResult,
  type VideoStudioDuplicateStyleProfileParams,
  type VideoStudioDuplicateStyleProfileResult,
  type VideoStudioGetProjectStyleStateParams,
  type VideoStudioGetProjectStyleStateResult,
  type VideoStudioGetStyleReconciliationDiffParams,
  type VideoStudioGetStyleReconciliationDiffResult,
  type VideoStudioListMotionPresetsParams,
  type VideoStudioListMotionPresetsResult,
  type VideoStudioListStyleProfilesResult,
  type VideoStudioReconcileProjectStyleParams,
  type VideoStudioReconcileProjectStyleResult,
  type VideoStudioSaveLibraryStyleProfileParams,
  type VideoStudioSaveLibraryStyleProfileResult,
  type VideoStudioUpdateProjectStyleTokensParams,
  type VideoStudioUpdateProjectStyleTokensResult
} from '../../../../shared/video-studio/video-studio-style-rpc-contract'
import { callRuntimeRpc } from '../rpc/calls/runtime-rpc-call'

export function listVideoStudioStyleProfilesForTarget(
  target: RuntimeClientTarget,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioListStyleProfilesResult>(
    target,
    VIDEO_STUDIO_LIST_STYLE_PROFILES_METHOD,
    {},
    { expectedEnvironmentPairingRevision }
  )
}

export function saveLibraryVideoStudioStyleProfileForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioSaveLibraryStyleProfileParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioSaveLibraryStyleProfileResult>(
    target,
    VIDEO_STUDIO_SAVE_LIBRARY_STYLE_PROFILE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function duplicateVideoStudioStyleProfileForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioDuplicateStyleProfileParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioDuplicateStyleProfileResult>(
    target,
    VIDEO_STUDIO_DUPLICATE_STYLE_PROFILE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function deleteLibraryVideoStudioStyleProfileForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioDeleteLibraryStyleProfileParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioDeleteLibraryStyleProfileResult>(
    target,
    VIDEO_STUDIO_DELETE_LIBRARY_STYLE_PROFILE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function getVideoStudioProjectStyleStateForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioGetProjectStyleStateParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioGetProjectStyleStateResult>(
    target,
    VIDEO_STUDIO_GET_PROJECT_STYLE_STATE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function applyVideoStudioStyleProfileToProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioApplyStyleProfileToProjectParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioApplyStyleProfileToProjectResult>(
    target,
    VIDEO_STUDIO_APPLY_STYLE_PROFILE_TO_PROJECT_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function updateVideoStudioProjectStyleTokensForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioUpdateProjectStyleTokensParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioUpdateProjectStyleTokensResult>(
    target,
    VIDEO_STUDIO_UPDATE_PROJECT_STYLE_TOKENS_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function getVideoStudioStyleReconciliationDiffForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioGetStyleReconciliationDiffParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioGetStyleReconciliationDiffResult>(
    target,
    VIDEO_STUDIO_GET_STYLE_RECONCILIATION_DIFF_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function reconcileVideoStudioProjectStyleForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioReconcileProjectStyleParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioReconcileProjectStyleResult>(
    target,
    VIDEO_STUDIO_RECONCILE_PROJECT_STYLE_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function listVideoStudioMotionPresetsForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioListMotionPresetsParams = {},
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioListMotionPresetsResult>(
    target,
    VIDEO_STUDIO_LIST_MOTION_PRESETS_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}
