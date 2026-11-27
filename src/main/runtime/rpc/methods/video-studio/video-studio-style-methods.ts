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
  VideoStudioApplyStyleProfileToProjectParams,
  VideoStudioDeleteLibraryStyleProfileParams,
  VideoStudioDuplicateStyleProfileParams,
  VideoStudioGetProjectStyleStateParams,
  VideoStudioGetStyleReconciliationDiffParams,
  VideoStudioListMotionPresetsParams,
  VideoStudioListStyleProfilesParams,
  VideoStudioReconcileProjectStyleParams,
  VideoStudioSaveLibraryStyleProfileParams,
  VideoStudioUpdateProjectStyleTokensParams
} from '../../../../../shared/video-studio/video-studio-style-rpc-contract'
import { DEFAULT_UNIVERSAL_MOTION_REGISTRY } from '../../../../video-studio/motion/builtin-motion-presets'
import { openVideoStudioJobManager } from '../../../../video-studio/video-studio-job-registry'
import { defineMethod } from '../../core'
import { requireProject, runVideoStudioRpc } from './video-studio-rpc-context'

export const VIDEO_STUDIO_STYLE_METHODS = [
  defineMethod({
    name: VIDEO_STUDIO_LIST_STYLE_PROFILES_METHOD,
    permission: 'workspace',
    params: VideoStudioListStyleProfilesParams,
    handler: (_params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        const manager = await openVideoStudioJobManager(directory)
        return manager.styleStore.listStyleProfiles()
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_SAVE_LIBRARY_STYLE_PROFILE_METHOD,
    permission: 'workspace',
    params: VideoStudioSaveLibraryStyleProfileParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        const manager = await openVideoStudioJobManager(directory)
        return manager.styleStore.saveLibraryStyleProfile(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_DUPLICATE_STYLE_PROFILE_METHOD,
    permission: 'workspace',
    params: VideoStudioDuplicateStyleProfileParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        const manager = await openVideoStudioJobManager(directory)
        return manager.styleStore.duplicateStyleProfile(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_DELETE_LIBRARY_STYLE_PROFILE_METHOD,
    permission: 'workspace',
    params: VideoStudioDeleteLibraryStyleProfileParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async (directory) => {
        const manager = await openVideoStudioJobManager(directory)
        return manager.styleStore.deleteLibraryStyleProfile(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_GET_PROJECT_STYLE_STATE_METHOD,
    permission: 'workspace',
    params: VideoStudioGetProjectStyleStateParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.styleStore.getProjectStyleState(params.projectId)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_APPLY_STYLE_PROFILE_TO_PROJECT_METHOD,
    permission: 'workspace',
    params: VideoStudioApplyStyleProfileToProjectParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.styleStore.applyStyleProfileToProject(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_UPDATE_PROJECT_STYLE_TOKENS_METHOD,
    permission: 'workspace',
    params: VideoStudioUpdateProjectStyleTokensParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.styleStore.updateProjectStyleTokens(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_GET_STYLE_RECONCILIATION_DIFF_METHOD,
    permission: 'workspace',
    params: VideoStudioGetStyleReconciliationDiffParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.styleStore.getStyleReconciliationDiff(params.projectId)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_RECONCILE_PROJECT_STYLE_METHOD,
    permission: 'workspace',
    params: VideoStudioReconcileProjectStyleParams,
    handler: (params, context) =>
      runVideoStudioRpc(context, async () => {
        const { manager } = await requireProject(context, params.projectId)
        return manager.styleStore.reconcileProjectStyle(params)
      })
  }),
  defineMethod({
    name: VIDEO_STUDIO_LIST_MOTION_PRESETS_METHOD,
    permission: 'workspace',
    params: VideoStudioListMotionPresetsParams,
    handler: (params) => ({
      presets: DEFAULT_UNIVERSAL_MOTION_REGISTRY.listMotionPresets(params)
    })
  })
]
