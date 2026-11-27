import type { MasterAssetRecord } from '../../../../shared/video-studio/video-studio-asset-contract'
import type {
  VideoStudioApproveProjectExecutionParams,
  VideoStudioGetProjectDocumentsResult
} from '../../../../shared/video-studio/video-studio-document-rpc-contract'
import type { MotionPresetMetadata } from '../../../../shared/video-studio/motion-registry-contract'
import type { VideoStudioListProjectAssetsResult } from '../../../../shared/video-studio/video-studio-asset-rpc-contract'
import type { VideoStudioEngine } from '../../../../shared/video-studio/video-studio-project'
import type { SceneStatus } from '../../../../shared/video-studio/video-studio-storyboard-contract'
import type {
  StyleProfile,
  StyleProfileTokensPatch
} from '../../../../shared/video-studio/video-studio-style-contract'
import type {
  VideoStudioGetProjectStyleStateResult,
  VideoStudioGetStyleReconciliationDiffResult
} from '../../../../shared/video-studio/video-studio-style-rpc-contract'

export type VideoStudioInspectorController = {
  documents: VideoStudioGetProjectDocumentsResult | null
  styleState: VideoStudioGetProjectStyleStateResult | null
  styleDiff: VideoStudioGetStyleReconciliationDiffResult | null
  libraryStyles: StyleProfile[]
  motionPresets: MotionPresetMetadata[]
  projectAssets: VideoStudioListProjectAssetsResult | null
  libraryAssets: MasterAssetRecord[]
  busyAction: string | null
  error: string | null
  externalChangedPaths: string[]
  dismissExternalChanges: () => void
  reloadAll: () => void
  updateBrief: (params: {
    frontmatter?: Record<string, unknown>
    briefMarkdown?: string
  }) => Promise<boolean>
  updateScript: (scriptMarkdown: string) => Promise<boolean>
  upsertSource: (source: {
    id?: string
    url: string
    title: string
    verificationStatus: 'verified' | 'unverified' | 'assumed'
  }) => Promise<boolean>
  deleteSource: (sourceId: string) => Promise<boolean>
  addFrame: (frame: {
    title: string
    duration: string
    narrativeRole?: string
    camera?: string
    transitionIn?: string
    voiceover?: string
    engine?: VideoStudioEngine
    assets?: string[]
    motionPresets?: string[]
  }) => Promise<boolean>
  patchFrame: (
    sceneId: string,
    patch: {
      title?: string
      status?: SceneStatus
      duration?: string
      voiceover?: string
      camera?: string
      narrativeRole?: string
    }
  ) => Promise<boolean>
  deleteFrame: (sceneId: string) => Promise<boolean>
  reorderFrames: (sceneIds: string[]) => Promise<boolean>
  applyStyle: (styleId: string) => Promise<boolean>
  updateStyleTokens: (tokens: StyleProfileTokensPatch) => Promise<boolean>
  duplicateStyle: (sourceStyleId: string, newStyleId: string, name?: string) => Promise<boolean>
  saveLibraryStyle: (profile: StyleProfile) => Promise<boolean>
  reconcileStyle: (
    mode: 'import-from-markdown' | 'reapply-json',
    sourceFile?: 'frame.md' | 'DESIGN.md' | 'MOTION.md'
  ) => Promise<boolean>
  registerAsset: (params: {
    id: string
    name: string
    defaultState: string
    svgContent: string
  }) => Promise<boolean>
  applyLibraryAsset: (assetId: string, version?: number) => Promise<boolean>
  saveAssetToLibrary: (assetId: string) => Promise<boolean>
  removeProjectAsset: (
    assetId: string,
    options?: { force?: boolean; forceDeleteFiles?: boolean }
  ) => Promise<{ removed: boolean; hasWarnings: boolean }>
  approveExecution: (
    trustState: VideoStudioApproveProjectExecutionParams['trustState'],
    fallbackFingerprint?: string
  ) => Promise<boolean>
}
