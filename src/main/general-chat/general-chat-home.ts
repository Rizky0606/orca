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

export function isGeneralChatFolderWorkspace(
  workspace: FolderWorkspace,
  group: ProjectGroup | undefined,
  root?: string
): boolean {
  return (
    isLocal(workspace) &&
    (workspace.internalPurpose === 'general-chat' ||
      // Adopt the first build's unmarked row only at the reserved local path.
      (group !== undefined &&
        !group.internalPurpose &&
        isGeneralChatProjectGroup(group, root) &&
        isGeneralChatRootPath(workspace.folderPath, root)))
  )
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
