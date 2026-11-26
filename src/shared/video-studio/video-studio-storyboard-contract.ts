import * as z from 'zod'
import { VideoStudioEngineSchema } from './video-studio-project'

export const SceneIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (value) => !/[\\/\0]/.test(value) && !value.includes('..') && value !== '.',
    'Invalid scene id'
  )

export const SceneStatusSchema = z.enum(['outline', 'built', 'animated'])
export type SceneStatus = z.infer<typeof SceneStatusSchema>

export const SceneDurationSchema = z.union([z.string().trim().min(1), z.number().positive()])

export const SceneSpecSchema = z.object({
  sceneId: SceneIdSchema,
  frameNumber: z.number().int().positive(),
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
export type SceneSpec = z.infer<typeof SceneSpecSchema>

export const StoryboardFrontmatterSchema = z.object({
  format: z.string().trim().min(1).optional(),
  duration: SceneDurationSchema.optional(),
  message: z.string().optional(),
  arc: z.string().optional(),
  audience: z.string().optional(),
  styleProfile: z.string().trim().min(1).optional(),
  extra: z.record(z.string(), z.unknown()).optional()
})
export type StoryboardFrontmatter = z.infer<typeof StoryboardFrontmatterSchema>

export const StoryboardLockedSectionSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string()
})
export type StoryboardLockedSection = z.infer<typeof StoryboardLockedSectionSchema>

export const StoryboardDocumentSchema = z.object({
  frontmatter: StoryboardFrontmatterSchema,
  frames: z.array(SceneSpecSchema),
  lockedSections: z.array(StoryboardLockedSectionSchema).default([])
})
export type StoryboardDocument = z.infer<typeof StoryboardDocumentSchema>

export const VideoStudioHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((raw) => {
    try {
      const parsed = new URL(raw)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, 'Source URL must use http or https')

export const VideoStudioResearchSourceOriginSchema = z.enum([
  'general-chat-search',
  'deep-research',
  'manual'
])
export type VideoStudioResearchSourceOrigin = z.infer<typeof VideoStudioResearchSourceOriginSchema>

export const VideoStudioVerificationStatusSchema = z.enum(['verified', 'unverified', 'assumed'])
export type VideoStudioVerificationStatus = z.infer<typeof VideoStudioVerificationStatusSchema>

export const VideoStudioResearchSourceSchema = z.object({
  id: z.string().trim().min(1).max(160),
  url: VideoStudioHttpUrlSchema,
  title: z.string().trim().min(1).max(400),
  domain: z.string().trim().min(1).max(255),
  snippet: z.string().max(2000).optional(),
  accessedAt: z.number().nonnegative(),
  origin: VideoStudioResearchSourceOriginSchema,
  verificationStatus: VideoStudioVerificationStatusSchema,
  claimIds: z.array(z.string().trim().min(1)).default([])
})
export type VideoStudioResearchSource = z.infer<typeof VideoStudioResearchSourceSchema>

export const ProjectExecutionTrustStateSchema = z.enum([
  'unapproved',
  'approved-preview',
  'approved-render'
])
export type ProjectExecutionTrustState = z.infer<typeof ProjectExecutionTrustStateSchema>
