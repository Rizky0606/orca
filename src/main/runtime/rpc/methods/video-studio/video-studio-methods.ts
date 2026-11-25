import { open } from 'node:fs/promises'
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
  VideoStudioCancelRenderParams,
  VideoStudioCheckCompositionParams,
  VideoStudioCreateProjectParams,
  VideoStudioDeleteProjectParams,
  VideoStudioGetCompositionStateParams,
  VideoStudioListProjectsParams,
  VideoStudioOpenCompositionWorkspaceParams,
  VideoStudioProbeEnginesParams,
  VideoStudioReadRenderOutputChunkParams,
  VideoStudioScaffoldCompositionParams,
  VideoStudioStartPreviewParams,
  VideoStudioStartRenderParams,
  VideoStudioStopPreviewParams,
  VideoStudioSubscribeJobsParams,
  VideoStudioUpdateProjectParams
} from '../../../../../shared/video-studio/video-studio-rpc-contract'
import { openVideoStudioCatalog } from '../../../../video-studio/video-studio-catalog'
import {
  resolveVideoStudioProjectDir,
  resolveVideoStudioRenderOutputFile
} from '../../../../video-studio/video-studio-composition-paths'
import { openVideoStudioJobManager } from '../../../../video-studio/video-studio-job-registry'
import { defineMethod, defineStreamingMethod, type RpcContext } from '../../core'
import { bindRpcSubscriptionStream } from '../../core-subscription-stream'
import { openVideoStudioCompositionWorkspace } from './video-studio-composition-workspace'

function profileDirectory({ runtime }: RpcContext): string {
  const directory = runtime.requireStore().getProfileStorageDirectory?.()
  if (!directory) {
    throw new Error('runtime_unavailable')
  }
  return directory
}

async function requireProject(context: RpcContext, projectId: string) {
  const directory = profileDirectory(context)
  const catalog = await openVideoStudioCatalog(directory)
  const project = await catalog.get(projectId)
  if (!project) {
    throw new Error('video_studio_project_not_found')
  }
  return { directory, project }
}

async function readRenderChunk(
  directory: string,
  projectId: string,
  renderId: string,
  offset: number,
  maxBytes: number
) {
  const catalog = await openVideoStudioCatalog(directory)
  const project = await catalog.get(projectId)
  if (!project) {
    throw new Error('video_studio_project_not_found')
  }
  const record = project.renders.find((entry) => entry.id === renderId)
  if (!record) {
    throw new Error('video_studio_render_not_found')
  }
  const projectDir = resolveVideoStudioProjectDir(directory, projectId)
  const filePath = resolveVideoStudioRenderOutputFile(projectDir, record.fileName)
  const handle = await open(filePath, 'r').catch((error) => {
    throw new Error('video_studio_render_file_missing', { cause: error })
  })
  try {
    const fileStats = await handle.stat()
    const totalBytes = fileStats.size
    if (offset > totalBytes) {
      throw Object.assign(new Error('invalid_argument'), { code: 'invalid_argument' })
    }
    const bytesToRead = Math.min(maxBytes, Math.max(0, totalBytes - offset))
    const buffer = Buffer.allocUnsafe(bytesToRead)
    let bytesRead = 0
    while (bytesRead < bytesToRead) {
      const res = await handle.read(buffer, bytesRead, bytesToRead - bytesRead, offset + bytesRead)
      if (res.bytesRead === 0) {
        break
      }
      bytesRead += res.bytesRead
    }
    const nextOffset = offset + bytesRead
    return {
      dataBase64: buffer.subarray(0, bytesRead).toString('base64'),
      totalBytes,
      nextOffset,
      eof: nextOffset >= totalBytes,
      mimeType: 'video/mp4' as const
    }
  } finally {
    await handle.close()
  }
}

