import * as z from 'zod'
import { VideoStudioEngineSchema, VideoStudioProjectId } from './video-studio-project'
import {
  ProjectExecutionTrustStateSchema,
  SceneDurationSchema,
  SceneIdSchema,
  SceneSpecSchema,
  SceneStatusSchema,
  StoryboardDocumentSchema,
  VideoStudioHttpUrlSchema,
  VideoStudioResearchSourceOriginSchema,
  VideoStudioResearchSourceSchema,
  VideoStudioVerificationStatusSchema
} from './video-studio-storyboard-contract'

// ─── Method name constants ────────────────────────────────────────────────────

export const VIDEO_STUDIO_GET_PROJECT_DOCUMENTS_METHOD = 'videoStudio.getProjectDocuments'
export const VIDEO_STUDIO_UPDATE_PROJECT_BRIEF_METHOD = 'videoStudio.updateProjectBrief'
export const VIDEO_STUDIO_UPDATE_PROJECT_SCRIPT_METHOD = 'videoStudio.updateProjectScript'
export const VIDEO_STUDIO_UPSERT_RESEARCH_SOURCE_METHOD = 'videoStudio.upsertResearchSource'
export const VIDEO_STUDIO_DELETE_RESEARCH_SOURCE_METHOD = 'videoStudio.deleteResearchSource'
export const VIDEO_STUDIO_APPROVE_PROJECT_EXECUTION_METHOD = 'videoStudio.approveProjectExecution'

export const VIDEO_STUDIO_ADD_STORYBOARD_FRAME_METHOD = 'videoStudio.addStoryboardFrame'
export const VIDEO_STUDIO_PATCH_STORYBOARD_FRAME_METHOD = 'videoStudio.patchStoryboardFrame'
export const VIDEO_STUDIO_DELETE_STORYBOARD_FRAME_METHOD = 'videoStudio.deleteStoryboardFrame'
export const VIDEO_STUDIO_REORDER_STORYBOARD_FRAMES_METHOD = 'videoStudio.reorderStoryboardFrames'

// ─── Document, Research & Execution Approval Schemas ──────────────────────────

export const VideoStudioGetProjectDocumentsParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioGetProjectDocumentsResult = z.object({
  briefMarkdown: z.string(),
  briefFrontmatter: z.record(z.string(), z.unknown()).default({}),
  storyboard: StoryboardDocumentSchema.nullable(),
  storyboardMarkdown: z.string(),
  scriptMarkdown: z.string(),
  researchSources: z.array(VideoStudioResearchSourceSchema),
  researchNotesMarkdown: z.string(),
  revisions: z.record(z.string(), z.string()),
  trustState: ProjectExecutionTrustStateSchema.default('unapproved'),
  approvedInputFingerprint: z.string().optional()
})

