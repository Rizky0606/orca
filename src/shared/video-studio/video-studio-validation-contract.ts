import * as z from 'zod'
import { VideoStudioEngineSchema } from './video-studio-project'

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

export const ValidationStatusSchema = z.enum([
  'passed',
  'failed',
  'partial',
  'error',
  'unsupported'
])
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>

export const ValidationFindingSchema = VideoStudioCheckFindingSchema.extend({
  section: z.string().optional(),
  time: z.number().optional(),
  selector: z.string().optional(),
  sourceFile: z.string().optional(),
  fixHint: z.string().optional(),
  suggestedColor: z.string().optional()
})
export type ValidationFinding = z.infer<typeof ValidationFindingSchema>

export const ValidationSectionStatusSchema = z.object({
  status: ValidationStatusSchema,
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  infoCount: z.number().int().nonnegative().optional()
})
export type ValidationSectionStatus = z.infer<typeof ValidationSectionStatusSchema>

export const ValidationReportSchema = z.object({
  status: ValidationStatusSchema,
  engine: VideoStudioEngineSchema,
  engineVersion: z.string().optional(),
  inputFingerprint: z.string(),
  revisions: z
    .object({
      compositionSha256: z.string(),
      styleSha256: z.string().optional(),
      assetsSha256: z.string().optional()
    })
    .optional(),
  stale: z.boolean().optional(),
  findings: z.array(ValidationFindingSchema),
  skippedChecks: z.array(z.string()),
  sectionStatuses: z.record(z.string(), ValidationSectionStatusSchema),
  productionGate: z.object({
    allowed: z.boolean(),
    blockingReasons: z.array(z.string())
  }),
  summary: z.string(),
  checkedAt: z.number(),
  durationMs: z.number().optional(),
  browserSkipped: z.boolean().optional(),
  snapshots: z
    .object({
      enabled: z.boolean(),
      files: z.array(z.string()),
      findingFiles: z.array(z.string())
    })
    .optional()
})
export type ValidationReport = z.infer<typeof ValidationReportSchema>

export const VideoEngineCheckResultSchema = VideoStudioCheckResultSchema.extend(
  ValidationReportSchema.shape
)
export type VideoEngineCheckResult = VideoStudioCheckResult & ValidationReport

export const HyperFramesVersionCompatibilitySchema = z.enum(['exact', 'unverified', 'missing'])
export type HyperFramesVersionCompatibility = z.infer<typeof HyperFramesVersionCompatibilitySchema>

export const HyperFramesEnvironmentReportSchema = VideoStudioEngineStatusSchema.extend({
  pinnedVersion: z.string().optional(),
  detectedVersion: z.string().optional(),
  versionCompatibility: HyperFramesVersionCompatibilitySchema.optional(),
  executablePath: z.string().optional(),
  resolutionSource: z.enum(['managed', 'local-bin', 'path', 'npx', 'missing']).optional(),
  missingDetails: z.array(z.string()).optional()
})
export type HyperFramesEnvironmentReport = z.infer<typeof HyperFramesEnvironmentReportSchema>