export const VIDEO_STUDIO_METHODS = [
  defineMethod({
    name: VIDEO_STUDIO_LIST_PROJECTS_METHOD,
    permission: 'workspace',
    params: VideoStudioListProjectsParams,
    handler: async (_params, context) =>
      (await openVideoStudioCatalog(profileDirectory(context))).list()
  }),
  defineMethod({
    name: VIDEO_STUDIO_CREATE_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioCreateProjectParams,
    handler: async (params, context) =>
      (await openVideoStudioCatalog(profileDirectory(context))).create(params)
  }),
  defineMethod({
    name: VIDEO_STUDIO_UPDATE_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioUpdateProjectParams,
    handler: async (params, context) =>
      (await openVideoStudioCatalog(profileDirectory(context))).update(params)
  }),
  defineMethod({
    name: VIDEO_STUDIO_DELETE_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioDeleteProjectParams,
    handler: async (params, context) => {
      const directory = profileDirectory(context)
      const manager = await openVideoStudioJobManager(directory)
      await manager.cancelProjectWork(params.id).catch(() => {})
      return (await openVideoStudioCatalog(directory)).remove(params)
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_PROBE_ENGINES_METHOD,
    permission: 'workspace',
    params: VideoStudioProbeEnginesParams,
    handler: async (_params, context) => {
      const manager = await openVideoStudioJobManager(profileDirectory(context))
      return { engines: await manager.probeEngines() }
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_GET_COMPOSITION_STATE_METHOD,
    permission: 'workspace',
    params: VideoStudioGetCompositionStateParams,
    handler: async ({ projectId }, context) => {
      const { directory } = await requireProject(context, projectId)
      const manager = await openVideoStudioJobManager(directory)
      return manager.getCompositionState(projectId)
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_SCAFFOLD_COMPOSITION_METHOD,
    permission: 'workspace',
    params: VideoStudioScaffoldCompositionParams,
    handler: async ({ projectId, overwrite }, context) => {
      const { directory, project } = await requireProject(context, projectId)
      const manager = await openVideoStudioJobManager(directory)
      return manager.scaffoldComposition(project, { overwrite })
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_OPEN_COMPOSITION_WORKSPACE_METHOD,
    permission: 'workspace',
    params: VideoStudioOpenCompositionWorkspaceParams,
    handler: async ({ projectId }, context) => {
      const { directory, project } = await requireProject(context, projectId)
      return openVideoStudioCompositionWorkspace(context, directory, project)
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_CHECK_COMPOSITION_METHOD,
    permission: 'workspace',
    params: VideoStudioCheckCompositionParams,
    handler: async ({ projectId }, context) => {
      const { directory, project } = await requireProject(context, projectId)
      const manager = await openVideoStudioJobManager(directory)
      return manager.runCheck(project)
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_START_RENDER_METHOD,
    permission: 'workspace',
    params: VideoStudioStartRenderParams,
    handler: async ({ projectId, quality }, context) => {
      const { directory, project } = await requireProject(context, projectId)
      const manager = await openVideoStudioJobManager(directory)
      return { job: await manager.startRender(project, quality) }
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_CANCEL_RENDER_METHOD,
    permission: 'workspace',
    params: VideoStudioCancelRenderParams,
    handler: async ({ projectId }, context) => {
      const directory = profileDirectory(context)
      const manager = await openVideoStudioJobManager(directory)
      return { job: await manager.cancelProjectWork(projectId) }
    }
  }),
  defineStreamingMethod({
    name: VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD,
    permission: 'workspace',
    params: VideoStudioSubscribeJobsParams,
    handler: async (params, context, emit) => {
      const manager = await openVideoStudioJobManager(profileDirectory(context))
      const frame = context.requestId ? `:${context.requestId}` : ''
      const subscriptionId = `videoStudio:jobs:${context.connectionId ?? 'local'}${frame}`
      let dispose = (): void => {}
      const stream = bindRpcSubscriptionStream(context, subscriptionId, () => dispose())
      if (stream.isClosed()) {
        return
      }
      dispose = manager.subscribe(() => {
        if (!stream.isClosed()) {
          emit(manager.listSnapshots(params?.projectId))
        }
      })
      emit(manager.listSnapshots(params?.projectId))
      if (stream.isClosed()) {
        dispose()
      }
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_START_PREVIEW_METHOD,
    permission: 'workspace',
    params: VideoStudioStartPreviewParams,
    handler: async ({ projectId }, context) => {
      const { directory, project } = await requireProject(context, projectId)
      const manager = await openVideoStudioJobManager(directory)
      return manager.startPreview(project)
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_STOP_PREVIEW_METHOD,
    permission: 'workspace',
    params: VideoStudioStopPreviewParams,
    handler: async ({ projectId }, context) => {
      const manager = await openVideoStudioJobManager(profileDirectory(context))
      return manager.stopPreview(projectId)
    }
  }),
  defineMethod({
    name: VIDEO_STUDIO_READ_RENDER_OUTPUT_CHUNK_METHOD,
    permission: 'workspace',
    params: VideoStudioReadRenderOutputChunkParams,
    handler: async ({ projectId, renderId, offset, maxBytes }, context) =>
      readRenderChunk(profileDirectory(context), projectId, renderId, offset, maxBytes)
  })
]
