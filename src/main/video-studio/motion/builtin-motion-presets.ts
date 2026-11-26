import {
  BUILTIN_MOTION_PRESETS,
  isMotionPresetExecutable,
  MotionPresetMetadataSchema,
  type MotionExecutionKind,
  type MotionImplementationStatus,
  type MotionPresetMetadata
} from '../../../shared/video-studio/motion-registry-contract'
import type { VideoStudioEngine } from '../../../shared/video-studio/video-studio-project'
import type { VideoStudioListMotionPresetsParams } from '../../../shared/video-studio/video-studio-style-rpc-contract'

export type MotionPresetStatusReport = {
  found: boolean
  executionKind?: MotionExecutionKind
  engineStatus?: MotionImplementationStatus
  executable: boolean
}

export type MotionPresetResolutionReport = {
  resolved: MotionPresetMetadata[]
  unknownIds: string[]
  executableIds: string[]
  nonExecutableIds: string[]
}

/**
 * Registry of namespaced motion presets explicitly separating executable adapters
 * from knowledge-only and planned specifications.
 */
export class UniversalMotionRegistry {
  private readonly presets = new Map<string, MotionPresetMetadata>()

  constructor(presets: readonly MotionPresetMetadata[] = BUILTIN_MOTION_PRESETS) {
    for (const preset of presets) {
      const validated = MotionPresetMetadataSchema.parse(preset)
      this.presets.set(validated.id, structuredClone(validated))
    }
  }

  getMotionPreset(id: string): MotionPresetMetadata | null {
    const found = this.presets.get(id)
    return found ? structuredClone(found) : null
  }

  listMotionPresets(filter: VideoStudioListMotionPresetsParams = {}): MotionPresetMetadata[] {
    const out: MotionPresetMetadata[] = []
    for (const preset of this.presets.values()) {
      if (filter.category && preset.category !== filter.category) {
        continue
      }
      if (filter.executableOnly && !isMotionPresetExecutable(preset, filter.engine)) {
        continue
      }
      if (filter.engine && !filter.executableOnly) {
        const impl = preset.implementations[filter.engine]
        if (!impl || impl.status === 'unsupported') {
          continue
        }
      }
      out.push(structuredClone(preset))
    }
    return out
  }

  getPresetStatus(id: string, engine?: VideoStudioEngine): MotionPresetStatusReport {
    const preset = this.presets.get(id)
    if (!preset) {
      return { found: false, executable: false }
    }
    const engineStatus = engine
      ? (preset.implementations[engine]?.status ?? 'unsupported')
      : undefined
    return {
      found: true,
      executionKind: preset.executionKind,
      ...(engineStatus ? { engineStatus } : {}),
      executable: isMotionPresetExecutable(preset, engine)
    }
  }

  resolveMotionPresetRefs(
    ids: readonly string[],
    engine?: VideoStudioEngine
  ): MotionPresetResolutionReport {
    const resolved: MotionPresetMetadata[] = []
    const unknownIds: string[] = []
    const executableIds: string[] = []
    const nonExecutableIds: string[] = []

    for (const id of ids) {
      const preset = this.presets.get(id)
      if (!preset) {
        unknownIds.push(id)
        continue
      }
      resolved.push(structuredClone(preset))
      if (isMotionPresetExecutable(preset, engine)) {
        executableIds.push(id)
      } else {
        nonExecutableIds.push(id)
      }
    }

    return { resolved, unknownIds, executableIds, nonExecutableIds }
  }
}

export const DEFAULT_UNIVERSAL_MOTION_REGISTRY = new UniversalMotionRegistry()
