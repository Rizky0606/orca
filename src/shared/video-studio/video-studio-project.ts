import * as z from 'zod'

export const VideoStudioProjectId = z.string().refine((value) => value.trim().length > 0)

export const VideoStudioEngineSchema = z.enum(['hyperframes', 'remotion'])
export type VideoStudioEngine = z.infer<typeof VideoStudioEngineSchema>

export const VideoStudioRenderQualitySchema = z.enum(['draft', 'looks', 'delivery'])
export type VideoStudioRenderQuality = z.infer<typeof VideoStudioRenderQualitySchema>

export const VIDEO_STUDIO_FPS_OPTIONS = [24, 30, 60] as const

export const VideoStudioRenderRecordSchema = z.object({
  id: VideoStudioProjectId,
  engine: VideoStudioEngineSchema,
  quality: VideoStudioRenderQualitySchema,
  fileName: z.string().trim().min(1),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().min(12).max(120),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.number()
})
export type VideoStudioRenderRecord = z.infer<typeof VideoStudioRenderRecordSchema>

export const VideoStudioWorkflowStageSchema = z.enum(['research', 'script', 'style', 'production'])
export type VideoStudioWorkflowStage = z.infer<typeof VideoStudioWorkflowStageSchema>

export const VideoStudioProjectFields = z.object({
  title: z.string().trim().min(1),
  prompt: z.string(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  durationSeconds: z.number().int().min(5).max(3600),
  workflowStage: VideoStudioWorkflowStageSchema,
  engine: VideoStudioEngineSchema.default('hyperframes'),
  fps: z.number().int().min(12).max(120).default(30),
  styleProfileId: z.string().trim().min(1).optional()
})

export const VideoStudioProjectSchema = VideoStudioProjectFields.extend({
  id: VideoStudioProjectId,
  renders: z.array(VideoStudioRenderRecordSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type VideoStudioProject = z.infer<typeof VideoStudioProjectSchema>

export function normalizeVideoStudioProject(value: unknown): VideoStudioProject | null {
  const result = VideoStudioProjectSchema.safeParse(value)
  return result.success ? result.data : null
}

export function normalizeVideoStudioCatalog(records: readonly unknown[]): {
  projects: VideoStudioProject[]
  invalidRecords: number
} {
  const projects: VideoStudioProject[] = []
  for (const record of records) {
    const project = normalizeVideoStudioProject(record)
    if (project) {
      projects.push(project)
    }
  }
  return { projects, invalidRecords: records.length - projects.length }
}

export function videoStudioDimensionsForAspectRatio(
  aspectRatio: VideoStudioProject['aspectRatio']
): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 }
    case '1:1':
      return { width: 1080, height: 1080 }
    case '16:9':
      return { width: 1920, height: 1080 }
  }
}
