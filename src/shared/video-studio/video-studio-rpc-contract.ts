import { z } from 'zod'
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

export const VIDEO_STUDIO_PROBE_ENGINE_METHOD = 'videoStudio.probeEngine'
export const VIDEO_STUDIO_GET_COMPOSITION_STATE_METHOD = 'videoStudio.getCompositionState'
export const VIDEO_STUDIO_SCAFFOLD_COMPOSITION_METHOD = 'videoStudio.scaffoldComposition'
export const VIDEO_STUDIO_CHECK_COMPOSITION_METHOD = 'videoStudio.checkComposition'
export const VIDEO_STUDIO_START_PREVIEW_METHOD = 'videoStudio.startPreview'
export const VIDEO_STUDIO_STOP_PREVIEW_METHOD = 'videoStudio.stopPreview'
export const VIDEO_STUDIO_GET_PREVIEW_STATE_METHOD = 'videoStudio.getPreviewState'
export const VIDEO_STUDIO_START_RENDER_METHOD = 'videoStudio.startRender'
export const VIDEO_STUDIO_ABORT_RENDER_METHOD = 'videoStudio.abortRender'
export const VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD = 'videoStudio.subscribeJobs'
export const VIDEO_STUDIO_READ_RENDER_OUTPUT_CHUNK_METHOD = 'videoStudio.readRenderOutputChunk'

// ─── CRUD params/results (unchanged shape; engine/fps now part of Fields) ────

export const VideoStudioListProjectsParams = z.strictObject({})
export const VideoStudioCreateProjectParams = VideoStudioProjectFields.strict()
export const VideoStudioUpdateProjectParams = z.strictObject({
  id: VideoStudioProjectId,
  // engine and fps ARE mutable; id, createdAt, renders are NOT
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

// ─── Engine status ────────────────────────────────────────────────────────────

export const VideoStudioEngineStatusSchema = z.object({
  engine: VideoStudioEngineSchema,
  available: z.boolean(),
  /** Short human-readable status line. */
  status: z.string(),
  /** Detailed diagnostic text (multi-line). */
  details: z.string().optional(),
  /** e.g. '1.4.2' */
  version: z.string().optional()
})
export type VideoStudioEngineStatus = z.infer<typeof VideoStudioEngineStatusSchema>

export const VideoStudioProbeEngineParams = z.strictObject({
  id: VideoStudioProjectId
})
export const VideoStudioProbeEngineResult = VideoStudioEngineStatusSchema

// ─── Composition state ────────────────────────────────────────────────────────

export const VideoStudioCompositionStateSchema = z.object({
  /** Whether the composition directory exists on disk. */
  exists: z.boolean(),
  /** Whether index.html is present. */
  hasIndexHtml: z.boolean(),
  /** Whether hyperframes.json is present. */
  hasConfigFile: z.boolean()
})
export type VideoStudioCompositionState = z.infer<typeof VideoStudioCompositionStateSchema>

export const VideoStudioGetCompositionStateParams = z.strictObject({ id: VideoStudioProjectId })
export const VideoStudioGetCompositionStateResult = VideoStudioCompositionStateSchema

// ─── Scaffold ────────────────────────────────────────────────────────────────

export const VideoStudioScaffoldCompositionParams = z.strictObject({
  id: VideoStudioProjectId
})
export const VideoStudioScaffoldCompositionResult = z.object({
  projectDir: z.string(),
  /** Number of files written (0 means already existed). */
  filesWritten: z.number().int().nonnegative()
})

// ─── Check ───────────────────────────────────────────────────────────────────

export const VideoStudioCheckResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'info']),
      message: z.string(),
      file: z.string().optional(),
      line: z.number().int().optional()
    })
  ),
  durationMs: z.number().optional()
})
export type VideoStudioCheckResult = z.infer<typeof VideoStudioCheckResultSchema>

export const VideoStudioCheckCompositionParams = z.strictObject({ id: VideoStudioProjectId })
export const VideoStudioCheckCompositionResult = VideoStudioCheckResultSchema

// ─── Preview ─────────────────────────────────────────────────────────────────

export const VideoStudioPreviewStateSchema = z.object({
  running: z.boolean(),
  port: z.number().int().optional(),
  url: z.string().optional()
})
export type VideoStudioPreviewState = z.infer<typeof VideoStudioPreviewStateSchema>

export const VideoStudioStartPreviewParams = z.strictObject({ id: VideoStudioProjectId })
export const VideoStudioStartPreviewResult = VideoStudioPreviewStateSchema

export const VideoStudioStopPreviewParams = z.strictObject({ id: VideoStudioProjectId })
export const VideoStudioStopPreviewResult = z.object({ stopped: z.boolean() })

export const VideoStudioGetPreviewStateParams = z.strictObject({ id: VideoStudioProjectId })
export const VideoStudioGetPreviewStateResult = VideoStudioPreviewStateSchema

