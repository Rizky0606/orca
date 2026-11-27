import { resolve } from 'node:path'
import { ZodError } from 'zod'
import type { VideoStudioProject } from '../../../../../shared/video-studio/video-studio-project'
import { openVideoStudioCatalog } from '../../../../video-studio/video-studio-catalog'
import type { VideoStudioJobManager } from '../../../../video-studio/video-studio-job-manager'
import { openVideoStudioJobManager } from '../../../../video-studio/video-studio-job-registry'
import { InvalidArgumentError, type RpcContext } from '../../core'
import { RUNTIME_PASSTHROUGH_CODES } from '../../runtime-passthrough-codes'

export function profileDirectory({ runtime }: RpcContext): string {
  const directory = runtime.requireStore().getProfileStorageDirectory?.()
  if (!directory) {
    throw new Error('runtime_unavailable')
  }
  return directory
}

export async function requireProject(
  context: RpcContext,
  projectId: string
): Promise<{ directory: string; project: VideoStudioProject; manager: VideoStudioJobManager }> {
  const directory = profileDirectory(context)
  const catalog = await openVideoStudioCatalog(directory)
  const project = await catalog.get(projectId)
  if (!project) {
    throw new Error('video_studio_project_not_found')
  }
  const manager = await openVideoStudioJobManager(directory)
  return { directory, project, manager }
}

function stripHostPaths(message: string, profileDir: string): string {
  const resolved = resolve(profileDir)
  let cleaned = message.split(profileDir).join('<host>').split(resolved).join('<host>')
  if (process.platform === 'win32') {
    cleaned = cleaned.replace(/[A-Za-z]:\\[^\s'"]+/g, '<host>')
  }
  return cleaned
}

export async function runVideoStudioRpc<T>(
  context: RpcContext,
  work: (directory: string) => Promise<T>
): Promise<T> {
  const directory = profileDirectory(context)
  try {
    return await work(directory)
  } catch (error) {
    if (error instanceof ZodError || error instanceof InvalidArgumentError) {
      throw error
    }
    if (error instanceof Error) {
      if ('code' in error && error.code === 'invalid_argument') {
        throw new InvalidArgumentError(stripHostPaths(error.message, directory))
      }
      if (
        RUNTIME_PASSTHROUGH_CODES.has(error.message) ||
        error.message.startsWith('video_studio_render_failed')
      ) {
        if (error.message.includes(directory) || error.message.includes(resolve(directory))) {
          throw new Error(stripHostPaths(error.message, directory), { cause: error })
        }
        throw error
      }
    }
    throw new Error('runtime_error', { cause: error })
  }
}
