import * as z from 'zod'
import {
  VideoStudioEngineSchema,
  VideoStudioProjectFields,
  VideoStudioProjectId,
  VideoStudioProjectSchema,
  VideoStudioRenderQualitySchema,
  VideoStudioRenderRecordSchema
} from './video-studio-project'

// ─── Method name constants ────────────────────────────────────────────────────

export const VIDEO_STUDIO_LIST_PROJECTS_METHOD = 'videoStudio.listProjects'
export const VIDEO_STUDIO_CREATE_PROJECT_METHOD = 'videoStudio.createProject'
export const VIDEO_STUDIO_UPDATE_PROJECT_METHOD = 'videoStudio.updateProject'
export const VIDEO_STUDIO_DELETE_PROJECT_METHOD = 'videoStudio.deleteProject'

export const VIDEO_STUDIO_PROBE_ENGINES_METHOD = 'videoStudio.probeEngines'
export const VIDEO_STUDIO_GET_COMPOSITION_STATE_METHOD = 'videoStudio.getCompositionState'
export const VIDEO_STUDIO_SCAFFOLD_COMPOSITION_METHOD = 'videoStudio.scaffoldComposition'
export const VIDEO_STUDIO_OPEN_COMPOSITION_WORKSPACE_METHOD = 'videoStudio.openCompositionWorkspace'
export const VIDEO_STUDIO_CHECK_COMPOSITION_METHOD = 'videoStudio.checkComposition'
export const VIDEO_STUDIO_START_RENDER_METHOD = 'videoStudio.startRender'
export const VIDEO_STUDIO_CANCEL_RENDER_METHOD = 'videoStudio.cancelRender'
export const VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD = 'videoStudio.subscribeJobs'
export const VIDEO_STUDIO_START_PREVIEW_METHOD = 'videoStudio.startPreview'
export const VIDEO_STUDIO_STOP_PREVIEW_METHOD = 'videoStudio.stopPreview'
export const VIDEO_STUDIO_READ_RENDER_OUTPUT_CHUNK_METHOD = 'videoStudio.readRenderOutputChunk'

export const VIDEO_STUDIO_MAX_OUTPUT_CHUNK_BYTES = 512 * 1024

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export const VideoStudioListProjectsParams = z.strictObject({})
export const VideoStudioCreateProjectParams = VideoStudioProjectFields.strict()
export const VideoStudioUpdateProjectParams = z.strictObject({
  id: VideoStudioProjectId,
  changes: VideoStudioProjectFields.partial().strict()
})
export const VideoStudioDeleteProjectParams = z.strictObject({ id: VideoStudioProjectId })

export const VideoStudioListProjectsResult = z.object({
  projects: z.array(VideoStudioProjectSchema),
  invalidRecords: z.number().int().nonnegative()
})
export const VideoStudioCreateProjectResult = VideoStudioListProjectsResult.extend({
  projectId: VideoStudioProjectId
})
export const VideoStudioUpdateProjectResult = VideoStudioCreateProjectResult
export const VideoStudioDeleteProjectResult = VideoStudioListProjectsResult

// ─── Engine Probe ─────────────────────────────────────────────────────────────

export const VideoStudioMissingToolSchema = z.enum(['node22', 'hyperframes', 'ffmpeg'])
export type VideoStudioMissingTool = z.infer<typeof VideoStudioMissingToolSchema>

export const VideoStudioEngineStatusSchema = z.object({
  engine: VideoStudioEngineSchema,
  available: z.boolean(),
  status: z.enum(['ready', 'missing-tools', 'planned', 'error']),
  missingTools: z.array(VideoStudioMissingToolSchema).default([]),
  doctorOk: z.boolean().default(false),
  version: z.string().optional(),
  summary: z.string()
})
export type VideoStudioEngineStatus = z.infer<typeof VideoStudioEngineStatusSchema>

export const VideoStudioProbeEnginesParams = z.strictObject({})
export const VideoStudioProbeEnginesResult = z.object({
  engines: z.array(VideoStudioEngineStatusSchema)
})

// ─── Composition State & Workspace ────────────────────────────────────────────

