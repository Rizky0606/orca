import type { VideoStudioEngine } from '../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioEngineStatus,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot,
  VideoStudioStartRenderParams
} from '../../../shared/video-studio/video-studio-rpc-contract'
import type { VideoEngineProcessDeps, VideoRenderEngineAdapter } from './video-render-engine'

const ENGINE: VideoStudioEngine = 'remotion'

export const remotionEngineAdapter: VideoRenderEngineAdapter = {
  engine: ENGINE,

  async probeEnvironment(_deps: VideoEngineProcessDeps): Promise<VideoStudioEngineStatus> {
    return {
      engine: ENGINE,
      available: false,
      status: 'planned'
    }
  },

  async checkComposition(
    _projectDir: string,
    _deps: VideoEngineProcessDeps,
    _signal?: AbortSignal
  ): Promise<VideoStudioCheckResult> {
    throw new Error('video_studio_engine_unavailable')
  },

  async startPreview(
    _projectDir: string,
    _deps: VideoEngineProcessDeps,
    _signal?: AbortSignal
  ): Promise<VideoStudioPreviewState> {
    throw new Error('video_studio_engine_unavailable')
  },

  async renderProject(
    _projectDir: string,
    _outputPath: string,
    _params: Pick<VideoStudioStartRenderParams, 'quality'>,
    _deps: VideoEngineProcessDeps,
    _onProgress: (snapshot: Partial<VideoStudioRenderJobSnapshot>) => void,
    _signal?: AbortSignal
  ): Promise<void> {
    throw new Error('video_studio_engine_unavailable')
  }
}
