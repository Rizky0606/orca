import { afterEach, expect, it, vi } from 'vitest'
import { createCompatibleRuntimeStatusResponse } from '../rpc/testing/runtime-compatibility-test-fixture'
import { ensureGeneralChatHomeForTarget } from './general-chat-client'

function homeResponse(runtimeId: string, workspace: string) {
  return {
    id: 'home',
    ok: true,
    result: {
      executionHostId: 'local',
      folderWorkspaceId: workspace,
      worktreeId: `folder:${workspace}`
    },
    _meta: { runtimeId }
  }
}

afterEach(() => vi.unstubAllGlobals())

it('returns each selected runtime’s home using its host identity in the caller', async () => {
  vi.stubGlobal('window', {
    api: {
      runtime: {
        call: async ({ method }: { method: string }) => {
          if (method !== 'generalChat.ensureHome') {
            throw new Error(`Unexpected local method ${method}`)
          }
          return homeResponse('local-runtime', 'local-chat')
        }
      },
      runtimeEnvironments: {
        call: async ({ selector, method }: { selector: string; method: string }) => {
          if (selector !== 'paired-server') {
            throw new Error(`Unexpected environment ${selector}`)
          }
          if (method === 'status.get') {
            return createCompatibleRuntimeStatusResponse('server-runtime')
          }
          if (method !== 'generalChat.ensureHome') {
            throw new Error(`Unexpected remote method ${method}`)
          }
          return homeResponse('server-runtime', 'server-chat')
        }
      }
    }
  })

  await expect(ensureGeneralChatHomeForTarget({ kind: 'local' })).resolves.toEqual({
    executionHostId: 'local',
    folderWorkspaceId: 'local-chat',
    worktreeId: 'folder:local-chat'
  })
  await expect(
    ensureGeneralChatHomeForTarget({ kind: 'environment', environmentId: 'paired-server' })
  ).resolves.toEqual({
    executionHostId: 'runtime:paired-server',
    folderWorkspaceId: 'server-chat',
    worktreeId: 'folder:server-chat'
  })
})
