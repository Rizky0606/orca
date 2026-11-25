import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import {
  VideoStudioJobManager,
  type VideoStudioJobManagerOptions
} from './video-studio-job-manager'

const managers = new Map<string, VideoStudioJobManager>()
let quitHookRegistered = false

export async function openVideoStudioJobManager(
  profileDir: string,
  options?: VideoStudioJobManagerOptions
): Promise<VideoStudioJobManager> {
  if (!quitHookRegistered && hasAppEnvironment()) {
    quitHookRegistered = true
    getAppEnvironment().onWillQuit(() => {
      void disposeAllVideoStudioJobManagers()
    })
  }
  const key = await realpath(profileDir).catch(() => resolve(profileDir))
  let manager = managers.get(key)
  if (!manager) {
    manager = new VideoStudioJobManager(key, options)
    managers.set(key, manager)
  }
  return manager
}

export async function disposeAllVideoStudioJobManagers(): Promise<void> {
  const active = [...managers.values()]
  managers.clear()
  await Promise.all(active.map((manager) => manager.dispose()))
}

export type { VideoStudioJobManager, VideoStudioJobManagerOptions }
