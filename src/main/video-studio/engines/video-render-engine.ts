import type {
  VideoStudioEngine,
  VideoStudioProject,
  VideoStudioRenderQuality,
  VideoStudioRenderRecord
} from '../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCompositionState,
  VideoStudioPreviewState
} from '../../../shared/video-studio/video-studio-rpc-contract'
import type {
  HyperFramesEnvironmentReport,
  HyperFramesVersionCompatibility,
  ValidationFinding,
  ValidationReport,
  ValidationSectionStatus,
  ValidationStatus,
  VideoEngineCheckResult
} from '../../../shared/video-studio/video-studio-validation-contract'

export type {
  HyperFramesEnvironmentReport,
  HyperFramesVersionCompatibility,
  ValidationFinding,
  ValidationReport,
  ValidationSectionStatus,
  ValidationStatus,
  VideoEngineCheckResult
}

export type VideoProcessResult = {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export type VideoPreviewProcessHandle = {
  pid?: number
  stop: () => Promise<void>
  exited: Promise<number | null>
}

export type VideoEngineProcessDeps = {
  hydrateShellPath: (refresh?: boolean) => Promise<void>
  resolveCommand: (program: string) => Promise<string | null>
  allocateLoopbackPort: () => Promise<number>
  runProcess: (spec: {
    program: string
    args: readonly string[]
    cwd?: string
    timeoutMs?: number
    signal?: AbortSignal
  }) => Promise<VideoProcessResult>
  runProcessStreaming: (spec: {
    program: string
    args: readonly string[]
    cwd: string
    timeoutMs?: number
    signal?: AbortSignal
    onOutputLine?: (line: string) => void
  }) => Promise<VideoProcessResult>
  spawnPreviewStream: (spec: {
    program: string
    args: readonly string[]
    cwd: string
    onOutputLine: (line: string) => void
    onExit: (code: number | null) => void
  }) => VideoPreviewProcessHandle
  statFile: (path: string) => Promise<{ size: number } | null>
  removeFile: (path: string) => Promise<void>
}

export type VideoRenderRequest = {
  renderId: string
  fileName: string
  quality: VideoStudioRenderQuality
  project: VideoStudioProject
  startSeconds?: number
  endSeconds?: number
}

export type VideoRenderProgressUpdate = {
  progressPercent?: number
  stageLabel?: string
  logLine?: string
}

export type VideoStudioPreviewHandle = {
  state: VideoStudioPreviewState
  stop: () => Promise<void>
  pid?: number
  projectName?: string
  executablePath?: string
  sessionId?: string
}

export type EngineCapabilities = {
  supportsPartialRender: boolean
  supportsPreviewServer: boolean
  supportsStructuredCheck: boolean
  supportsFrameSeeking: boolean
  supportsTransparentOutput: boolean
  supportsImageSequence: boolean
  supportsParametricComposition: boolean
  supportsAudio: boolean
  supportedFormats: readonly string[]
  supportedAssetTypes: readonly string[]
}

export type VideoCheckOptions = {
  signal?: AbortSignal
  browser?: boolean
}

export type VideoPreviewStartOptions = {
  signal?: AbortSignal
  forceNew?: boolean
  port?: number
}

export type VideoProbeOptions = {
  projectDir?: string
  managedPaths?: readonly string[]
}

export type VideoEngineAdapter = {
  readonly id: VideoStudioEngine
  readonly targetVersion?: string
  capabilities?: () => EngineCapabilities
  probeEnvironment: (
    deps: VideoEngineProcessDeps,
    options?: VideoProbeOptions
  ) => Promise<HyperFramesEnvironmentReport>
  scaffoldProject: (
    projectDir: string,
    project: VideoStudioProject,
    options?: { overwrite?: boolean }
  ) => Promise<VideoStudioCompositionState>
  checkProject: (
    projectDir: string,
    deps: VideoEngineProcessDeps,
    signalOrOptions?: AbortSignal | VideoCheckOptions
  ) => Promise<VideoEngineCheckResult>
  startPreview: (
    projectDir: string,
    deps: VideoEngineProcessDeps,
    onExit: () => void,
    signalOrOptions?: AbortSignal | VideoPreviewStartOptions
  ) => Promise<VideoStudioPreviewHandle>
  renderProject: (
    projectDir: string,
    request: VideoRenderRequest,
    deps: VideoEngineProcessDeps,
    onProgress: (update: VideoRenderProgressUpdate) => void,
    signal?: AbortSignal
  ) => Promise<VideoStudioRenderRecord>
}

export type VideoRenderEngineAdapter = VideoEngineAdapter
