import { afterEach, expect, it, vi } from 'vitest'
import { createCompatibleRuntimeStatusResponse } from '../rpc/testing/runtime-compatibility-test-fixture'
import {
  ensureGeneralChatHomeForTarget,
  handoffGeneralChatToVideoStudioForTarget,
  searchGeneralChatWebForTarget
} from './general-chat-client'

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

it('routes web search and video studio handoff calls to the selected execution host target', async () => {
  const calls: { scope: string; method: string; params: unknown }[] = []
  vi.stubGlobal('window', {
    api: {
      runtime: {
        call: async ({ method, params }: { method: string; params: unknown }) => {
          calls.push({ scope: 'local', method, params })
          return {
            id: 'local',
            ok: true,
            result:
              method === 'generalChat.handoffToVideoStudio'
                ? { projectId: 'proj-local-1' }
                : {
                    query: 'orca',
                    providerUsed: 'duckduckgo',
                    fallbackUsed: false,
                    warnings: [],
                    sources: [],
                    allSessionSources: []
                  },
            _meta: { runtimeId: 'local-runtime' }
          }
        }
      },
      runtimeEnvironments: {
        call: async ({
          selector,
          method,
          params
        }: {
          selector: string
          method: string
          params: unknown
        }) => {
          if (method === 'status.get') {
            return createCompatibleRuntimeStatusResponse('server-runtime')
          }
          calls.push({ scope: selector, method, params })
          return {
            id: 'remote',
            ok: true,
            result: { projectId: 'proj-remote-1' },
            _meta: { runtimeId: 'server-runtime' }
          }
        }
      }
    }
  })

  await expect(
    searchGeneralChatWebForTarget({ kind: 'local' }, { sessionId: 's1', query: 'orca' })
  ).resolves.toMatchObject({ providerUsed: 'duckduckgo' })
  await expect(
    handoffGeneralChatToVideoStudioForTarget(
      { kind: 'environment', environmentId: 'paired-server' },
      { jobId: 'job-1', aspectRatio: '16:9', durationSeconds: 45, engine: 'hyperframes' }
    )
  ).resolves.toEqual({ projectId: 'proj-remote-1' })

  expect(calls).toEqual([
    { scope: 'local', method: 'generalChat.searchWeb', params: { sessionId: 's1', query: 'orca' } },
    {
      scope: 'paired-server',
      method: 'generalChat.handoffToVideoStudio',
      params: { jobId: 'job-1', aspectRatio: '16:9', durationSeconds: 45, engine: 'hyperframes' }
    }
  ])
})
