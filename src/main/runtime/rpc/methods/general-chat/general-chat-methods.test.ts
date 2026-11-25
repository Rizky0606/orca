import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Store } from '../../../../persistence/loading-store/store'
import { getCanonicalUserDataPath } from '../../../../persistence/loading-store/user-data-path'
import {
  closeTestStores,
  createSqliteTestStore
} from '../../../../persistence/persistence-test-harness'
import { OrcaRuntimeService } from '../../../orca-runtime'
import { RpcDispatcher } from '../../dispatcher'
import { ALL_RPC_METHODS } from '../rpc-method-registry'

const request = { id: 'home', authToken: 'test', method: 'generalChat.ensureHome' }

afterEach(closeTestStores)

it('returns the same path-free host-local home to paired and mobile callers', async () => {
  const store = createSqliteTestStore(Store)
  await writeFile(
    join(getCanonicalUserDataPath(), 'host-installation.json'),
    JSON.stringify({ installationId: 'e6b2b51d-f016-4685-b18f-1d5cb3548900' })
  )
  const runtime = new OrcaRuntimeService(store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: ALL_RPC_METHODS
  })
  const home = {
    executionHostId: 'local',
    folderWorkspaceId: 'general-chat-e6b2b51d-f016-4685-b18f-1d5cb3548900',
    worktreeId: 'folder:general-chat-e6b2b51d-f016-4685-b18f-1d5cb3548900'
  }

  const paired = await dispatcher.dispatch(request, {
    callerScope: { kind: 'runtime-paired', grants: [] }
  })
  expect(paired.ok && paired.result).toEqual(home)
  const mobile = await dispatcher.dispatch(request, {
    callerScope: { kind: 'mobile', delegated: true }
  })
  expect(mobile.ok && mobile.result).toEqual(home)
  expect(store.getFolderWorkspaces()).toHaveLength(1)

  const [local] = store.getFolderWorkspaces()
  const sshTwin = {
    ...local,
    folderPath: '/remote/project',
    connectionId: 'ssh-1',
    executionHostId: 'ssh:ssh-1' as const,
    internalPurpose: undefined
  }
  Object.defineProperty(store, 'getFolderWorkspaces', { value: () => [sshTwin, local] })
  const selector = `id:${home.worktreeId}`
  await expect(runtime.resolveRuntimeFileTarget(selector)).rejects.toMatchObject({
    code: 'selector_ambiguous'
  })
  await expect(runtime.resolveStructuredAgentSessionLocalWorkspacePath(selector)).resolves.toBe(
    local.folderPath
  )
  await expect(runtime.resolveStructuredAgentCatalogWorkspacePath(selector)).resolves.toBe(
    local.folderPath
  )
})

it('returns a structured refusal when the host has no workspace store', async () => {
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: ALL_RPC_METHODS
  })

  expect(await dispatcher.dispatch(request)).toMatchObject({
    ok: false,
    error: { code: 'runtime_unavailable', message: 'runtime_unavailable' }
  })
})

it('manages sources, research error codes, and video studio handoff over RPC', async () => {
  const store = createSqliteTestStore(Store)
  const runtime = new OrcaRuntimeService(store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: ALL_RPC_METHODS
  })

  const providers = await dispatcher.dispatch({
    id: 'providers',
    authToken: 'test',
    method: 'generalChat.listSearchProviders',
    params: {}
  })
  expect(providers.ok).toBe(true)

  const missingJob = await dispatcher.dispatch({
    id: 'missing-job',
    authToken: 'test',
    method: 'generalChat.getDeepResearch',
    params: { jobId: 'does-not-exist' }
  })
  expect(missingJob).toMatchObject({
    ok: false,
    error: { code: 'general_chat_research_not_found' }
  })

  const emptySources = await dispatcher.dispatch({
    id: 'sources-list',
    authToken: 'test',
    method: 'generalChat.listSources',
    params: { sessionId: 'sess-rpc-1' }
  })
  expect(emptySources).toMatchObject({
    ok: true,
    result: { sources: [] }
  })

  const handoff = await dispatcher.dispatch({
    id: 'handoff',
    authToken: 'test',
    method: 'generalChat.handoffToVideoStudio',
    params: {
      sessionId: 'sess-rpc-1',
      title: 'Edge AI Runtime Walkthrough',
      briefMarkdown: '# Brief\nExplain how Orca orchestrates local and paired hosts.',
      aspectRatio: '16:9',
      durationSeconds: 30,
      engine: 'hyperframes'
    }
  })
  expect(handoff.ok).toBe(true)
  const projectId =
    handoff.ok &&
    typeof handoff.result === 'object' &&
    handoff.result !== null &&
    'projectId' in handoff.result
      ? handoff.result.projectId
      : null
  expect(typeof projectId).toBe('string')

  const projects = await dispatcher.dispatch({
    id: 'vs-list',
    authToken: 'test',
    method: 'videoStudio.listProjects',
    params: {}
  })
  expect(projects.ok).toBe(true)
  expect(JSON.stringify(projects)).toContain('Edge AI Runtime Walkthrough')
})

it('returns a structured refusal when the store lacks folder-workspace persistence', async () => {
  const store = createSqliteTestStore(Store)
  Object.defineProperty(store, 'createFolderWorkspace', { value: undefined })
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: ALL_RPC_METHODS
  })

  expect(await dispatcher.dispatch(request)).toMatchObject({
    ok: false,
    error: { code: 'runtime_unavailable', message: 'runtime_unavailable' }
  })
})
