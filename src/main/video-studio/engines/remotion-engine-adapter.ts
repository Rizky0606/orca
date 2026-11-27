import type {
  VideoStudioProject,
  VideoStudioRenderRecord
} from '../../../shared/video-studio/video-studio-project'
import type { VideoStudioCompositionState } from '../../../shared/video-studio/video-studio-rpc-contract'
import type {
  EngineCapabilities,
  HyperFramesEnvironmentReport,
  VideoCheckOptions,
  VideoEngineAdapter,
  VideoEngineCheckResult,
  VideoEngineProcessDeps,
  VideoPreviewStartOptions,
  VideoRenderProgressUpdate,
  VideoRenderRequest,
  VideoStudioPreviewHandle
} from './video-render-engine'

const REMOTION_CAPABILITIES: EngineCapabilities = {
  supportsPartialRender: false,
  supportsPreviewServer: false,
  supportsStructuredCheck: false,
  supportsFrameSeeking: false,
  supportsTransparentOutput: false,
  supportsImageSequence: false,
  supportsParametricComposition: false,
  supportsAudio: false,
  supportedFormats: [],
  supportedAssetTypes: []
}

/** Reserved Phase 6 Remotion engine slot; refuses execution cleanly without mock outputs. */
export const remotionEngineAdapter: VideoEngineAdapter = {
  id: 'remotion',
  targetVersion: 'planned',
  capabilities: () => REMOTION_CAPABILITIES,

  async probeEnvironment(_deps: VideoEngineProcessDeps): Promise<HyperFramesEnvironmentReport> {
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
    _signalOrOptions?: AbortSignal | VideoCheckOptions
  ): Promise<VideoEngineCheckResult> {
    const reason = 'Remotion runtime is scheduled for Phase 06.'
    return {
      passed: false,
      status: 'unsupported',
      engine: 'remotion',
      inputFingerprint: '',
      findings: [],
      errors: [],
      warnings: [],
      skippedChecks: [],
      sectionStatuses: {},
      productionGate: {
        allowed: false,
        blockingReasons: [reason]
      },
      summary: reason,
      checkedAt: Date.now()
    }
  },

  async startPreview(
    _projectDir: string,
    _deps: VideoEngineProcessDeps,
    _onExit: () => void,
    _signalOrOptions?: AbortSignal | VideoPreviewStartOptions
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
