import type {
  VideoStudioProject,
  VideoStudioRenderRecord
} from '../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioCompositionState,
  VideoStudioEngineStatus
} from '../../../shared/video-studio/video-studio-rpc-contract'
import type {
  VideoEngineProcessDeps,
  VideoRenderEngineAdapter,
  VideoRenderProgressUpdate,
  VideoRenderRequest,
  VideoStudioPreviewHandle
} from './video-render-engine'

/** Reserved Phase 6 Remotion engine slot; refuses execution cleanly without mock outputs. */
export const remotionEngineAdapter: VideoRenderEngineAdapter = {
  id: 'remotion',

  async probeEnvironment(_deps: VideoEngineProcessDeps): Promise<VideoStudioEngineStatus> {
    return {
      engine: 'remotion',
      available: false,
      status: 'planned',
      missingTools: [],
      doctorOk: false,
      summary: 'Remotion adapter is reserved for Phase 6.'
    }
  },

  async scaffoldProject(
    _projectDir: string,
    _project: VideoStudioProject
  ): Promise<VideoStudioCompositionState> {
    throw new Error('video_studio_engine_unavailable')
  },

  async checkProject(
    _projectDir: string,
    _deps: VideoEngineProcessDeps,
    _signal?: AbortSignal
  ): Promise<VideoStudioCheckResult> {
    throw new Error('video_studio_engine_unavailable')
  },

  async startPreview(
    _projectDir: string,
    _deps: VideoEngineProcessDeps,
    _onExit: () => void,
    _signal?: AbortSignal
  ): Promise<VideoStudioPreviewHandle> {
    throw new Error('video_studio_engine_unavailable')
  },

  async renderProject(
    _projectDir: string,
    _request: VideoRenderRequest,
    _deps: VideoEngineProcessDeps,
    _onProgress: (update: VideoRenderProgressUpdate) => void,
    _signal?: AbortSignal
  ): Promise<VideoStudioRenderRecord> {
    throw new Error('video_studio_engine_unavailable')
  }
}
