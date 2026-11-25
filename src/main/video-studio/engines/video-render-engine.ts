import type {
  VideoStudioEngine,
  VideoStudioProject,
  VideoStudioRenderQuality,
  VideoStudioRenderRecord
} from '../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioCompositionState,
  VideoStudioEngineStatus,
  VideoStudioPreviewState
} from '../../../shared/video-studio/video-studio-rpc-contract'

export type VideoProcessResult = {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export type VideoPreviewProcessHandle = {
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
}

export type VideoRenderProgressUpdate = {
  progressPercent?: number
  stageLabel?: string
  logLine?: string
}

export type VideoStudioPreviewHandle = {
  state: VideoStudioPreviewState
  stop: () => Promise<void>
}

export type VideoRenderEngineAdapter = {
  readonly id: VideoStudioEngine
  probeEnvironment: (deps: VideoEngineProcessDeps) => Promise<VideoStudioEngineStatus>
  scaffoldProject: (
    projectDir: string,
    project: VideoStudioProject,
    options?: { overwrite?: boolean }
  ) => Promise<VideoStudioCompositionState>
  checkProject: (
    projectDir: string,
    deps: VideoEngineProcessDeps,
    signal?: AbortSignal
  ) => Promise<VideoStudioCheckResult>
  startPreview: (
    projectDir: string,
    deps: VideoEngineProcessDeps,
    onExit: () => void,
    signal?: AbortSignal
  ) => Promise<VideoStudioPreviewHandle>
  renderProject: (
    projectDir: string,
    request: VideoRenderRequest,
    deps: VideoEngineProcessDeps,
    onProgress: (update: VideoRenderProgressUpdate) => void,
    signal?: AbortSignal
  ) => Promise<VideoStudioRenderRecord>
}