export const VideoStudioCompositionStateSchema = z.object({
  initialized: z.boolean(),
  entryExists: z.boolean(),
  files: z.array(z.string()),
  previewActive: z.boolean(),
  previewUrl: z.string().optional()
})
export type VideoStudioCompositionState = z.infer<typeof VideoStudioCompositionStateSchema>

export const VideoStudioGetCompositionStateParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioGetCompositionStateResult = VideoStudioCompositionStateSchema

export const VideoStudioScaffoldCompositionParams = z.strictObject({
  projectId: VideoStudioProjectId,
  overwrite: z.boolean().optional()
})
export const VideoStudioScaffoldCompositionResult = VideoStudioCompositionStateSchema

export const VideoStudioOpenCompositionWorkspaceParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioOpenCompositionWorkspaceResult = z.object({
  folderWorkspaceId: z.string().min(1),
  worktreeId: z.string().min(1)
})

// ─── Composition Check ────────────────────────────────────────────────────────

export const VideoStudioCheckFindingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string().optional(),
  message: z.string(),
  file: z.string().optional()
})
export type VideoStudioCheckFinding = z.infer<typeof VideoStudioCheckFindingSchema>

export const VideoStudioCheckResultSchema = z.object({
  passed: z.boolean(),
  errors: z.array(VideoStudioCheckFindingSchema),
  warnings: z.array(VideoStudioCheckFindingSchema),
  summary: z.string(),
  checkedAt: z.number(),
  durationMs: z.number().optional()
})
export type VideoStudioCheckResult = z.infer<typeof VideoStudioCheckResultSchema>

export const VideoStudioCheckCompositionParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioCheckCompositionResult = VideoStudioCheckResultSchema

// ─── Preview ──────────────────────────────────────────────────────────────────

export const VideoStudioPreviewStateSchema = z.object({
  active: z.boolean(),
  url: z.string().optional(),
  port: z.number().int().optional()
})
export type VideoStudioPreviewState = z.infer<typeof VideoStudioPreviewStateSchema>

export const VideoStudioStartPreviewParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioStartPreviewResult = VideoStudioPreviewStateSchema

export const VideoStudioStopPreviewParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioStopPreviewResult = VideoStudioPreviewStateSchema

// ─── Render & Jobs ────────────────────────────────────────────────────────────

export const VideoStudioRenderJobStatusSchema = z.enum([
  'queued',
  'checking',
  'rendering',
  'completed',
  'failed',
  'cancelled'
])
export type VideoStudioRenderJobStatus = z.infer<typeof VideoStudioRenderJobStatusSchema>

export const VideoStudioRenderJobSnapshotSchema = z.object({
  projectId: VideoStudioProjectId,
  renderId: z.string().optional(),
  kind: z.enum(['check', 'render']),
  engine: VideoStudioEngineSchema,
  quality: VideoStudioRenderQualitySchema.optional(),
  status: VideoStudioRenderJobStatusSchema,
  progressPercent: z.number().min(0).max(100).optional(),
  stageLabel: z.string().optional(),
  logLines: z.array(z.string()),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  error: z.string().optional(),
  record: VideoStudioRenderRecordSchema.optional(),
  checkResult: VideoStudioCheckResultSchema.optional()
})
export type VideoStudioRenderJobSnapshot = z.infer<typeof VideoStudioRenderJobSnapshotSchema>

export const VideoStudioStartRenderParams = z.strictObject({
  projectId: VideoStudioProjectId,
  quality: VideoStudioRenderQualitySchema.default('looks')
})
export const VideoStudioStartRenderResult = z.object({
  job: VideoStudioRenderJobSnapshotSchema
})

export const VideoStudioCancelRenderParams = z.strictObject({
  projectId: VideoStudioProjectId
})
export const VideoStudioCancelRenderResult = z.object({
  job: VideoStudioRenderJobSnapshotSchema.nullable()
})

export const VideoStudioSubscribeJobsParams = z.strictObject({
  projectId: VideoStudioProjectId.optional()
})

export const VideoStudioJobsEventSchema = z.object({
  revision: z.number().int().nonnegative(),
  engines: z.array(VideoStudioEngineStatusSchema).optional(),
  jobs: z.array(VideoStudioRenderJobSnapshotSchema),
  previews: z.record(z.string(), VideoStudioPreviewStateSchema).default({})
})
export type VideoStudioJobsEvent = z.infer<typeof VideoStudioJobsEventSchema>

