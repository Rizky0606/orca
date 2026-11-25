import { z } from 'zod'

export const VideoStudioProjectId = z.string().refine((value) => value.trim().length > 0)

export const VideoStudioEngineSchema = z.enum(['hyperframes', 'remotion'])
export type VideoStudioEngine = z.infer<typeof VideoStudioEngineSchema>

export const VideoStudioRenderQualitySchema = z.enum(['draft', 'standard', 'high'])
export type VideoStudioRenderQuality = z.infer<typeof VideoStudioRenderQualitySchema>

export const VideoStudioRenderRecordSchema = z.object({
  id: z.string(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  quality: VideoStudioRenderQualitySchema,
  outputFile: z.string().optional(),
  durationMs: z.number().optional(),
  error: z.string().optional()
})
export type VideoStudioRenderRecord = z.infer<typeof VideoStudioRenderRecordSchema>

export const VideoStudioProjectFields = z.object({
  title: z.string().trim().min(1),
  prompt: z.string(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  durationSeconds: z.number().int().min(5).max(3600),
  workflowStage: z.enum(['research', 'script', 'production']),
  engine: VideoStudioEngineSchema.default('hyperframes'),
  fps: z.number().int().min(12).max(120).default(30)
})

export const VideoStudioProjectSchema = VideoStudioProjectFields.extend({
  id: VideoStudioProjectId,
  createdAt: z.number(),
  updatedAt: z.number(),
  renders: z.array(VideoStudioRenderRecordSchema).default([])
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

const DIMENSIONS: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 }
}

export function videoStudioDimensionsForAspectRatio(
  aspectRatio: VideoStudioProject['aspectRatio']
): { width: number; height: number } {
  return DIMENSIONS[aspectRatio] ?? { width: 1920, height: 1080 }
}
