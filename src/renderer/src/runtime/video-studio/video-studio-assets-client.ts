import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  VIDEO_STUDIO_APPLY_LIBRARY_ASSET_TO_PROJECT_METHOD,
  VIDEO_STUDIO_DELETE_LIBRARY_ASSET_METHOD,
  VIDEO_STUDIO_LIST_LIBRARY_ASSETS_METHOD,
  VIDEO_STUDIO_LIST_PROJECT_ASSETS_METHOD,
  VIDEO_STUDIO_REGISTER_OR_IMPORT_ASSET_METHOD,
  VIDEO_STUDIO_REMOVE_PROJECT_ASSET_METHOD,
  VIDEO_STUDIO_SAVE_PROJECT_ASSET_TO_LIBRARY_METHOD,
  VIDEO_STUDIO_UPDATE_ASSET_METADATA_METHOD,
  type VideoStudioApplyLibraryAssetToProjectParams,
  type VideoStudioApplyLibraryAssetToProjectResult,
  type VideoStudioDeleteLibraryAssetParams,
  type VideoStudioDeleteLibraryAssetResult,
  type VideoStudioListLibraryAssetsParams,
  type VideoStudioListLibraryAssetsResult,
  type VideoStudioListProjectAssetsParams,
  type VideoStudioListProjectAssetsResult,
  type VideoStudioRegisterOrImportAssetParams,
  type VideoStudioRegisterOrImportAssetResult,
  type VideoStudioRemoveProjectAssetParams,
  type VideoStudioRemoveProjectAssetResult,
  type VideoStudioSaveProjectAssetToLibraryParams,
  type VideoStudioSaveProjectAssetToLibraryResult,
  type VideoStudioUpdateAssetMetadataParams,
  type VideoStudioUpdateAssetMetadataResult
} from '../../../../shared/video-studio/video-studio-asset-rpc-contract'
import { callRuntimeRpc } from '../rpc/calls/runtime-rpc-call'

export function listVideoStudioLibraryAssetsForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioListLibraryAssetsParams = {},
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioListLibraryAssetsResult>(
    target,
    VIDEO_STUDIO_LIST_LIBRARY_ASSETS_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function listVideoStudioProjectAssetsForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioListProjectAssetsParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioListProjectAssetsResult>(
    target,
    VIDEO_STUDIO_LIST_PROJECT_ASSETS_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function registerOrImportVideoStudioAssetForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioRegisterOrImportAssetParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioRegisterOrImportAssetResult>(
    target,
    VIDEO_STUDIO_REGISTER_OR_IMPORT_ASSET_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function updateVideoStudioAssetMetadataForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioUpdateAssetMetadataParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioUpdateAssetMetadataResult>(
    target,
    VIDEO_STUDIO_UPDATE_ASSET_METADATA_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function applyVideoStudioLibraryAssetToProjectForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioApplyLibraryAssetToProjectParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioApplyLibraryAssetToProjectResult>(
    target,
    VIDEO_STUDIO_APPLY_LIBRARY_ASSET_TO_PROJECT_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function saveVideoStudioProjectAssetToLibraryForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioSaveProjectAssetToLibraryParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioSaveProjectAssetToLibraryResult>(
    target,
    VIDEO_STUDIO_SAVE_PROJECT_ASSET_TO_LIBRARY_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function removeVideoStudioProjectAssetForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioRemoveProjectAssetParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioRemoveProjectAssetResult>(
    target,
    VIDEO_STUDIO_REMOVE_PROJECT_ASSET_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}

export function deleteVideoStudioLibraryAssetForTarget(
  target: RuntimeClientTarget,
  params: VideoStudioDeleteLibraryAssetParams,
  expectedEnvironmentPairingRevision?: number
) {
  return callRuntimeRpc<VideoStudioDeleteLibraryAssetResult>(
    target,
    VIDEO_STUDIO_DELETE_LIBRARY_ASSET_METHOD,
    params,
    { expectedEnvironmentPairingRevision }
  )
}
