import * as z from 'zod'
import { VideoStudioListProjectsResult } from '../../../src/shared/video-studio/video-studio-rpc-contract'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../transport/rpc/rpc-operation-result-reader'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { readGeneralChatHome, readGeneralChatTabs } from './host-general-chat-replies'

const generalChatHome = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'general-chat.home',
    method: 'generalChat.ensureHome',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('general-chat-home', z.unknown())
  })
)

const generalChatTabs = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'general-chat.tabs',
    method: 'session.tabs.list',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('general-chat-tabs', z.unknown())
  })
)

const videoProjects = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'video-studio.projects',
    method: 'videoStudio.listProjects',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('video-studio-projects', VideoStudioListProjectsResult)
  })
)

const readOptions = { failWhenDisconnected: true } as const

export async function listHostGeneralChats(client: RpcClient, current: () => boolean) {
  const homeReply = await generalChatHome.request(client, null, readOptions)
  if (!current()) {
    throw new Error('Host changed')
  }
  const worktree = readGeneralChatHome(generalChatHome.interpret(homeReply))
  const tabsReply = await generalChatTabs.request(
    client,
    { worktree: `id:${worktree}` },
    readOptions
  )
  if (!current()) {
    throw new Error('Host changed')
  }
  return { worktree, tabs: readGeneralChatTabs(worktree, generalChatTabs.interpret(tabsReply)) }
}

export async function listHostVideoProjects(client: RpcClient, current: () => boolean) {
  const reply = await videoProjects.request(client, {}, readOptions)
  if (!current()) {
    throw new Error('Host changed')
  }
  return videoProjects.interpret(reply)
}
