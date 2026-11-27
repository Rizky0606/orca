import type {
  VideoStudioProject,
  VideoStudioRenderRecord
} from '../../../shared/video-studio/video-studio-project'
import type { VideoStudioCompositionState } from '../../../shared/video-studio/video-studio-rpc-contract'
import { resolveVideoStudioRenderOutputFile } from '../video-studio-composition-paths'
import { scaffoldHyperFramesComposition } from '../video-studio-hyperframes-template'
import {
  HYPERFRAMES_PINNED_VERSION,
  parseHyperFramesCheckJson,
  parseRenderProgressLine
} from './hyperframes-cli-parsers'
import {
  probeHyperFramesEnvironment,
  resolveHyperFramesInvocation
} from './hyperframes-environment-probe'
import { launchHyperFramesPreviewProcess } from './hyperframes-preview-launch'
import { computeProjectInputFingerprint } from './project-input-fingerprint'
import { probeRenderMediaMetadata } from './render-media-metadata'
import type {
  EngineCapabilities,
  VideoCheckOptions,
  VideoEngineAdapter,
  VideoEngineProcessDeps,
  VideoPreviewStartOptions,
  VideoRenderProgressUpdate,
  VideoRenderRequest,
  VideoStudioPreviewHandle
} from './video-render-engine'

export { computeProjectInputFingerprint }

const HYPERFRAMES_CAPABILITIES: EngineCapabilities = {
  supportsPartialRender: true,
  supportsPreviewServer: true,
  supportsStructuredCheck: true,
  supportsFrameSeeking: true,
  supportsTransparentOutput: true,
  supportsImageSequence: true,
  supportsParametricComposition: true,
  supportsAudio: true,
  supportedFormats: ['mp4', 'webm', 'mov', 'gif', 'png-sequence', 'hls'],
  supportedAssetTypes: [
    'object',
    'character',
    'environment',
    'graphic',
    'model3d',
    'audio',
    'video',
    'lottie',
    'custom'
  ]
}

function normalizeCheckOptions(
  signalOrOptions?: AbortSignal | VideoCheckOptions
): VideoCheckOptions {
  if (signalOrOptions instanceof AbortSignal) {
    return { signal: signalOrOptions, browser: true }
  }
  return {
    signal: signalOrOptions?.signal,
    browser: signalOrOptions?.browser ?? true
  }
}

function normalizePreviewOptions(
  signalOrOptions?: AbortSignal | VideoPreviewStartOptions
): VideoPreviewStartOptions {
  if (signalOrOptions instanceof AbortSignal) {
    return { signal: signalOrOptions }
  }
  return signalOrOptions ?? {}
}

