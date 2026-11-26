import { z } from 'zod'
import {
  videoStudioDimensionsForAspectRatio,
  type VideoStudioProject
} from '../../../shared/video-studio/video-studio-project'
import { tryParseJson } from './hyperframes-cli-parsers'
import type { VideoEngineProcessDeps } from './video-render-engine'

const MediaProbePayloadSchema = z
  .object({
    format: z
      .object({
        duration: z.string().optional()
      })
      .passthrough()
      .optional(),
    streams: z
      .array(
        z
          .object({
            codec_type: z.string().optional(),
            width: z.number().optional(),
            height: z.number().optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough()

export async function probeRenderMediaMetadata(
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
  const probeJson = probeRes ? tryParseJson(probeRes.stdout, MediaProbePayloadSchema) : null
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
