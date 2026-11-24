import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
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

export function findGeneralChatHome(
  groups: readonly ProjectGroup[],
  workspaces: readonly FolderWorkspace[]
): { group?: ProjectGroup; workspace?: FolderWorkspace } {
  const group = groups.find(isLocalGeneralChatRow)
  if (!group) {
    return {}
  }
  return {
    group,
    workspace: workspaces.find(
      (workspace) => workspace.projectGroupId === group.id && isLocalGeneralChatRow(workspace)
    )
  }
}

function isLocalGeneralChatRow(
  row: Pick<ProjectGroup, 'connectionId' | 'executionHostId' | 'internalPurpose'>
): boolean {
  return (
    row.internalPurpose === 'general-chat' &&
    !row.connectionId &&
    (row.executionHostId ?? LOCAL_EXECUTION_HOST_ID) === LOCAL_EXECUTION_HOST_ID
  )
}
