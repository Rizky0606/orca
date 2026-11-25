import type { VideoStudioEngine } from '../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioEngineStatus,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot,
  VideoStudioStartRenderParams
} from '../../../shared/video-studio/video-studio-rpc-contract'

/** Injectable I/O dependencies for engine adapters (enables unit testing without real processes). */
export type VideoEngineProcessDeps = {
  /** Resolve a bare command name to an absolute path using the agent-detection shell PATH. */
  resolveCommand(program: string): Promise<string | null>
  /** Hydrate the shell PATH so the agent-detection env is available to subprocesses. */
  hydrateShellPath(): Promise<void>
  /** Run a process to completion and return its stdout. Throws on spawn error. */
  runProcess(spec: {
    program: string
    args: readonly string[]
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>
  /** Spawn a long-lived process and stream its stdout lines. Returns a handle to kill it. */
  spawnStream(spec: {
    program: string
    args: readonly string[]
    cwd: string
    env?: NodeJS.ProcessEnv
    onLine: (line: string) => void
    signal?: AbortSignal
  }): Promise<{ kill(): void; exited: Promise<void> }>
}

/** Progress callback during rendering — called with 0–100 as the render progresses. */
export type RenderProgressCallback = (snapshot: Partial<VideoStudioRenderJobSnapshot>) => void

/** Unified contract for all video render engines. */
export type VideoRenderEngineAdapter = {
  readonly engine: VideoStudioEngine

  /** Check whether the engine CLI is installed and functional. */
  probeEnvironment(deps: VideoEngineProcessDeps): Promise<VideoStudioEngineStatus>

  /** Run `hyperframes check` (or equivalent) against the composition. */
  checkComposition(
    projectDir: string,
    deps: VideoEngineProcessDeps,
    signal?: AbortSignal
  ): Promise<VideoStudioCheckResult>

  /** Start a preview server and resolve its port once it is listening. */
  startPreview(
    projectDir: string,
    deps: VideoEngineProcessDeps,
    signal?: AbortSignal
  ): Promise<VideoStudioPreviewState>

  /** Render an MP4 to `outputPath`, streaming progress. */
  renderProject(
    projectDir: string,
    outputPath: string,
    params: Pick<VideoStudioStartRenderParams, 'quality'>,
    deps: VideoEngineProcessDeps,
    onProgress: RenderProgressCallback,
    signal?: AbortSignal
  ): Promise<void>
}
