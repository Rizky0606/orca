import type { VideoStudioEngine } from '../../../shared/video-studio/video-studio-project'
import { hyperFramesEngineAdapter } from './hyperframes-engine-adapter'
import { remotionEngineAdapter } from './remotion-engine-adapter'
import type { VideoEngineProcessDeps, VideoRenderEngineAdapter } from './video-render-engine'

const REGISTRY: Readonly<Record<VideoStudioEngine, VideoRenderEngineAdapter>> = {
  hyperframes: hyperFramesEngineAdapter,
  remotion: remotionEngineAdapter
}

export function getVideoRenderEngineAdapter(engine: VideoStudioEngine): VideoRenderEngineAdapter {
  return REGISTRY[engine]
}

export async function probeAllVideoRenderEngines(
  deps: VideoEngineProcessDeps
): Promise<ReturnType<VideoRenderEngineAdapter['probeEnvironment']>[]> {
  return Promise.all(Object.values(REGISTRY).map((adapter) => adapter.probeEnvironment(deps)))
}