export const VideoStudioUpdateProjectBriefParams = z.strictObject({
  projectId: VideoStudioProjectId,
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  briefMarkdown: z.string().optional(),
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioUpdateProjectBriefResult = z.object({
  revision: z.string()
})

export const VideoStudioUpdateProjectScriptParams = z.strictObject({
  projectId: VideoStudioProjectId,
  scriptMarkdown: z.string(),
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioUpdateProjectScriptResult = z.object({
  revision: z.string()
})

export const VideoStudioResearchSourceInputSchema = z.strictObject({
  id: z.string().trim().min(1).max(160).optional(),
  url: VideoStudioHttpUrlSchema,
  title: z.string().trim().min(1).max(400),
  domain: z.string().trim().min(1).max(255).optional(),
  snippet: z.string().max(2000).optional(),
  accessedAt: z.number().nonnegative().optional(),
  origin: VideoStudioResearchSourceOriginSchema,
  verificationStatus: VideoStudioVerificationStatusSchema,
  claimIds: z.array(z.string().trim().min(1)).default([])
})

export const VideoStudioUpsertResearchSourceParams = z.strictObject({
  projectId: VideoStudioProjectId,
  source: VideoStudioResearchSourceInputSchema,
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioUpsertResearchSourceResult = z.object({
  source: VideoStudioResearchSourceSchema,
  revision: z.string()
})

export const VideoStudioDeleteResearchSourceParams = z.strictObject({
  projectId: VideoStudioProjectId,
  sourceId: z.string().trim().min(1).max(160),
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioDeleteResearchSourceResult = z.object({
  deleted: z.boolean(),
  revision: z.string()
})

export const VideoStudioApproveProjectExecutionParams = z.strictObject({
  projectId: VideoStudioProjectId,
  trustState: z.enum(['approved-preview', 'approved-render']),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/i)
})
export const VideoStudioApproveProjectExecutionResult = z.object({
  trustState: ProjectExecutionTrustStateSchema,
  inputFingerprint: z.string(),
  approvedAt: z.number()
})

// ─── Storyboard Frame Schemas ─────────────────────────────────────────────────

export const StoryboardFrameInputSchema = z.strictObject({
  sceneId: SceneIdSchema.optional(),
  title: z.string().trim().min(1),
  status: SceneStatusSchema.default('outline'),
  duration: SceneDurationSchema,
  transitionIn: z.string().trim().min(1).optional(),
  engine: VideoStudioEngineSchema.default('hyperframes'),
  src: z.string().trim().min(1).optional(),
  assets: z.array(z.string().trim().min(1)).default([]),
  motionPresets: z.array(z.string().trim().min(1)).default([]),
  camera: z.string().trim().min(1).optional(),
  narrativeRole: z.string().trim().min(1).optional(),
  voiceover: z.string().optional(),
  notes: z.string().optional(),
  lockedSections: z.array(z.string().trim().min(1)).default([]),
  extra: z.record(z.string(), z.unknown()).default({})
})

export const StoryboardFramePatchSchema = StoryboardFrameInputSchema.omit({ sceneId: true })
  .partial()
  .strict()

export const VideoStudioAddStoryboardFrameParams = z.strictObject({
  projectId: VideoStudioProjectId,
  insertAtIndex: z.number().int().nonnegative().optional(),
  frame: StoryboardFrameInputSchema,
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioAddStoryboardFrameResult = z.object({
  frame: SceneSpecSchema,
  storyboard: StoryboardDocumentSchema,
  revision: z.string()
})

export const VideoStudioPatchStoryboardFrameParams = z.strictObject({
  projectId: VideoStudioProjectId,
  sceneId: SceneIdSchema,
  patch: StoryboardFramePatchSchema,
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioPatchStoryboardFrameResult = z.object({
  frame: SceneSpecSchema,
  storyboard: StoryboardDocumentSchema,
  revision: z.string()
})

export const VideoStudioDeleteStoryboardFrameParams = z.strictObject({
  projectId: VideoStudioProjectId,
  sceneId: SceneIdSchema,
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioDeleteStoryboardFrameResult = z.object({
  deleted: z.boolean(),
  storyboard: StoryboardDocumentSchema,
  revision: z.string()
})

export const VideoStudioReorderStoryboardFramesParams = z.strictObject({
  projectId: VideoStudioProjectId,
  sceneIds: z.array(SceneIdSchema).min(1),
  expectedRevision: z.string().trim().min(1).optional()
})
export const VideoStudioReorderStoryboardFramesResult = z.object({
  storyboard: StoryboardDocumentSchema,
  revision: z.string()
})

// ─── TypeScript exports ───────────────────────────────────────────────────────

export type VideoStudioGetProjectDocumentsParams = z.infer<
  typeof VideoStudioGetProjectDocumentsParams
>
export type VideoStudioGetProjectDocumentsResult = z.infer<
  typeof VideoStudioGetProjectDocumentsResult
>
export type VideoStudioUpdateProjectBriefParams = z.infer<
  typeof VideoStudioUpdateProjectBriefParams
>
export type VideoStudioUpdateProjectBriefResult = z.infer<
  typeof VideoStudioUpdateProjectBriefResult
>
export type VideoStudioUpdateProjectScriptParams = z.infer<
  typeof VideoStudioUpdateProjectScriptParams
>
export type VideoStudioUpdateProjectScriptResult = z.infer<
  typeof VideoStudioUpdateProjectScriptResult
>
export type VideoStudioUpsertResearchSourceParams = z.infer<
  typeof VideoStudioUpsertResearchSourceParams
>
export type VideoStudioUpsertResearchSourceResult = z.infer<
  typeof VideoStudioUpsertResearchSourceResult
>
export type VideoStudioDeleteResearchSourceParams = z.infer<
  typeof VideoStudioDeleteResearchSourceParams
>
export type VideoStudioDeleteResearchSourceResult = z.infer<
  typeof VideoStudioDeleteResearchSourceResult
>
export type VideoStudioApproveProjectExecutionParams = z.infer<
  typeof VideoStudioApproveProjectExecutionParams
>
export type VideoStudioApproveProjectExecutionResult = z.infer<
  typeof VideoStudioApproveProjectExecutionResult
>
export type VideoStudioAddStoryboardFrameParams = z.infer<
  typeof VideoStudioAddStoryboardFrameParams
>
export type VideoStudioAddStoryboardFrameResult = z.infer<
  typeof VideoStudioAddStoryboardFrameResult
>
export type VideoStudioPatchStoryboardFrameParams = z.infer<
  typeof VideoStudioPatchStoryboardFrameParams
>
export type VideoStudioPatchStoryboardFrameResult = z.infer<
  typeof VideoStudioPatchStoryboardFrameResult
>
export type VideoStudioDeleteStoryboardFrameParams = z.infer<
  typeof VideoStudioDeleteStoryboardFrameParams
>
export type VideoStudioDeleteStoryboardFrameResult = z.infer<
  typeof VideoStudioDeleteStoryboardFrameResult
>
export type VideoStudioReorderStoryboardFramesParams = z.infer<
  typeof VideoStudioReorderStoryboardFramesParams
>
export type VideoStudioReorderStoryboardFramesResult = z.infer<
  typeof VideoStudioReorderStoryboardFramesResult
>
