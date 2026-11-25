import type { VideoStudioEngine } from '../../../shared/video-studio/video-studio-project'
import type { VideoStudioEngineStatus } from '../../../shared/video-studio/video-studio-rpc-contract'
import { createHostVideoEngineDeps } from './host-video-engine-deps'
import { createHyperFramesEngineAdapter } from './hyperframes-engine-adapter'
import { remotionEngineAdapter } from './remotion-engine-adapter'
import type { VideoEngineProcessDeps, VideoRenderEngineAdapter } from './video-render-engine'

const hyperframesAdapter = createHyperFramesEngineAdapter()

const REGISTRY: Readonly<Record<VideoStudioEngine, VideoRenderEngineAdapter>> = {
  hyperframes: hyperframesAdapter,
  remotion: remotionEngineAdapter
}

export function getVideoRenderEngineAdapter(engine: VideoStudioEngine): VideoRenderEngineAdapter {
  return REGISTRY[engine]
}

export async function probeAllVideoRenderEngines(
  deps: VideoEngineProcessDeps = createHostVideoEngineDeps()
): Promise<VideoStudioEngineStatus[]> {
  return Promise.all([
    hyperframesAdapter.probeEnvironment(deps),
    remotionEngineAdapter.probeEnvironment(deps)
  ])
}
