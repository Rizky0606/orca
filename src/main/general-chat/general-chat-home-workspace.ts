import { mkdir } from 'node:fs/promises'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
import { normalizeRuntimePathForComparison } from '../../shared/file-access/cross-platform-path'
import { getFolderWorkspaceWorktreeHostId } from '../../shared/folder-workspaces/folder-workspace-worktree'
import { folderWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import type { GeneralChatHomeStore } from '../runtime/construction/runtime-store-contract'
import { isGeneralChatProjectGroup } from './general-chat-home'

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
    !store.getFolderWorkspaces ||
    !store.createFolderWorkspace
  ) {
    throw new Error('runtime_unavailable')
  }
  const root = rootFolder()
  await mkdir(root, { recursive: true })
  const groups = store.getProjectGroups().filter((group) => isGeneralChatProjectGroup(group, root))
  const rootKey = normalizeRuntimePathForComparison(root)
  const existing = store
    .getFolderWorkspaces()
    .find(
      (workspace) =>
        groups.some((group) => group.id === workspace.projectGroupId) &&
        !workspace.connectionId &&
        getFolderWorkspaceWorktreeHostId(workspace) === LOCAL_EXECUTION_HOST_ID &&
        normalizeRuntimePathForComparison(workspace.folderPath) === rootKey
    )
  if (existing) {
    return { folderWorkspaceId: existing.id, worktreeId: folderWorkspaceKey(existing.id) }
  }
  const group =
    groups[0] ??
    store.createProjectGroup({
      name: 'General Chat',
      parentPath: root,
      createdFrom: 'manual'
    })
  const workspace = store.createFolderWorkspace({
    projectGroupId: group.id,
    name: 'General Chat',
    folderPath: root,
    creatorProvenance: { kind: 'host' }
  })
  return { folderWorkspaceId: workspace.id, worktreeId: folderWorkspaceKey(workspace.id) }
}
