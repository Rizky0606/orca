import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
import { normalizeRuntimePathForComparison } from '../../shared/file-access/cross-platform-path'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project/groups/project-group-types'
import {
  applicationHomeFolder,
  type ApplicationHomePaths
} from '../persistence/loading-store/user-data-path'

export type GeneralChatRootPaths = ApplicationHomePaths

export function generalChatRootFolder(paths?: GeneralChatRootPaths): string {
  return applicationHomeFolder('general-chat', paths)
}

export function isGeneralChatProjectGroup(
  group: Pick<ProjectGroup, 'parentPath' | 'connectionId' | 'executionHostId' | 'internalPurpose'>,
  root?: string
): boolean {
  return (
    isLocal(group) &&
    (group.internalPurpose === 'general-chat' ||
      (typeof group.parentPath === 'string' && isGeneralChatRootPath(group.parentPath, root)))
  )
}

export function findGeneralChatHome(
  groups: readonly ProjectGroup[],
  workspaces: readonly FolderWorkspace[],
  root?: string
): { group?: ProjectGroup; workspace?: FolderWorkspace } {
  for (const workspace of workspaces) {
    if (workspace.internalPurpose === 'general-chat' && isLocal(workspace)) {
      const group = groups.find((group) => group.id === workspace.projectGroupId && isLocal(group))
      if (group) {
        return { group, workspace }
      }
    }
  }
  const markedGroup = groups.find(
    (group) => group.internalPurpose === 'general-chat' && isLocal(group)
  )
  if (markedGroup) {
    return { group: markedGroup }
  }
  const legacyGroups = groups.filter((group) => isGeneralChatProjectGroup(group, root))
  if (legacyGroups.length !== 1) {
    return {}
  }
  const [group] = legacyGroups
  const legacyWorkspaces = workspaces.filter(
    (workspace) =>
      workspace.projectGroupId === group.id &&
      isLocal(workspace) &&
      isGeneralChatRootPath(workspace.folderPath, root)
  )
  return legacyWorkspaces.length <= 1 ? { group, workspace: legacyWorkspaces[0] } : {}
}

function isLocal(row: Pick<ProjectGroup, 'connectionId' | 'executionHostId'>): boolean {
  return (
    !row.connectionId &&
    (row.executionHostId ?? LOCAL_EXECUTION_HOST_ID) === LOCAL_EXECUTION_HOST_ID
  )
}

function isGeneralChatRootPath(path: string, root = generalChatRootFolder()): boolean {
  return normalizeRuntimePathForComparison(path) === normalizeRuntimePathForComparison(root)
}