// ─── Render ───────────────────────────────────────────────────────────────────

export const VideoStudioStartRenderParams = z.strictObject({
  id: VideoStudioProjectId,
  quality: VideoStudioRenderQualitySchema.default('standard')
})
export const VideoStudioStartRenderResult = z.object({
  renderId: z.string()
})

export const VideoStudioAbortRenderParams = z.strictObject({ id: VideoStudioProjectId })
export const VideoStudioAbortRenderResult = z.object({ aborted: z.boolean() })

// ─── Job snapshot / streaming ─────────────────────────────────────────────────

export const VideoStudioRenderJobSnapshotSchema = z.object({
  projectId: VideoStudioProjectId,
  renderId: z.string(),
  phase: z.enum(['pending', 'running', 'done', 'failed', 'aborted']),
  progressPercent: z.number().min(0).max(100).optional(),
  logLines: z.array(z.string()),
  record: VideoStudioRenderRecordSchema.optional()
})
export type VideoStudioRenderJobSnapshot = z.infer<typeof VideoStudioRenderJobSnapshotSchema>

export const VideoStudioJobsEventSchema = z.object({
  projectId: VideoStudioProjectId,
  snapshot: VideoStudioRenderJobSnapshotSchema.optional()
})
export type VideoStudioJobsEvent = z.infer<typeof VideoStudioJobsEventSchema>

export const VideoStudioSubscribeJobsParams = z.strictObject({ id: VideoStudioProjectId })

// ─── Output chunk ─────────────────────────────────────────────────────────────

export const VideoStudioReadRenderOutputChunkParams = z.strictObject({
  id: VideoStudioProjectId,
  renderId: z.string(),
  byteOffset: z.number().int().nonnegative().default(0)
})
export const VideoStudioReadRenderOutputChunkResult = z.object({
  /** Base-64 encoded binary chunk (max 512 KiB). */
  chunk: z.string(),
  totalBytes: z.number().int().nonnegative(),
  done: z.boolean()
})
export type VideoStudioReadRenderOutputChunk = z.infer<
  typeof VideoStudioReadRenderOutputChunkResult
>

// ─── TypeScript exports ───────────────────────────────────────────────────────

export type VideoStudioListProjectsParams = z.infer<typeof VideoStudioListProjectsParams>
export type VideoStudioCreateProjectParams = z.infer<typeof VideoStudioCreateProjectParams>
export type VideoStudioUpdateProjectParams = z.infer<typeof VideoStudioUpdateProjectParams>
export type VideoStudioDeleteProjectParams = z.infer<typeof VideoStudioDeleteProjectParams>
export type VideoStudioListProjectsResult = z.infer<typeof VideoStudioListProjectsResult>
export type VideoStudioCreateProjectResult = z.infer<typeof VideoStudioCreateProjectResult>
export type VideoStudioUpdateProjectResult = z.infer<typeof VideoStudioUpdateProjectResult>
export type VideoStudioDeleteProjectResult = z.infer<typeof VideoStudioDeleteProjectResult>
export type VideoStudioProbeEngineParams = z.infer<typeof VideoStudioProbeEngineParams>
export type VideoStudioProbeEngineResult = z.infer<typeof VideoStudioProbeEngineResult>
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
export type VideoStudioCheckCompositionParams = z.infer<typeof VideoStudioCheckCompositionParams>
export type VideoStudioCheckCompositionResult = z.infer<typeof VideoStudioCheckCompositionResult>
export type VideoStudioStartPreviewParams = z.infer<typeof VideoStudioStartPreviewParams>
export type VideoStudioStartPreviewResult = z.infer<typeof VideoStudioStartPreviewResult>
export type VideoStudioStopPreviewParams = z.infer<typeof VideoStudioStopPreviewParams>
export type VideoStudioStopPreviewResult = z.infer<typeof VideoStudioStopPreviewResult>
export type VideoStudioGetPreviewStateParams = z.infer<typeof VideoStudioGetPreviewStateParams>
export type VideoStudioGetPreviewStateResult = z.infer<typeof VideoStudioGetPreviewStateResult>
export type VideoStudioStartRenderParams = z.infer<typeof VideoStudioStartRenderParams>
export type VideoStudioStartRenderResult = z.infer<typeof VideoStudioStartRenderResult>
export type VideoStudioAbortRenderParams = z.infer<typeof VideoStudioAbortRenderParams>
export type VideoStudioAbortRenderResult = z.infer<typeof VideoStudioAbortRenderResult>
export type VideoStudioSubscribeJobsParams = z.infer<typeof VideoStudioSubscribeJobsParams>
export type VideoStudioReadRenderOutputChunkParams = z.infer<
  typeof VideoStudioReadRenderOutputChunkParams
>
export type VideoStudioReadRenderOutputChunkResult = z.infer<
  typeof VideoStudioReadRenderOutputChunkResult
>
