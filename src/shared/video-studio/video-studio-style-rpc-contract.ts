import * as z from 'zod'
import { MotionPresetMetadataSchema } from './motion-registry-contract'
import { VideoStudioEngineSchema, VideoStudioProjectId } from './video-studio-project'
import {
  StyleIdSchema,
  StyleProfileSchema,
  StyleProfileTokensPatchSchema
} from './video-studio-style-contract'

// ─── Method name constants ────────────────────────────────────────────────────

export const VIDEO_STUDIO_LIST_STYLE_PROFILES_METHOD = 'videoStudio.listStyleProfiles'
export const VIDEO_STUDIO_SAVE_LIBRARY_STYLE_PROFILE_METHOD = 'videoStudio.saveLibraryStyleProfile'
export const VIDEO_STUDIO_DUPLICATE_STYLE_PROFILE_METHOD = 'videoStudio.duplicateStyleProfile'
export const VIDEO_STUDIO_DELETE_LIBRARY_STYLE_PROFILE_METHOD =
  'videoStudio.deleteLibraryStyleProfile'
export const VIDEO_STUDIO_GET_PROJECT_STYLE_STATE_METHOD = 'videoStudio.getProjectStyleState'
export const VIDEO_STUDIO_APPLY_STYLE_PROFILE_TO_PROJECT_METHOD =
  'videoStudio.applyStyleProfileToProject'
export const VIDEO_STUDIO_UPDATE_PROJECT_STYLE_TOKENS_METHOD =
  'videoStudio.updateProjectStyleTokens'
export const VIDEO_STUDIO_GET_STYLE_RECONCILIATION_DIFF_METHOD =
  'videoStudio.getStyleReconciliationDiff'
export const VIDEO_STUDIO_RECONCILE_PROJECT_STYLE_METHOD = 'videoStudio.reconcileProjectStyle'
export const VIDEO_STUDIO_LIST_MOTION_PRESETS_METHOD = 'videoStudio.listMotionPresets'

// ─── Style Profile Params & Results ───────────────────────────────────────────

export const VideoStudioListStyleProfilesParams = z.strictObject({})
export const VideoStudioListStyleProfilesResult = z.object({
  profiles: z.array(StyleProfileSchema)
})

export const VideoStudioSaveLibraryStyleProfileParams = z.strictObject({
  profile: StyleProfileSchema,
  expectedRevision: z.string().trim().min(1).optional(),
  designMarkdown: z.string().optional(),
  frameMarkdown: z.string().optional(),
  motionMarkdown: z.string().optional()
})
export const VideoStudioSaveLibraryStyleProfileResult = z.object({
  profile: StyleProfileSchema,
  revision: z.string()
})

export const VideoStudioDuplicateStyleProfileParams = z.strictObject({
  sourceStyleId: StyleIdSchema,
  newStyleId: StyleIdSchema,
  name: z.string().trim().min(1).optional()
})
export const VideoStudioDuplicateStyleProfileResult = z.object({
  profile: StyleProfileSchema,
  revision: z.string()
})

