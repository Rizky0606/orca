import * as z from 'zod'
import {
  AssetComponentSpecSchema,
  AssetConsistencySchema,
  AssetDynamicReferenceWarningSchema,
  AssetFormatSchema,
  AssetIdSchema,
  AssetLicenseSchema,
  AssetProvenanceSchema,
  AssetTypeSchema,
  MasterAssetRecordSchema
} from './video-studio-asset-contract'
import { VideoStudioEngineSchema, VideoStudioProjectId } from './video-studio-project'

// ─── Method name constants ────────────────────────────────────────────────────

export const VIDEO_STUDIO_LIST_LIBRARY_ASSETS_METHOD = 'videoStudio.listLibraryAssets'
export const VIDEO_STUDIO_LIST_PROJECT_ASSETS_METHOD = 'videoStudio.listProjectAssets'
export const VIDEO_STUDIO_REGISTER_OR_IMPORT_ASSET_METHOD = 'videoStudio.registerOrImportAsset'
export const VIDEO_STUDIO_UPDATE_ASSET_METADATA_METHOD = 'videoStudio.updateAssetMetadata'
export const VIDEO_STUDIO_APPLY_LIBRARY_ASSET_TO_PROJECT_METHOD =
  'videoStudio.applyLibraryAssetToProject'
export const VIDEO_STUDIO_SAVE_PROJECT_ASSET_TO_LIBRARY_METHOD =
  'videoStudio.saveProjectAssetToLibrary'
export const VIDEO_STUDIO_REMOVE_PROJECT_ASSET_METHOD = 'videoStudio.removeProjectAsset'
export const VIDEO_STUDIO_DELETE_LIBRARY_ASSET_METHOD = 'videoStudio.deleteLibraryAsset'

const MAX_IMPORT_STATE_BASE64_CHARS = 24 * 1024 * 1024

export const AssetImportStateFileSchema = z
  .strictObject({
    contentBase64: z.string().min(1).max(MAX_IMPORT_STATE_BASE64_CHARS).optional(),
    relativePath: z.string().trim().min(1).optional(),
    format: AssetFormatSchema.optional(),
    label: z.string().optional(),
    notes: z.string().optional(),
    dependencies: z.array(z.string().trim().min(1)).optional()
  })
  .refine(
    (entry) => Boolean(entry.contentBase64 || entry.relativePath),
    'State entry requires contentBase64 or relativePath'
  )

// ─── Master Asset Params & Results ────────────────────────────────────────────

export const VideoStudioListLibraryAssetsParams = z.strictObject({
  type: AssetTypeSchema.optional(),
  tag: z.string().trim().min(1).optional()
})
export const VideoStudioListLibraryAssetsResult = z.object({
  assets: z.array(MasterAssetRecordSchema)
})

export const VideoStudioListProjectAssetsParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioListProjectAssetsResult = z.object({
  assets: z.array(MasterAssetRecordSchema),
  warnings: z.array(AssetDynamicReferenceWarningSchema).default([]),
  invariantErrors: z.record(z.string(), z.array(z.string())).default({}),
  revision: z.string().nullable()
})

export const VideoStudioRegisterOrImportAssetParams = z
  .strictObject({
    scope: z.enum(['project', 'library']),
    projectId: VideoStudioProjectId.optional(),
    expectedRevision: z.string().trim().min(1).optional(),
    asset: z.strictObject({
      id: AssetIdSchema,
      name: z.string().trim().min(1),
      type: AssetTypeSchema,
      format: AssetFormatSchema,
      tags: z.array(z.string().trim().min(1)).default([]),
      defaultState: z.string().trim().min(1),
      stateFiles: z.record(z.string().trim().min(1), AssetImportStateFileSchema),
      components: z.array(AssetComponentSpecSchema).optional(),
      supportedEngines: z.array(VideoStudioEngineSchema).min(1).optional(),
      dependencies: z.array(z.string().trim().min(1)).optional(),
      provenance: AssetProvenanceSchema.optional(),
      license: AssetLicenseSchema.optional(),
      consistency: AssetConsistencySchema.optional()
    })
  })
  .refine(
    (params) => params.scope !== 'project' || Boolean(params.projectId),
    'projectId is required when scope is project'
  )
export const VideoStudioRegisterOrImportAssetResult = z.object({
  asset: MasterAssetRecordSchema,
  revision: z.string()
})

