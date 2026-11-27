import { PAIRED_DESKTOP_METHODS } from './runtime-rpc-mobile-paired-desktop-methods'
import { DEFAULT_SCOPE_HOST_METHODS } from './runtime-rpc-mobile-tracker-methods'
import { EXECUTION_HOST_METHODS } from './runtime-rpc-mobile-execution-host-methods'
import { GENERAL_CHAT_MOBILE_METHOD_SET } from './runtime-rpc-mobile-general-chat-methods'
import { VIDEO_STUDIO_MOBILE_METHOD_SET } from './runtime-rpc-mobile-video-studio-methods'

// Execution-host routes follow the configured target; paired-desktop routes stay with the relaying Mac;
// default-scope-host routes follow the target, else the Mac's default host. This table also defines mobile allowlisting.
export type MobileRpcMethodRoute = 'execution-host' | 'paired-desktop' | 'default-scope-host'

export function mobileRpcSshRefusal(method: string): string | undefined {
  if (GENERAL_CHAT_MOBILE_METHOD_SET.has(method)) {
    return 'General Chat host features are unavailable for SSH hosts'
  }
  return VIDEO_STUDIO_MOBILE_METHOD_SET.has(method)
    ? 'Video Studio projects are unavailable for SSH hosts'
    : undefined
}

export { EXECUTION_HOST_METHODS }

export const MOBILE_RPC_METHOD_ROUTES: ReadonlyMap<string, MobileRpcMethodRoute> = new Map([
  ...PAIRED_DESKTOP_METHODS.map((method) => [method, 'paired-desktop'] as const),
  ...DEFAULT_SCOPE_HOST_METHODS.map((method) => [method, 'default-scope-host'] as const),
  ...EXECUTION_HOST_METHODS.map((method) => [method, 'execution-host'] as const)
])
