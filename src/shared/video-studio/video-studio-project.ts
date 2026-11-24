import { z } from 'zod'

export const VideoStudioProjectId = z.string().refine((value) => value.trim().length > 0)

export const VideoStudioProjectFields = z.object({
  title: z.string().trim().min(1),
  prompt: z.string(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  durationSeconds: z.number().int().min(5).max(3600),
  workflowStage: z.enum(['research', 'script', 'production'])
})

export const VideoStudioProjectSchema = VideoStudioProjectFields.extend({
  id: VideoStudioProjectId,
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
