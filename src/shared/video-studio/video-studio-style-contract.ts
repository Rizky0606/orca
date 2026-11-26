import * as z from 'zod'

export const StyleIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (value) => !/[\\/\0]/.test(value) && !value.includes('..') && value !== '.',
    'Invalid style id'
  )

export const StyleProfileTierSchema = z.enum(['built-in', 'library', 'snapshot'])
export type StyleProfileTier = z.infer<typeof StyleProfileTierSchema>

export const StyleProfileProvenanceSchema = z.object({
  sourceStyleId: StyleIdSchema,
  sourceTier: z.enum(['built-in', 'library']),
  sourceVersion: z.number().int().positive(),
  appliedAt: z.number().nonnegative()
})
export type StyleProfileProvenance = z.infer<typeof StyleProfileProvenanceSchema>

export const StyleVisualPaletteSchema = z.object({
  background: z.string().trim().min(1),
  surface: z.string().trim().min(1),
  primaryText: z.string().trim().min(1),
  secondaryText: z.string().trim().min(1),
  accentPrimary: z.string().trim().min(1),
  accentSecondary: z.string().trim().min(1).optional(),
  highlight: z.string().trim().min(1).optional(),
  border: z.string().trim().min(1).optional()
})
export type StyleVisualPalette = z.infer<typeof StyleVisualPaletteSchema>

export const StyleVisualSchema = z.object({
  palette: StyleVisualPaletteSchema,
  lighting: z.string().trim().min(1),
  renderingStyle: z.string().trim().min(1),
  cornerRadiusPx: z.number().nonnegative()
})
export type StyleVisual = z.infer<typeof StyleVisualSchema>

export const StyleTypographySchema = z.object({
  displayFont: z.string().trim().min(1),
  bodyFont: z.string().trim().min(1),
  monoFont: z.string().trim().min(1),
  titleWeight: z.number().int().min(100).max(950),
  bodyWeight: z.number().int().min(100).max(950),
  headingScale: z.enum(['compact', 'balanced', 'poster'])
})
export type StyleTypography = z.infer<typeof StyleTypographySchema>

export const StyleCameraSchema = z.object({
  projection: z.enum(['orthographic', '2.5d', '2d-flat', 'perspective']),
  allowedMoves: z.array(z.string().trim().min(1)),
  framingRule: z.string().trim().min(1)
})
export type StyleCamera = z.infer<typeof StyleCameraSchema>

export const StyleMotionSchema = z.object({
  pacing: z.enum(['snappy', 'measured', 'calm', 'energetic']),
  defaultEasing: z.string().trim().min(1),
  transitionVocabulary: z.array(z.string().trim().min(1)),
  motionPresetRefs: z.array(z.string().trim().min(1))
})
export type StyleMotion = z.infer<typeof StyleMotionSchema>

export const StyleEffectsSchema = z.object({
  allowedEffects: z.array(z.string().trim().min(1)),
  bannedEffects: z.array(z.string().trim().min(1))
})
export type StyleEffects = z.infer<typeof StyleEffectsSchema>

export const StyleCompositionSchema = z.object({
  headerZonePercent: z.number().min(0).max(100),
  focalZonePercent: z.number().min(0).max(100),
  actionSafePercent: z.number().min(0).max(100).default(90),
  titleSafePercent: z.number().min(0).max(100).default(80)
})
export type StyleComposition = z.infer<typeof StyleCompositionSchema>

export const StyleSubtitleSchema = z.object({
  mode: z.enum(['word-highlight', 'anchor-rail', 'none']),
  backgroundColor: z.string().trim().min(1),
  textColor: z.string().trim().min(1),
  highlightColor: z.string().trim().min(1),
  position: z.enum(['bottom', 'lower-third'])
})
export type StyleSubtitle = z.infer<typeof StyleSubtitleSchema>

export const StyleOpenMotionPackageRefSchema = z.object({
  packageId: z.string().trim().min(1),
  version: z.string().trim().min(1),
  manifestHash: z.string().trim().min(1).optional()
})
export type StyleOpenMotionPackageRef = z.infer<typeof StyleOpenMotionPackageRefSchema>

export const StyleProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: StyleIdSchema,
  version: z.number().int().positive(),
  snapshotRevision: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string(),
  category: z.string().trim().min(1),
  tier: StyleProfileTierSchema,
  provenance: StyleProfileProvenanceSchema.optional(),
  visual: StyleVisualSchema,
  typography: StyleTypographySchema,
  camera: StyleCameraSchema,
  motion: StyleMotionSchema,
  effects: StyleEffectsSchema,
  composition: StyleCompositionSchema,
  subtitle: StyleSubtitleSchema,
  openMotionPackageRef: StyleOpenMotionPackageRefSchema.optional()
})
export type StyleProfile = z.infer<typeof StyleProfileSchema>

export const StyleProfileTokensPatchSchema = z.strictObject({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  category: z.string().trim().min(1).optional(),
  visual: StyleVisualSchema.omit({ palette: true })
    .partial()
    .extend({
      palette: StyleVisualPaletteSchema.partial().optional()
    })
    .strict()
    .optional(),
  typography: StyleTypographySchema.partial().strict().optional(),
  camera: StyleCameraSchema.partial().strict().optional(),
  motion: StyleMotionSchema.partial().strict().optional(),
  effects: StyleEffectsSchema.partial().strict().optional(),
  composition: StyleCompositionSchema.partial().strict().optional(),
  subtitle: StyleSubtitleSchema.partial().strict().optional(),
  openMotionPackageRef: StyleOpenMotionPackageRefSchema.nullable().optional()
})
export type StyleProfileTokensPatch = z.infer<typeof StyleProfileTokensPatchSchema>
