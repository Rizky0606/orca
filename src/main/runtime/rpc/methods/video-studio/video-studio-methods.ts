import {
  VIDEO_STUDIO_CREATE_PROJECT_METHOD,
  VIDEO_STUDIO_DELETE_PROJECT_METHOD,
  VIDEO_STUDIO_LIST_PROJECTS_METHOD,
  VIDEO_STUDIO_UPDATE_PROJECT_METHOD,
  VideoStudioCreateProjectParams,
  VideoStudioDeleteProjectParams,
  VideoStudioListProjectsParams,
  VideoStudioUpdateProjectParams
} from '../../../../../shared/video-studio/video-studio-rpc-contract'
import { openVideoStudioCatalog } from '../../../../video-studio/video-studio-catalog'
import { defineMethod, type RpcContext } from '../../core'

function hostCatalog({ runtime }: RpcContext) {
  const directory = runtime.requireStore().getProfileStorageDirectory?.()
  if (!directory) {
    throw new Error('runtime_unavailable')
  }
  return openVideoStudioCatalog(directory)
}

export const VIDEO_STUDIO_METHODS = [
  defineMethod({
    name: VIDEO_STUDIO_LIST_PROJECTS_METHOD,
    permission: 'workspace',
    params: VideoStudioListProjectsParams,
    handler: async (_params, context) => (await hostCatalog(context)).list()
  }),
  defineMethod({
    name: VIDEO_STUDIO_CREATE_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioCreateProjectParams,
    handler: async (params, context) => (await hostCatalog(context)).create(params)
  }),
  defineMethod({
    name: VIDEO_STUDIO_UPDATE_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioUpdateProjectParams,
    handler: async (params, context) => (await hostCatalog(context)).update(params)
  }),
  defineMethod({
    name: VIDEO_STUDIO_DELETE_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioDeleteProjectParams,
    handler: async (params, context) => (await hostCatalog(context)).remove(params)
  })
]