export function createHyperFramesEngineAdapter(): VideoEngineAdapter {
  return {
    id: 'hyperframes',
    targetVersion: HYPERFRAMES_PINNED_VERSION,
    capabilities: () => HYPERFRAMES_CAPABILITIES,

    probeEnvironment: (deps, options) => probeHyperFramesEnvironment(deps, options),

    scaffoldProject(
      projectDir: string,
      project: VideoStudioProject,
      options?: { overwrite?: boolean }
    ): Promise<VideoStudioCompositionState> {
      return scaffoldHyperFramesComposition(projectDir, project, options)
    },

    async checkProject(
      projectDir: string,
      deps: VideoEngineProcessDeps,
      signalOrOptions?: AbortSignal | VideoCheckOptions
    ) {
      const { signal, browser } = normalizeCheckOptions(signalOrOptions)
      await deps.hydrateShellPath(false)
      const invocation = await resolveHyperFramesInvocation(deps, {
        allowNpxFallback: true,
        projectDir
      })
      if (!invocation) {
        throw new Error('video_studio_engine_unavailable')
      }
      const { inputFingerprint, revisions } = await computeProjectInputFingerprint(projectDir)
      const started = Date.now()
      const cliArgs =
        browser === false
          ? [...invocation.prefixArgs, 'lint', '--json']
          : [...invocation.prefixArgs, 'check', '--json']
      const res = await deps
        .runProcess({
          program: invocation.program,
          args: cliArgs,
          cwd: projectDir,
          timeoutMs: 120_000,
          signal
        })
        .catch((error: unknown) => ({
          code: 1,
          signal: null,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: false
        }))
      return parseHyperFramesCheckJson(res.stdout, res.stderr, res.code, Date.now() - started, {
        engine: 'hyperframes',
        inputFingerprint,
        revisions,
        staticLintMode: browser === false,
        timedOut: res.timedOut,
        aborted: signal?.aborted
      })
    },

    async startPreview(
      projectDir: string,
      deps: VideoEngineProcessDeps,
      onExit: () => void,
      signalOrOptions?: AbortSignal | VideoPreviewStartOptions
    ): Promise<VideoStudioPreviewHandle> {
      const options = normalizePreviewOptions(signalOrOptions)
      await deps.hydrateShellPath(false)
      const invocation = await resolveHyperFramesInvocation(deps, {
        allowNpxFallback: true,
        projectDir
      })
      if (!invocation) {
        throw new Error('video_studio_engine_unavailable')
      }
      return launchHyperFramesPreviewProcess({
        projectDir,
        invocation,
        deps,
        onExit,
        options
      })
    },

    async renderProject(
      projectDir: string,
      request: VideoRenderRequest,
      deps: VideoEngineProcessDeps,
      onProgress: (update: VideoRenderProgressUpdate) => void,
      signal?: AbortSignal
    ): Promise<VideoStudioRenderRecord> {
      await deps.hydrateShellPath(false)
      const invocation = await resolveHyperFramesInvocation(deps, {
        allowNpxFallback: true,
        projectDir
      })
      if (!invocation) {
        throw new Error('video_studio_engine_unavailable')
      }
      const outputPath = resolveVideoStudioRenderOutputFile(projectDir, request.fileName)
      const renderArgs = [
        ...invocation.prefixArgs,
        'render',
        '--quality',
        request.quality,
        '--fps',
        String(request.project.fps),
        '--output',
        `renders/${request.fileName}`
      ]
      if (typeof request.startSeconds === 'number' && Number.isFinite(request.startSeconds)) {
        renderArgs.push('--start', String(request.startSeconds))
      }
      if (typeof request.endSeconds === 'number' && Number.isFinite(request.endSeconds)) {
        renderArgs.push('--end', String(request.endSeconds))
      }
      const res = await deps.runProcessStreaming({
        program: invocation.program,
        args: renderArgs,
        cwd: projectDir,
        timeoutMs: 3_600_000,
        signal,
        onOutputLine: (line) => {
          const update = parseRenderProgressLine(line)
          if (update) {
            onProgress(update)
          }
        }
      })

      if (signal?.aborted) {
        await deps.removeFile(outputPath).catch(() => {})
        throw new Error('video_studio_render_cancelled')
      }
      if (res.code !== 0) {
        await deps.removeFile(outputPath).catch(() => {})
        const detail = (res.stderr || res.stdout).trim().split('\n').pop() ?? `exit ${res.code}`
        throw new Error(`video_studio_render_failed: ${detail}`)
      }
      const fileStats = await deps.statFile(outputPath)
      if (!fileStats || fileStats.size <= 0) {
        await deps.removeFile(outputPath).catch(() => {})
        throw new Error('video_studio_render_empty_output')
      }
      const { width, height, durationSeconds } = await probeRenderMediaMetadata(
        projectDir,
        outputPath,
        request.project,
        deps
      )
      return {
        id: request.renderId,
        engine: 'hyperframes',
        quality: request.quality,
        fileName: request.fileName,
        durationSeconds,
        width,
        height,
        fps: request.project.fps,
        sizeBytes: fileStats.size,
        createdAt: Date.now()
      }
    }
  }
}
