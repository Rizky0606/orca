import type { Translate } from '@/i18n/use-translate'
import {
  applyVideoStudioLibraryAssetToProjectForTarget,
  listVideoStudioLibraryAssetsForTarget,
  listVideoStudioProjectAssetsForTarget,
  registerOrImportVideoStudioAssetForTarget,
  removeVideoStudioProjectAssetForTarget,
  saveVideoStudioProjectAssetToLibraryForTarget
} from '@/runtime/video-studio/video-studio-assets-client'
import {
  addVideoStudioStoryboardFrameForTarget,
  approveVideoStudioProjectExecutionForTarget,
  deleteVideoStudioResearchSourceForTarget,
  deleteVideoStudioStoryboardFrameForTarget,
  getVideoStudioProjectDocumentsForTarget,
  patchVideoStudioStoryboardFrameForTarget,
  reorderVideoStudioStoryboardFramesForTarget,
  updateVideoStudioProjectBriefForTarget,
  updateVideoStudioProjectScriptForTarget,
  upsertVideoStudioResearchSourceForTarget
} from '@/runtime/video-studio/video-studio-documents-client'
import {
  applyVideoStudioStyleProfileToProjectForTarget,
  duplicateVideoStudioStyleProfileForTarget,
  getVideoStudioProjectStyleStateForTarget,
  getVideoStudioStyleReconciliationDiffForTarget,
  listVideoStudioMotionPresetsForTarget,
  listVideoStudioStyleProfilesForTarget,
  reconcileVideoStudioProjectStyleForTarget,
  saveLibraryVideoStudioStyleProfileForTarget,
  updateVideoStudioProjectStyleTokensForTarget
} from '@/runtime/video-studio/video-studio-style-client'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { MasterAssetRecord } from '../../../../shared/video-studio/video-studio-asset-contract'
import type { VideoStudioListProjectAssetsResult } from '../../../../shared/video-studio/video-studio-asset-rpc-contract'
import type { VideoStudioGetProjectDocumentsResult } from '../../../../shared/video-studio/video-studio-document-rpc-contract'
import type { MotionPresetMetadata } from '../../../../shared/video-studio/motion-registry-contract'
import type { StyleProfile } from '../../../../shared/video-studio/video-studio-style-contract'
import type {
  VideoStudioGetProjectStyleStateResult,
  VideoStudioGetStyleReconciliationDiffResult
} from '../../../../shared/video-studio/video-studio-style-rpc-contract'
import { mapProductionRpcError, runWithProductionBusy } from './video-studio-production-actions'

export type InspectorBundleSnapshot = {
  documents: VideoStudioGetProjectDocumentsResult | null
  styleState: VideoStudioGetProjectStyleStateResult | null
  styleDiff: VideoStudioGetStyleReconciliationDiffResult | null
  libraryStyles: StyleProfile[]
  motionPresets: MotionPresetMetadata[]
  projectAssets: VideoStudioListProjectAssetsResult | null
  libraryAssets: MasterAssetRecord[]
}

export async function fetchVideoStudioInspectorBundle(
  target: RuntimeClientTarget,
  pairingRevision: number | undefined,
  projectId: string | undefined
): Promise<InspectorBundleSnapshot> {
  const [stylesRes, presetsRes, libraryAssetsRes] = await Promise.all([
    listVideoStudioStyleProfilesForTarget(target, pairingRevision).catch(() => ({ profiles: [] })),
    listVideoStudioMotionPresetsForTarget(target, {}, pairingRevision).catch(() => ({
      presets: []
    })),
    listVideoStudioLibraryAssetsForTarget(target, {}, pairingRevision).catch(() => ({
      assets: []
    }))
  ])
  if (!projectId) {
    return {
      documents: null,
      styleState: null,
      styleDiff: null,
      libraryStyles: stylesRes.profiles,
      motionPresets: presetsRes.presets,
      projectAssets: null,
      libraryAssets: libraryAssetsRes.assets
    }
  }
  const [documents, styleState, projectAssets] = await Promise.all([
    getVideoStudioProjectDocumentsForTarget(target, { projectId }, pairingRevision).catch(
      () => null
    ),
    getVideoStudioProjectStyleStateForTarget(target, { projectId }, pairingRevision).catch(
      () => null
    ),
    listVideoStudioProjectAssetsForTarget(target, { projectId }, pairingRevision).catch(() => null)
  ])
  const styleDiff = styleState?.markdownDrift
    ? await getVideoStudioStyleReconciliationDiffForTarget(
        target,
        { projectId },
        pairingRevision
      ).catch(() => null)
    : { inSync: true, diffs: [] }
  return {
    documents,
    styleState,
    styleDiff,
    libraryStyles: stylesRes.profiles,
    motionPresets: presetsRes.presets,
    projectAssets,
    libraryAssets: libraryAssetsRes.assets
  }
}

export function createInspectorRunner(params: {
  t: Translate
  isMounted: () => boolean
  setBusy: (action: string | null) => void
  setError: (error: string | null) => void
  reload: () => void
}) {
  return async <T>(
    action: string,
    work: () => Promise<T>,
    fallbackValue: T,
    reloadAfter = true
  ): Promise<T> => {
    params.setError(null)
    let result = fallbackValue
    await runWithProductionBusy(params.setBusy, params.isMounted, action, async () => {
      result = await work()
      if (reloadAfter && params.isMounted()) {
        params.reload()
      }
    }).catch((reason: unknown) => {
      if (params.isMounted()) {
        params.setError(mapProductionRpcError(params.t, reason))
      }
    })
    return result
  }
}

export function encodeTextUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export {
  addVideoStudioStoryboardFrameForTarget,
  applyVideoStudioLibraryAssetToProjectForTarget,
  applyVideoStudioStyleProfileToProjectForTarget,
  approveVideoStudioProjectExecutionForTarget,
  deleteVideoStudioResearchSourceForTarget,
  deleteVideoStudioStoryboardFrameForTarget,
  duplicateVideoStudioStyleProfileForTarget,
  patchVideoStudioStoryboardFrameForTarget,
  reconcileVideoStudioProjectStyleForTarget,
  registerOrImportVideoStudioAssetForTarget,
  removeVideoStudioProjectAssetForTarget,
  reorderVideoStudioStoryboardFramesForTarget,
  saveLibraryVideoStudioStyleProfileForTarget,
  saveVideoStudioProjectAssetToLibraryForTarget,
  updateVideoStudioProjectBriefForTarget,
  updateVideoStudioProjectScriptForTarget,
  updateVideoStudioProjectStyleTokensForTarget,
  upsertVideoStudioResearchSourceForTarget
}
