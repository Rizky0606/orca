import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { StyleProfile } from '../../../../shared/video-studio/video-studio-style-contract'
import {
  createVideoStudioDocumentInspectorMethods,
  type InspectorRunner
} from './video-studio-document-inspector-methods'
import {
  applyVideoStudioLibraryAssetToProjectForTarget,
  applyVideoStudioStyleProfileToProjectForTarget,
  duplicateVideoStudioStyleProfileForTarget,
  encodeTextUtf8Base64,
  reconcileVideoStudioProjectStyleForTarget,
  registerOrImportVideoStudioAssetForTarget,
  removeVideoStudioProjectAssetForTarget,
  saveLibraryVideoStudioStyleProfileForTarget,
  saveVideoStudioProjectAssetToLibraryForTarget,
  updateVideoStudioProjectStyleTokensForTarget,
  type InspectorBundleSnapshot
} from './video-studio-inspector-actions'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

type InspectorMethodSlice = Omit<
  VideoStudioInspectorController,
  | keyof InspectorBundleSnapshot
  | 'busyAction'
  | 'error'
  | 'externalChangedPaths'
  | 'dismissExternalChanges'
  | 'reloadAll'
>

export function createVideoStudioInspectorMethods(params: {
  target: RuntimeClientTarget
  pairingRevision: number | undefined
  projectId: string | undefined
  bundle: InspectorBundleSnapshot
  run: InspectorRunner
}): InspectorMethodSlice {
  const { target, pairingRevision, projectId, bundle, run } = params
  const forProject = <T>(
    action: string,
    work: (id: string) => Promise<T>,
    fallback: T
  ): Promise<T> =>
    projectId ? run(action, () => work(projectId), fallback) : Promise.resolve(fallback)

  return {
    ...createVideoStudioDocumentInspectorMethods(params),
    applyStyle: (styleId) =>
      forProject(
        'applyStyle',
        async (id) => {
          await applyVideoStudioStyleProfileToProjectForTarget(
            target,
            { projectId: id, styleId, expectedRevision: bundle.styleState?.revision ?? undefined },
            pairingRevision
          )
          return true
        },
        false
      ),
    updateStyleTokens: (tokens) =>
      forProject(
        'updateStyleTokens',
        async (id) => {
          await updateVideoStudioProjectStyleTokensForTarget(
            target,
            { projectId: id, tokens, expectedRevision: bundle.styleState?.revision ?? undefined },
            pairingRevision
          )
          return true
        },
        false
      ),
    duplicateStyle: (sourceStyleId, newStyleId, name) =>
      run(
        'duplicateStyle',
        async () => {
          await duplicateVideoStudioStyleProfileForTarget(
            target,
            { sourceStyleId, newStyleId, name },
            pairingRevision
          )
          return true
        },
        false
      ),
    saveLibraryStyle: (profile: StyleProfile) =>
      run(
        'saveLibraryStyle',
        async () => {
          await saveLibraryVideoStudioStyleProfileForTarget(target, { profile }, pairingRevision)
          return true
        },
        false
      ),
    reconcileStyle: (mode, sourceFile) =>
      forProject(
        'reconcileStyle',
        async (id) => {
          await reconcileVideoStudioProjectStyleForTarget(
            target,
            {
              projectId: id,
              mode,
              sourceFile,
              expectedRevision: bundle.styleState?.revision ?? undefined
            },
            pairingRevision
          )
          return true
        },
        false
      ),
    registerAsset: (input) =>
      forProject(
        'registerAsset',
        async (id) => {
          await registerOrImportVideoStudioAssetForTarget(
            target,
            {
              scope: 'project',
              projectId: id,
              expectedRevision: bundle.projectAssets?.revision ?? undefined,
              asset: {
                id: input.id,
                name: input.name,
                type: 'object',
                format: 'svg',
                tags: ['custom'],
                defaultState: input.defaultState,
                stateFiles: {
                  [input.defaultState]: { contentBase64: encodeTextUtf8Base64(input.svgContent) }
                }
              }
            },
            pairingRevision
          )
          return true
        },
        false
      ),
    applyLibraryAsset: (assetId, version) =>
      forProject(
        'applyLibraryAsset',
        async (id) => {
          await applyVideoStudioLibraryAssetToProjectForTarget(
            target,
            {
              projectId: id,
              assetId,
              version,
              expectedRevision: bundle.projectAssets?.revision ?? undefined
            },
            pairingRevision
          )
          return true
        },
        false
      ),
    saveAssetToLibrary: (assetId) =>
      forProject(
        'saveAssetToLibrary',
        async (id) => {
          await saveVideoStudioProjectAssetToLibraryForTarget(
            target,
            {
              projectId: id,
              assetId,
              expectedProjectRevision: bundle.projectAssets?.revision ?? undefined
            },
            pairingRevision
          )
          return true
        },
        false
      ),
    removeProjectAsset: (assetId, options) =>
      forProject(
        'removeProjectAsset',
        async (id) => {
          const res = await removeVideoStudioProjectAssetForTarget(
            target,
            {
              projectId: id,
              assetId,
              force: options?.force ?? false,
              forceDeleteFiles: options?.forceDeleteFiles ?? false,
              expectedRevision: bundle.projectAssets?.revision ?? undefined
            },
            pairingRevision
          )
          return { removed: res.removed, hasWarnings: res.warnings.length > 0 }
        },
        { removed: false, hasWarnings: false }
      )
  }
}
