import { mkdir } from 'node:fs/promises'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
import { folderWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import type { GeneralChatHomeStore } from '../runtime/construction/runtime-store-contract'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { loadOrCreateHostInstallationId } from '../runtime/hosts/platform-probe/host-descriptor'
import { isGeneralChatFolderWorkspace, isGeneralChatProjectGroup } from './general-chat-home'

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
    !store.updateProjectGroup ||
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
  const groups = store.getProjectGroups().filter((group) => isGeneralChatProjectGroup(group, root))
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const candidates = store
    .getFolderWorkspaces()
    .filter(
      (workspace) =>
        groupsById.has(workspace.projectGroupId) &&
        isGeneralChatFolderWorkspace(workspace, groupsById.get(workspace.projectGroupId), root)
    )
  const existing =
    candidates.find((workspace) => workspace.internalPurpose === 'general-chat') ?? candidates[0]
  const existingGroup = existing
    ? groupsById.get(existing.projectGroupId)
    : (groups.find((group) => group.internalPurpose === 'general-chat') ?? groups[0])
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
    store.updateProjectGroup(group.id, { parentPath: root, internalPurpose: 'general-chat' })
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
