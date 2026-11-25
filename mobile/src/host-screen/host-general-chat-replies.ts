import * as z from 'zod'
import { isStructuredAgentId } from '../../../src/shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle-encoding'

const homeSchema = z.looseObject({
  executionHostId: z.literal('local'),
  folderWorkspaceId: z.string().min(1),
  worktreeId: z.string().min(1)
})

const chatSchema = z.looseObject({
  type: z.literal('agent-session'),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  agent: z.string().refine(isStructuredAgentId),
  title: z.string()
})

export function readGeneralChatHome(value: unknown): string {
  const home = homeSchema.parse(value)
  if (home.worktreeId !== `folder:${home.folderWorkspaceId}`) {
    throw new Error('Invalid General Chat workspace identity')
  }
  return home.worktreeId
}

export function readGeneralChatTabs(worktree: string, value: unknown) {
  const result = z.looseObject({ worktree: z.string(), tabs: z.array(z.unknown()) }).parse(value)
  if (result.worktree !== worktree) {
    throw new Error('General Chat workspace mismatch')
  }
  return result.tabs.flatMap((item) => {
    const tab = chatSchema.safeParse(item)
    return tab.success ? [tab.data] : []
  })
}