export const VideoStudioUpdateAssetMetadataParams = z.strictObject({
  projectId: VideoStudioProjectId,
  assetId: AssetIdSchema,
  expectedRevision: z.string().trim().min(1).optional(),
  changes: z.strictObject({
    name: z.string().trim().min(1).optional(),
    type: AssetTypeSchema.optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    defaultState: z.string().trim().min(1).optional(),
    upsertStates: z.record(z.string().trim().min(1), AssetImportStateFileSchema).optional(),
    removeStates: z.array(z.string().trim().min(1)).optional(),
    components: z.array(AssetComponentSpecSchema).optional(),
    supportedEngines: z.array(VideoStudioEngineSchema).min(1).optional(),
    dependencies: z.array(z.string().trim().min(1)).optional(),
    provenance: AssetProvenanceSchema.optional(),
    license: AssetLicenseSchema.optional(),
    consistency: AssetConsistencySchema.optional()
  })
})
export const VideoStudioUpdateAssetMetadataResult = z.object({
  asset: MasterAssetRecordSchema,
  revision: z.string()
})

export const VideoStudioApplyLibraryAssetToProjectParams = z.strictObject({
  projectId: VideoStudioProjectId,
  assetId: AssetIdSchema,
  version: z.number().int().positive().optional(),
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioApplyLibraryAssetToProjectResult = z.object({
  asset: MasterAssetRecordSchema,
  revision: z.string()
})

export const VideoStudioSaveProjectAssetToLibraryParams = z.strictObject({
  projectId: VideoStudioProjectId,
  assetId: AssetIdSchema,
  expectedProjectRevision: z.string().trim().min(1).optional()
})
export const VideoStudioSaveProjectAssetToLibraryResult = z.object({
  asset: MasterAssetRecordSchema
})

export const VideoStudioRemoveProjectAssetParams = z.strictObject({
  projectId: VideoStudioProjectId,
  assetId: AssetIdSchema,
  force: z.boolean().default(false),
  forceDeleteFiles: z.boolean().default(false),
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioRemoveProjectAssetResult = z.object({
  removed: z.boolean(),
  deletedFiles: z.array(z.string()).default([]),
  warnings: z.array(AssetDynamicReferenceWarningSchema).default([]),
  revision: z.string()
})

export const VideoStudioDeleteLibraryAssetParams = z.strictObject({
  assetId: AssetIdSchema,
  version: z.number().int().positive().optional()
})
export const VideoStudioDeleteLibraryAssetResult = z.object({
  deleted: z.boolean(),
  assetId: AssetIdSchema
})

// ─── TypeScript exports ───────────────────────────────────────────────────────

export type VideoStudioListLibraryAssetsParams = z.infer<typeof VideoStudioListLibraryAssetsParams>
export type VideoStudioListLibraryAssetsResult = z.infer<typeof VideoStudioListLibraryAssetsResult>
export type VideoStudioListProjectAssetsParams = z.infer<typeof VideoStudioListProjectAssetsParams>
export type VideoStudioListProjectAssetsResult = z.infer<typeof VideoStudioListProjectAssetsResult>
export type VideoStudioRegisterOrImportAssetParams = z.infer<
  typeof VideoStudioRegisterOrImportAssetParams
>
export type VideoStudioRegisterOrImportAssetResult = z.infer<
  typeof VideoStudioRegisterOrImportAssetResult
>
export type VideoStudioUpdateAssetMetadataParams = z.infer<
  typeof VideoStudioUpdateAssetMetadataParams
>
export type VideoStudioUpdateAssetMetadataResult = z.infer<
  typeof VideoStudioUpdateAssetMetadataResult
>
export type VideoStudioApplyLibraryAssetToProjectParams = z.infer<
  typeof VideoStudioApplyLibraryAssetToProjectParams
>
export type VideoStudioApplyLibraryAssetToProjectResult = z.infer<
  typeof VideoStudioApplyLibraryAssetToProjectResult
>
export type VideoStudioSaveProjectAssetToLibraryParams = z.infer<
  typeof VideoStudioSaveProjectAssetToLibraryParams
>
export type VideoStudioSaveProjectAssetToLibraryResult = z.infer<
  typeof VideoStudioSaveProjectAssetToLibraryResult
>
export type VideoStudioRemoveProjectAssetParams = z.infer<
  typeof VideoStudioRemoveProjectAssetParams
>
export type VideoStudioRemoveProjectAssetResult = z.infer<
  typeof VideoStudioRemoveProjectAssetResult
>
export type VideoStudioDeleteLibraryAssetParams = z.infer<
  typeof VideoStudioDeleteLibraryAssetParams
>
export type VideoStudioDeleteLibraryAssetResult = z.infer<
  typeof VideoStudioDeleteLibraryAssetResult
>
