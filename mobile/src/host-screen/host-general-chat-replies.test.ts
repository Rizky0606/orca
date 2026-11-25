import { expect, it } from 'vitest'
import { readGeneralChatHome, readGeneralChatTabs } from './host-general-chat-replies'

it('admits chats only from the paired host’s ensured folder', () => {
  const home = {
    executionHostId: 'local',
    folderWorkspaceId: 'general-chat-test',
    worktreeId: 'folder:general-chat-test'
  }
  expect(readGeneralChatHome(home)).toBe('folder:general-chat-test')
  expect(() => readGeneralChatHome({ ...home, executionHostId: 'ssh:other' })).toThrow()
  expect(() => readGeneralChatHome({ ...home, worktreeId: 'ordinary-project' })).toThrow()

  const chat = {
    type: 'agent-session',
    id: 'tab-1',
    sessionId: 'session-1',
    agent: 'codex',
    title: 'Trip plan'
  }
  const tabs = {
    worktree: 'folder:general-chat-test',
    tabs: [chat, { type: 'terminal' }, { ...chat, agent: 'invalid agent!' }]
  }
  expect(readGeneralChatTabs('folder:general-chat-test', tabs)).toEqual([chat])
  expect(() =>
    readGeneralChatTabs('folder:general-chat-test', { ...tabs, worktree: 'ordinary-project' })
  ).toThrow()
})
