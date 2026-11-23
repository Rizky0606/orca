import type { ExecutionHostId } from '../execution-host/execution-host'

export const GENERAL_CHAT_ENSURE_HOME_METHOD = 'generalChat.ensureHome'

export type GeneralChatHome = {
  executionHostId: ExecutionHostId
  folderWorkspaceId: string
  worktreeId: string
}
