import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { GeneralChatWebSearchService } from '../search/general-chat-web-search-service'
import {
  GeneralChatDeepResearchManager,
  type DeepResearchManagerOptions
} from './general-chat-deep-research-runner'

const managers = new Map<string, GeneralChatDeepResearchManager>()
let quitHookRegistered = false

export async function openGeneralChatDeepResearchManager(
  profileDir: string,
  options?: Partial<DeepResearchManagerOptions>
): Promise<GeneralChatDeepResearchManager> {
  if (!quitHookRegistered && hasAppEnvironment()) {
    quitHookRegistered = true
    getAppEnvironment().onWillQuit(() => {
      void disposeAllGeneralChatDeepResearchManagers()
    })
  }
  const key = await realpath(profileDir).catch(() => resolve(profileDir))
  let manager = managers.get(key)
  if (!manager) {
    manager = new GeneralChatDeepResearchManager(key, {
      searchService: options?.searchService ?? new GeneralChatWebSearchService(),
      sourceStore: options?.sourceStore,
      jobStore: options?.jobStore,
      generateText: options?.generateText
    })
    managers.set(key, manager)
  }
  return manager
}

export async function disposeAllGeneralChatDeepResearchManagers(): Promise<void> {
  const active = [...managers.values()]
  managers.clear()
  await Promise.all(active.map((manager) => manager.dispose()))
}