// ─── Bounded MP4 Chunk Streaming ──────────────────────────────────────────────

export const VideoStudioReadRenderOutputChunkParams = z.strictObject({
  projectId: VideoStudioProjectId,
  renderId: VideoStudioProjectId,
  offset: z.number().int().nonnegative(),
  maxBytes: z
    .number()
    .int()
    .min(1)
    .max(VIDEO_STUDIO_MAX_OUTPUT_CHUNK_BYTES)
    .default(256 * 1024)
})

export const VideoStudioReadRenderOutputChunkResult = z.object({
  dataBase64: z.string(),
  totalBytes: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative(),
  eof: z.boolean(),
  mimeType: z.literal('video/mp4')
})

// ─── TypeScript exports ───────────────────────────────────────────────────────

export type VideoStudioListProjectsParams = z.infer<typeof VideoStudioListProjectsParams>
export type VideoStudioCreateProjectParams = z.infer<typeof VideoStudioCreateProjectParams>
export type VideoStudioUpdateProjectParams = z.infer<typeof VideoStudioUpdateProjectParams>
export type VideoStudioDeleteProjectParams = z.infer<typeof VideoStudioDeleteProjectParams>
export type VideoStudioListProjectsResult = z.infer<typeof VideoStudioListProjectsResult>
export type VideoStudioCreateProjectResult = z.infer<typeof VideoStudioCreateProjectResult>
export type VideoStudioUpdateProjectResult = z.infer<typeof VideoStudioUpdateProjectResult>
export type VideoStudioDeleteProjectResult = z.infer<typeof VideoStudioDeleteProjectResult>
export type VideoStudioProbeEnginesParams = z.infer<typeof VideoStudioProbeEnginesParams>
export type VideoStudioProbeEnginesResult = z.infer<typeof VideoStudioProbeEnginesResult>
export type VideoStudioGetCompositionStateParams = z.infer<
  typeof VideoStudioGetCompositionStateParams
>
export type VideoStudioGetCompositionStateResult = z.infer<
  typeof VideoStudioGetCompositionStateResult
>
export type VideoStudioScaffoldCompositionParams = z.infer<
  typeof VideoStudioScaffoldCompositionParams
>
export type VideoStudioScaffoldCompositionResult = z.infer<
  typeof VideoStudioScaffoldCompositionResult
>
export type VideoStudioOpenCompositionWorkspaceParams = z.infer<
  typeof VideoStudioOpenCompositionWorkspaceParams
>
export type VideoStudioOpenCompositionWorkspaceResult = z.infer<
  typeof VideoStudioOpenCompositionWorkspaceResult
>
export type VideoStudioCheckCompositionParams = z.infer<typeof VideoStudioCheckCompositionParams>
export type VideoStudioCheckCompositionResult = z.infer<typeof VideoStudioCheckCompositionResult>
export type VideoStudioStartPreviewParams = z.infer<typeof VideoStudioStartPreviewParams>
export type VideoStudioStartPreviewResult = z.infer<typeof VideoStudioStartPreviewResult>
export type VideoStudioStopPreviewParams = z.infer<typeof VideoStudioStopPreviewParams>
export type VideoStudioStopPreviewResult = z.infer<typeof VideoStudioStopPreviewResult>
export type VideoStudioStartRenderParams = z.infer<typeof VideoStudioStartRenderParams>
export type VideoStudioStartRenderResult = z.infer<typeof VideoStudioStartRenderResult>
export type VideoStudioCancelRenderParams = z.infer<typeof VideoStudioCancelRenderParams>
export type VideoStudioCancelRenderResult = z.infer<typeof VideoStudioCancelRenderResult>
export type VideoStudioSubscribeJobsParams = z.infer<typeof VideoStudioSubscribeJobsParams>
export type VideoStudioReadRenderOutputChunkParams = z.infer<
  typeof VideoStudioReadRenderOutputChunkParams
>
export type VideoStudioReadRenderOutputChunkResult = z.infer<
  typeof VideoStudioReadRenderOutputChunkResult
>
