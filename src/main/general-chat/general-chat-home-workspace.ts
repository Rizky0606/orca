import { mkdir } from 'node:fs/promises'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
import { folderWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import type { GeneralChatHomeStore } from '../runtime/construction/runtime-store-contract'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { loadOrCreateHostInstallationId } from '../runtime/hosts/platform-probe/host-descriptor'
import { findGeneralChatHome } from './general-chat-home'

type HomeIdentity = { folderWorkspaceId: string; worktreeId: string }

const pendingHomes = new WeakMap<GeneralChatHomeStore, Promise<HomeIdentity>>()

export function ensureGeneralChatHome(
  deps: { rootFolder: () => string },
  store: GeneralChatHomeStore
): Promise<HomeIdentity> {
  const pending = pendingHomes.get(store)
  if (pending) {
    return pending
  }
  const home = acquireGeneralChatHome(deps.rootFolder, store).finally(() =>
    pendingHomes.delete(store)
  )
  pendingHomes.set(store, home)
  return home
}

async function acquireGeneralChatHome(
  rootFolder: () => string,
  store: GeneralChatHomeStore
): Promise<HomeIdentity> {
  if (
    !store.getProjectGroups ||
    !store.createProjectGroup ||
    !store.repairGeneralChatProjectGroup ||
    !store.getFolderWorkspaces ||
    !store.createFolderWorkspace ||
    !store.updateFolderWorkspace
  ) {
    throw new Error('runtime_unavailable')
  }
  const root = rootFolder()
  await mkdir(root, { recursive: true })
  const installationId = await loadOrCreateHostInstallationId(
    store.getProfileStorageDirectory?.() ?? getCanonicalUserDataPath()
  )
  const { group: existingGroup, workspace: existing } = findGeneralChatHome(
    store.getProjectGroups(),
    store.getFolderWorkspaces(),
    root
  )
  const group =
    existingGroup ??
    store.createProjectGroup({
      name: 'General Chat',
      parentPath: root,
      createdFrom: 'manual',
      internalPurpose: 'general-chat'
    })
  if (
    existing &&
    (existing.folderPath !== root ||
      existing.internalPurpose !== 'general-chat' ||
      existing.executionHostId !== LOCAL_EXECUTION_HOST_ID)
  ) {
    store.updateFolderWorkspace(existing.id, { folderPath: root, internalPurpose: 'general-chat' })
  }
  if (
    group.parentPath !== root ||
    group.internalPurpose !== 'general-chat' ||
    group.executionHostId !== LOCAL_EXECUTION_HOST_ID
  ) {
    store.repairGeneralChatProjectGroup(group.id, root)
  }
  const workspace =
    existing ??
    store.createFolderWorkspace({
      id: `general-chat-${installationId}`,
      projectGroupId: group.id,
      name: 'General Chat',
      folderPath: root,
      internalPurpose: 'general-chat',
      creatorProvenance: { kind: 'host' }
    })
  return { folderWorkspaceId: workspace.id, worktreeId: folderWorkspaceKey(workspace.id) }
}
