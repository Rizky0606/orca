import {
  VIDEO_STUDIO_APPLY_LIBRARY_ASSET_TO_PROJECT_METHOD,
  VIDEO_STUDIO_DELETE_LIBRARY_ASSET_METHOD,
  VIDEO_STUDIO_LIST_LIBRARY_ASSETS_METHOD,
  VIDEO_STUDIO_LIST_PROJECT_ASSETS_METHOD,
  VIDEO_STUDIO_REGISTER_OR_IMPORT_ASSET_METHOD,
  VIDEO_STUDIO_REMOVE_PROJECT_ASSET_METHOD,
  VIDEO_STUDIO_SAVE_PROJECT_ASSET_TO_LIBRARY_METHOD,
  VIDEO_STUDIO_UPDATE_ASSET_METADATA_METHOD,
  VideoStudioApplyLibraryAssetToProjectParams,
  VideoStudioDeleteLibraryAssetParams,
  VideoStudioListLibraryAssetsParams,
  VideoStudioListProjectAssetsParams,
  VideoStudioRegisterOrImportAssetParams,
  VideoStudioRemoveProjectAssetParams,
  VideoStudioSaveProjectAssetToLibraryParams,
  VideoStudioUpdateAssetMetadataParams
} from '../../../../../shared/video-studio/video-studio-asset-rpc-contract'
import { openVideoStudioJobManager } from '../../../../video-studio/video-studio-job-registry'
import { defineMethod } from '../../core'
import { requireProject, runVideoStudioRpc } from './video-studio-rpc-context'

export const VIDEO_STUDIO_ASSET_METHODS = [
  defineMethod({
    name: VIDEO_STUDIO_LIST_LIBRARY_ASSETS_METHOD,
    permission: 'workspace',
    params: VideoStudioListLibraryAssetsParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        const manager = await openVideoStudioJobManager(directory)
        return manager.assets.listLibraryAssets(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_LIST_PROJECT_ASSETS_METHOD,
    permission: 'workspace',
    params: VideoStudioListProjectAssetsParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.assets.listProjectAssets(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_REGISTER_OR_IMPORT_ASSET_METHOD,
    permission: 'workspace',
    params: VideoStudioRegisterOrImportAssetParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        if (params.projectId) {
          await requireProject(context, params.projectId)
        }
        const manager = await openVideoStudioJobManager(directory)
        return manager.assets.registerOrImportAsset(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_UPDATE_ASSET_METADATA_METHOD,
    permission: 'workspace',
    params: VideoStudioUpdateAssetMetadataParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.assets.updateAssetMetadata(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_APPLY_LIBRARY_ASSET_TO_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioApplyLibraryAssetToProjectParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.assets.applyLibraryAssetToProject(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_SAVE_PROJECT_ASSET_TO_LIBRARY_METHOD,
    permission: 'workspace',
    params: VideoStudioSaveProjectAssetToLibraryParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.assets.saveProjectAssetToLibrary(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_REMOVE_PROJECT_ASSET_METHOD,
    permission: 'workspace',
    params: VideoStudioRemoveProjectAssetParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.assets.removeProjectAsset(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_DELETE_LIBRARY_ASSET_METHOD,
    permission: 'workspace',
    params: VideoStudioDeleteLibraryAssetParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        const manager = await openVideoStudioJobManager(directory)
        return manager.assets.deleteLibraryAsset(params)
      })
  })
]
