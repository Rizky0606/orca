import type { VideoStudioProject } from '../../shared/video-studio/video-studio-project'
import type { StyleProfile } from '../../shared/video-studio/video-studio-style-contract'
import { buildProjectStyleSnapshot, getBuiltinStylePreset } from './style/builtin-style-presets'

/** Builds the initial 9-block snapshot `StyleProfile` from canonical built-in presets. */
export function buildDefaultStyleProfile(
  project: VideoStudioProject,
  styleProfileId?: string
): StyleProfile {
  const requestedId = styleProfileId ?? project.styleProfileId ?? 'technical-explainer-01'
  const preset =
    getBuiltinStylePreset(requestedId) ?? getBuiltinStylePreset('technical-explainer-01')!
  return buildProjectStyleSnapshot(preset, project.createdAt, 'rev-1')
}
