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
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
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
