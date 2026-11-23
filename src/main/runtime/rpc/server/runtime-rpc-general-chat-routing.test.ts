import { on, once } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import WebSocket from 'ws'
import { NODE_PAIRED_E2EE_PRIMITIVES } from '../../../../shared/remote-runtime/e2ee/node/paired-e2ee-node-primitives'
import { createPairedE2EEClientHandshake } from '../../../../shared/remote-runtime/e2ee/paired-e2ee-client-handshake'
import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import { Store } from '../../../persistence/loading-store/store'
import { getCanonicalUserDataPath } from '../../../persistence/loading-store/user-data-path'
import {
  closeTestStores,
  createSqliteTestStore
} from '../../../persistence/persistence-test-harness'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

afterEach(closeTestStores)

it('refuses a mobile SSH home request before creating a desktop home', async () => {
  const store = createSqliteTestStore(Store)
  const userDataPath = getCanonicalUserDataPath()
  const server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(store),
    userDataPath,
    enableWebSocket: true,
    wsPort: 0
  })
  await server.start()
  try {
    const offer = server.createPairingOffer({ address: '127.0.0.1', scope: 'mobile' })
    const pairing = offer.available && parsePairingCode(offer.pairingUrl)
    if (!pairing) {
      throw new Error('Mobile pairing unavailable')
    }
    const handshake = createPairedE2EEClientHandshake({
      primitives: NODE_PAIRED_E2EE_PRIMITIVES,
      hostPublicKeyB64: pairing.publicKeyB64,
      framing: 'v2',
      transport: 'direct'
    })
    const socket = new WebSocket(pairing.endpoint)
    const messages = on(socket, 'message', { close: ['close'], signal: AbortSignal.timeout(5_000) })
    try {
      await once(socket, 'open', { signal: AbortSignal.timeout(5_000) })
      socket.send(handshake.helloText())
      expect(handshake.acceptReadyText(String((await messages.next()).value?.[0]))).toBe('accepted')
      socket.send(await handshake.sealAuth({ kind: 'token', deviceToken: pairing.deviceToken }))
      const auth = handshake.channel.openText(String((await messages.next()).value?.[0]))
      expect(handshake.classifyAuthReply(auth ?? '')).toEqual({ kind: 'authenticated' })

      socket.send(
        handshake.channel.sealText(
          JSON.stringify({
            id: 'ssh-home',
            method: 'generalChat.ensureHome',
            executionHost: 'ssh:development-box'
          })
        )
      )
      const reply = handshake.channel.openText(String((await messages.next()).value?.[0]))
      expect({
        response: JSON.parse(reply ?? 'null'),
        workspaces: store.getFolderWorkspaces(),
        groups: store.getProjectGroups(),
        homeExists: existsSync(join(userDataPath, 'general-chat'))
      }).toMatchObject({
        response: { id: 'ssh-home', ok: false, error: { code: 'remote_runtime_unavailable' } },
        workspaces: [],
        groups: [],
        homeExists: false
      })
    } finally {
      await messages.return?.()
      socket.terminate()
    }
  } finally {
    await server.stop()
  }
})
