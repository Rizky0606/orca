import {
  videoStudioDimensionsForAspectRatio,
  type VideoStudioProject,
  type VideoStudioRenderRecord
} from '../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioCompositionState
} from '../../../shared/video-studio/video-studio-rpc-contract'
import { resolveVideoStudioRenderOutputFile } from '../video-studio-composition-paths'
import { scaffoldHyperFramesComposition } from '../video-studio-hyperframes-template'
import {
  parseHyperFramesCheckResult,
  parsePreviewUrl,
  parseRenderProgressLine,
  tryParseJson
} from './hyperframes-cli-parsers'
import {
  probeHyperFramesEnvironment,
  resolveHyperFramesInvocation
} from './hyperframes-environment-probe'
import type {
  VideoEngineProcessDeps,
  VideoRenderEngineAdapter,
  VideoRenderProgressUpdate,
  VideoRenderRequest,
  VideoStudioPreviewHandle
} from './video-render-engine'

async function probeMediaMetadata(
  projectDir: string,
  outputPath: string,
  project: VideoStudioProject,
  deps: VideoEngineProcessDeps
): Promise<{ width: number; height: number; durationSeconds: number }> {
  let { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  let durationSeconds = project.durationSeconds
  const ffprobeBin = await deps.resolveCommand('ffprobe')
  if (!ffprobeBin) {
    return { width, height, durationSeconds }
  }
  const probeRes = await deps
    .runProcess({
      program: ffprobeBin,
      args: ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', outputPath],
      cwd: projectDir,
      timeoutMs: 10_000
    })
    .catch(() => null)
  const probeJson = probeRes
    ? tryParseJson<{
        format?: { duration?: string }
        streams?: { codec_type?: string; width?: number; height?: number }[]
      }>(probeRes.stdout)
    : null
  const parsedDuration = probeJson?.format?.duration
    ? Number(probeJson.format.duration)
    : Number.NaN
  if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
    durationSeconds = parsedDuration
  }
  const videoStream = probeJson?.streams?.find((s) => s.codec_type === 'video')
  if (videoStream?.width && videoStream.height && videoStream.width > 0 && videoStream.height > 0) {
    width = videoStream.width
    height = videoStream.height
  }
  return { width, height, durationSeconds }
}

export function createHyperFramesEngineAdapter(): VideoRenderEngineAdapter {
  return {
    id: 'hyperframes',

    probeEnvironment: (deps) => probeHyperFramesEnvironment(deps),

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
      signal?: AbortSignal
    ): Promise<VideoStudioCheckResult> {
      await deps.hydrateShellPath(false)
      const invocation = await resolveHyperFramesInvocation(deps, true)
      if (!invocation) {
        throw new Error('video_studio_engine_unavailable')
      }
      const started = Date.now()
      const res = await deps.runProcess({
        program: invocation.program,
        args: [...invocation.prefixArgs, 'check', '--json'],
        cwd: projectDir,
        timeoutMs: 120_000,
        signal
      })
      return parseHyperFramesCheckResult(res.stdout, res.stderr, res.code, Date.now() - started)
    },

    async startPreview(
      projectDir: string,
      deps: VideoEngineProcessDeps,
      onExit: () => void,
      signal?: AbortSignal
    ): Promise<VideoStudioPreviewHandle> {
      await deps.hydrateShellPath(false)
      const invocation = await resolveHyperFramesInvocation(deps, true)
      if (!invocation) {
        throw new Error('video_studio_engine_unavailable')
      }
      const port = await deps.allocateLoopbackPort()
      return new Promise<VideoStudioPreviewHandle>((resolve, reject) => {
        let settled = false
        let processHandle: ReturnType<typeof deps.spawnPreviewStream>
        const cleanupTimer = setTimeout(() => {
          if (!settled) {
            settled = true
            void processHandle?.stop()
            reject(new Error('video_studio_preview_timeout'))
          }
        }, 20_000)

        const onAbort = () => {
          if (!settled) {
            settled = true
            clearTimeout(cleanupTimer)
            void processHandle?.stop()
            reject(new Error('video_studio_preview_cancelled'))
          }
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        processHandle = deps.spawnPreviewStream({
          program: invocation.program,
          args: [
            ...invocation.prefixArgs,
            'preview',
            '--foreground',
            '--json',
            '--port',
            String(port)
          ],
          cwd: projectDir,
          onOutputLine: (line) => {
            if (settled) {
              return
            }
            const url = parsePreviewUrl(line, port)
            if (url) {
              settled = true
              clearTimeout(cleanupTimer)
              signal?.removeEventListener('abort', onAbort)
              resolve({ state: { active: true, url, port }, stop: () => processHandle.stop() })
            }
          },
          onExit: (code) => {
            if (!settled) {
              settled = true
              clearTimeout(cleanupTimer)
              signal?.removeEventListener('abort', onAbort)
              reject(new Error(`video_studio_preview_exited:${code ?? 'unknown'}`))
            } else {
              onExit()
            }
          }
        })
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
      const invocation = await resolveHyperFramesInvocation(deps, true)
      if (!invocation) {
        throw new Error('video_studio_engine_unavailable')
      }
      const outputPath = resolveVideoStudioRenderOutputFile(projectDir, request.fileName)
      const res = await deps.runProcessStreaming({
        program: invocation.program,
        args: [
          ...invocation.prefixArgs,
          'render',
          '--quality',
          request.quality,
          '--fps',
          String(request.project.fps),
          '--output',
          `renders/${request.fileName}`
        ],
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
      const { width, height, durationSeconds } = await probeMediaMetadata(
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
