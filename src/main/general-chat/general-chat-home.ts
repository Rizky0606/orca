import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
import { normalizeRuntimePathForComparison } from '../../shared/file-access/cross-platform-path'
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
  group: Pick<ProjectGroup, 'parentPath' | 'connectionId' | 'executionHostId'>,
  root?: string
): boolean {
  return (
    !group.connectionId &&
    (group.executionHostId ?? LOCAL_EXECUTION_HOST_ID) === LOCAL_EXECUTION_HOST_ID &&
    typeof group.parentPath === 'string' &&
    normalizeRuntimePathForComparison(group.parentPath) ===
      normalizeRuntimePathForComparison(root ?? generalChatRootFolder())
  )
}
