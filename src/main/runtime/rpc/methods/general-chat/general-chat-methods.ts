import { LOCAL_EXECUTION_HOST_ID } from '../../../../../shared/execution-host/execution-host'
import {
  GENERAL_CHAT_ENSURE_HOME_METHOD,
  type GeneralChatHome
} from '../../../../../shared/general-chat/general-chat-contract'
import { generalChatRootFolder } from '../../../../general-chat/general-chat-home'
import { ensureGeneralChatHome } from '../../../../general-chat/general-chat-home-workspace'
import { defineMethod } from '../../core'

export const GENERAL_CHAT_METHODS = [
  defineMethod({
    name: GENERAL_CHAT_ENSURE_HOME_METHOD,
    permission: 'workspace',
    params: null,
    handler: async (_params, { runtime }): Promise<GeneralChatHome> => {
      const { folderWorkspaceId, worktreeId } = await ensureGeneralChatHome(
        { rootFolder: generalChatRootFolder },
        runtime.requireStore()
      )
      return { executionHostId: LOCAL_EXECUTION_HOST_ID, folderWorkspaceId, worktreeId }
    }
  })
]
