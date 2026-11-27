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
  VideoStudioAddStoryboardFrameParams,
  VideoStudioApproveProjectExecutionParams,
  VideoStudioDeleteResearchSourceParams,
  VideoStudioDeleteStoryboardFrameParams,
  VideoStudioGetProjectDocumentsParams,
  VideoStudioPatchStoryboardFrameParams,
  VideoStudioReorderStoryboardFramesParams,
  VideoStudioUpdateProjectBriefParams,
  VideoStudioUpdateProjectScriptParams,
  VideoStudioUpsertResearchSourceParams
} from '../../../../../shared/video-studio/video-studio-document-rpc-contract'
import { computeProjectInputFingerprint } from '../../../../video-studio/engines/project-input-fingerprint'
import { resolveVideoStudioProjectDir } from '../../../../video-studio/video-studio-composition-paths'
import { VIDEO_STUDIO_FILE_CONFLICT_ERROR } from '../../../../video-studio/video-studio-tx-journal'
import { defineMethod } from '../../core'
import { requireProject, runVideoStudioRpc } from './video-studio-rpc-context'

export const VIDEO_STUDIO_DOCUMENT_METHODS = [
  defineMethod({
    name: VIDEO_STUDIO_GET_PROJECT_DOCUMENTS_METHOD,
    permission: 'workspace',
    params: VideoStudioGetProjectDocumentsParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.getProjectDocuments(params.projectId)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_UPDATE_PROJECT_BRIEF_METHOD,
    permission: 'workspace',
    params: VideoStudioUpdateProjectBriefParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.updateProjectBrief(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_UPDATE_PROJECT_SCRIPT_METHOD,
    permission: 'workspace',
    params: VideoStudioUpdateProjectScriptParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.updateProjectScript(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_UPSERT_RESEARCH_SOURCE_METHOD,
    permission: 'workspace',
    params: VideoStudioUpsertResearchSourceParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.upsertResearchSource(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_DELETE_RESEARCH_SOURCE_METHOD,
    permission: 'workspace',
    params: VideoStudioDeleteResearchSourceParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.deleteResearchSource(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_APPROVE_PROJECT_EXECUTION_METHOD,
    permission: 'workspace',
    params: VideoStudioApproveProjectExecutionParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        const { manager } = await requireProject(context, params.projectId)
        const projectDir = resolveVideoStudioProjectDir(directory, params.projectId)
        const live = await computeProjectInputFingerprint(projectDir)
        if (live.inputFingerprint.toLowerCase() !== params.inputFingerprint.toLowerCase()) {
          throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
        }
        const record = await manager.trustStore.approveProjectExecution({
          projectId: params.projectId,
          projectDir,
          trustState: params.trustState,
          inputFingerprint: live.inputFingerprint
        })
        return {
          trustState: record.trustState,
          inputFingerprint: record.inputFingerprint,
          approvedAt: record.approvedAt
        }
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_ADD_STORYBOARD_FRAME_METHOD,
    permission: 'workspace',
    params: VideoStudioAddStoryboardFrameParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.addStoryboardFrame(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_PATCH_STORYBOARD_FRAME_METHOD,
    permission: 'workspace',
    params: VideoStudioPatchStoryboardFrameParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.patchStoryboardFrame(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_DELETE_STORYBOARD_FRAME_METHOD,
    permission: 'workspace',
    params: VideoStudioDeleteStoryboardFrameParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.deleteStoryboardFrame(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_REORDER_STORYBOARD_FRAMES_METHOD,
    permission: 'workspace',
    params: VideoStudioReorderStoryboardFramesParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.documents.reorderStoryboardFrames(params)
      })
  })
]
