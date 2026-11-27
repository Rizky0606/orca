import * as z from 'zod'

export const MotionExecutionKindSchema = z.enum(['executable', 'knowledge-only', 'planned'])
export type MotionExecutionKind = z.infer<typeof MotionExecutionKindSchema>

export const MotionImplementationStatusSchema = z.enum([
  'executable',
  'knowledge-only',
  'planned',
  'unsupported'
])
export type MotionImplementationStatus = z.infer<typeof MotionImplementationStatusSchema>

export const MotionParameterSpecSchema = z.object({
  type: z.enum(['number', 'string', 'boolean', 'enum', 'color']),
  default: z.union([z.number(), z.string(), z.boolean()]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
  description: z.string().optional()
})
export type MotionParameterSpec = z.infer<typeof MotionParameterSpecSchema>

export const MotionImplementationSpecSchema = z.object({
  status: MotionImplementationStatusSchema,
  adapterType: z.string().trim().min(1).optional(),
  notes: z.string().optional()
})
export type MotionImplementationSpec = z.infer<typeof MotionImplementationSpecSchema>

export const MotionPresetMetadataSchema = z
  .object({
    id: z.string().trim().min(1),
    version: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    category: z.string().trim().min(1),
    parameters: z.record(z.string(), MotionParameterSpecSchema).default({}),
    dependencies: z.array(z.string().trim().min(1)).default([]),
    executionKind: MotionExecutionKindSchema,
    implementations: z.record(z.string().trim().min(1), MotionImplementationSpecSchema)
  })
  .superRefine((preset, ctx) => {
    const implEntries = Object.entries(preset.implementations)
    const executableImpls = implEntries.filter(([, impl]) => impl.status === 'executable')

    if (preset.executionKind !== 'executable' && executableImpls.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['implementations'],
        message: `Preset with executionKind "${preset.executionKind}" cannot mark implementations as executable`
      })
    }

    if (preset.executionKind === 'executable' && executableImpls.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['implementations'],
        message: 'Executable preset must include at least one executable engine implementation'
      })
    }
  })

export type MotionPresetMetadata = z.infer<typeof MotionPresetMetadataSchema>

export function isMotionPresetExecutable(preset: MotionPresetMetadata, engine?: string): boolean {
  if (preset.executionKind !== 'executable') {
    return false
  }
  if (engine) {
    return preset.implementations[engine]?.status === 'executable'
  }
  return Object.values(preset.implementations).some((impl) => impl.status === 'executable')
}

export const BUILTIN_MOTION_PRESETS: readonly MotionPresetMetadata[] = [
  {
    id: 'camera.smooth_zoom',
    version: '1.0.0',
    name: 'Smooth Zoom',
    category: 'camera',
    parameters: {
      scale: { type: 'number', default: 1.15, min: 1, max: 3 }
    },
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: {
      hyperframes: { status: 'knowledge-only' },
      remotion: { status: 'planned' }
    }
  },
  {
    id: 'camera.pan',
    version: '1.0.0',
    name: 'Camera Pan',
    category: 'camera',
    parameters: {
      offsetX: { type: 'number', default: 0, min: -1920, max: 1920 },
      offsetY: { type: 'number', default: 0, min: -1080, max: 1080 }
    },
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: {
      hyperframes: { status: 'knowledge-only' },
      remotion: { status: 'planned' }
    }
  },
  {
    id: 'typography.counter_up',
    version: '1.0.0',
    name: 'Numeric Counter Up',
    category: 'typography',
    parameters: {
      from: { type: 'number', default: 0 },
      to: { type: 'number', default: 100 }
    },
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: {
      hyperframes: { status: 'knowledge-only' },
      remotion: { status: 'planned' }
    }
  },
  {
    id: 'typography.word_highlight',
    version: '1.0.0',
    name: 'Word Highlight',
    category: 'typography',
    parameters: {
      highlightColor: { type: 'color', default: '#FACC15' }
    },
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: {
      hyperframes: { status: 'knowledge-only' },
      remotion: { status: 'planned' }
    }
  },
  {
    id: 'object.pop_in',
    version: '1.0.0',
    name: 'Object Pop In',
    category: 'object',
    parameters: {
      overshoot: { type: 'number', default: 1.08, min: 1, max: 1.5 }
    },
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: {
      hyperframes: { status: 'knowledge-only' },
      remotion: { status: 'planned' }
    }
  },
  {
    id: 'diagram.flow_path',
    version: '1.0.0',
    name: 'Diagram Flow Path',
    category: 'diagram',
    parameters: {},
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: {
      hyperframes: { status: 'knowledge-only' },
      remotion: { status: 'planned' }
    }
  },
  {
    id: 'chart.line_draw',
    version: '1.0.0',
    name: 'Chart Line Draw',
    category: 'chart',
    parameters: {},
    dependencies: [],
    executionKind: 'knowledge-only',
    implementations: {
      hyperframes: { status: 'knowledge-only' },
      remotion: { status: 'planned' }
    }
  }
]