export const VideoStudioDeleteLibraryStyleProfileParams = z.strictObject({
  styleId: StyleIdSchema,
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioDeleteLibraryStyleProfileResult = z.object({
  deleted: z.boolean(),
  styleId: StyleIdSchema
})

export const VideoStudioGetProjectStyleStateParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioGetProjectStyleStateResult = z.object({
  profile: StyleProfileSchema.nullable(),
  revision: z.string().nullable(),
  markdownDrift: z.boolean(),
  driftedFiles: z.array(z.string()).default([])
})

export const VideoStudioApplyStyleProfileToProjectParams = z.strictObject({
  projectId: VideoStudioProjectId,
  styleId: StyleIdSchema,
  expectedRevision: z.string().trim().min(1).optional(),
  expectedRevisions: z.record(z.string(), z.string()).optional()
})
export const VideoStudioApplyStyleProfileToProjectResult = z.object({
  profile: StyleProfileSchema,
  revision: z.string(),
  filesWritten: z.array(z.string())
})

export const VideoStudioUpdateProjectStyleTokensParams = z.strictObject({
  projectId: VideoStudioProjectId,
  tokens: StyleProfileTokensPatchSchema,
  expectedRevision: z.string().trim().min(1).optional(),
  expectedRevisions: z.record(z.string(), z.string()).optional()
})
export const VideoStudioUpdateProjectStyleTokensResult = z.object({
  profile: StyleProfileSchema,
  revision: z.string()
})

export const VideoStudioStyleDiffEntrySchema = z.object({
  file: z.string(),
  tokenPath: z.string(),
  jsonValue: z.unknown(),
  markdownValue: z.unknown()
})
export type VideoStudioStyleDiffEntry = z.infer<typeof VideoStudioStyleDiffEntrySchema>

export const VideoStudioGetStyleReconciliationDiffParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioGetStyleReconciliationDiffResult = z.object({
  inSync: z.boolean(),
  diffs: z.array(VideoStudioStyleDiffEntrySchema)
})

export const VideoStudioReconcileProjectStyleParams = z.strictObject({
  projectId: VideoStudioProjectId,
  mode: z.enum(['import-from-markdown', 'reapply-json']),
  sourceFile: z.enum(['frame.md', 'DESIGN.md', 'MOTION.md']).optional(),
  expectedRevision: z.string().trim().min(1).optional(),
  expectedRevisions: z.record(z.string(), z.string()).optional()
})
export const VideoStudioReconcileProjectStyleResult = z.object({
  profile: StyleProfileSchema,
  revision: z.string()
})

// ─── Motion Registry Params & Results ─────────────────────────────────────────

export const VideoStudioListMotionPresetsParams = z.strictObject({
  category: z.string().trim().min(1).optional(),
  engine: VideoStudioEngineSchema.optional(),
  executableOnly: z.boolean().optional()
})
export const VideoStudioListMotionPresetsResult = z.object({
  presets: z.array(MotionPresetMetadataSchema)
})

// ─── TypeScript exports ───────────────────────────────────────────────────────

export type VideoStudioListStyleProfilesParams = z.infer<typeof VideoStudioListStyleProfilesParams>
export type VideoStudioListStyleProfilesResult = z.infer<typeof VideoStudioListStyleProfilesResult>
export type VideoStudioSaveLibraryStyleProfileParams = z.infer<
  typeof VideoStudioSaveLibraryStyleProfileParams
>
export type VideoStudioSaveLibraryStyleProfileResult = z.infer<
  typeof VideoStudioSaveLibraryStyleProfileResult
>
export type VideoStudioDuplicateStyleProfileParams = z.infer<
  typeof VideoStudioDuplicateStyleProfileParams
>
export type VideoStudioDuplicateStyleProfileResult = z.infer<
  typeof VideoStudioDuplicateStyleProfileResult
>
export type VideoStudioDeleteLibraryStyleProfileParams = z.infer<
  typeof VideoStudioDeleteLibraryStyleProfileParams
>
export type VideoStudioDeleteLibraryStyleProfileResult = z.infer<
  typeof VideoStudioDeleteLibraryStyleProfileResult
>
export type VideoStudioGetProjectStyleStateParams = z.infer<
  typeof VideoStudioGetProjectStyleStateParams
>
export type VideoStudioGetProjectStyleStateResult = z.infer<
  typeof VideoStudioGetProjectStyleStateResult
>
export type VideoStudioApplyStyleProfileToProjectParams = z.infer<
  typeof VideoStudioApplyStyleProfileToProjectParams
>
export type VideoStudioApplyStyleProfileToProjectResult = z.infer<
  typeof VideoStudioApplyStyleProfileToProjectResult
>
export type VideoStudioUpdateProjectStyleTokensParams = z.infer<
  typeof VideoStudioUpdateProjectStyleTokensParams
>
export type VideoStudioUpdateProjectStyleTokensResult = z.infer<
  typeof VideoStudioUpdateProjectStyleTokensResult
>
export type VideoStudioGetStyleReconciliationDiffParams = z.infer<
  typeof VideoStudioGetStyleReconciliationDiffParams
>
export type VideoStudioGetStyleReconciliationDiffResult = z.infer<
  typeof VideoStudioGetStyleReconciliationDiffResult
>
export type VideoStudioReconcileProjectStyleParams = z.infer<
  typeof VideoStudioReconcileProjectStyleParams
>
export type VideoStudioReconcileProjectStyleResult = z.infer<
  typeof VideoStudioReconcileProjectStyleResult
>
export type VideoStudioListMotionPresetsParams = z.infer<typeof VideoStudioListMotionPresetsParams>
export type VideoStudioListMotionPresetsResult = z.infer<typeof VideoStudioListMotionPresetsResult>
