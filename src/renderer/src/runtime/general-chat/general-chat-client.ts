import {
  GENERAL_CHAT_ENSURE_HOME_METHOD,
  type GeneralChatHome
} from '../../../../shared/general-chat/general-chat-contract'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { callRuntimeRpc } from '../rpc/calls/runtime-rpc-call'
import { getRuntimeTargetHostId } from '../rpc/targets/runtime-client-target'

export async function ensureGeneralChatHomeForTarget(
  target: RuntimeClientTarget
): Promise<GeneralChatHome> {
  const home = await callRuntimeRpc<GeneralChatHome>(target, GENERAL_CHAT_ENSURE_HOME_METHOD)
  return { ...home, executionHostId: getRuntimeTargetHostId(target) }
}
