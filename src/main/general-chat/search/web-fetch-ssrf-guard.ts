import type { LookupAddress } from 'node:dns'
import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import {
  browserTunnelRemoteTargetBlockReason,
  inetAtonIPv4
} from '../../browser/network/tunnels/browser-network-tunnel-destination-policy'

export const GENERAL_CHAT_SSRF_BLOCKED_CODE = 'general_chat_ssrf_blocked'
export const GENERAL_CHAT_INVALID_URL_CODE = 'general_chat_invalid_url'

const MAX_REDIRECT_HOPS = 3

const BLOCKED_NETWORK_RULES: readonly (readonly [string, number, 'ipv4' | 'ipv6'])[] = [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6']
]

let blockedNetworks: BlockList | null = null

function getBlockedNetworks(): BlockList {
  if (!blockedNetworks) {
    const list = new BlockList()
    for (const [address, prefix, type] of BLOCKED_NETWORK_RULES) {
      list.addSubnet(address, prefix, type)
    }
    blockedNetworks = list
  }
  return blockedNetworks
}

function ownInterfaceAddresses(): BlockList {
  const list = new BlockList()
  try {
    const interfaces = networkInterfaces()
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries ?? []) {
        const bare = entry.address.split('%')[0] ?? entry.address
        const family = isIP(bare)
        if (family !== 0) {
          list.addAddress(bare, family === 4 ? 'ipv4' : 'ipv6')
        }
      }
    }
  } catch {
    return list
  }
  return list
}

function extractMappedIPv4(address: string): string | null {
  const normalized = address.toLowerCase()
  if (!normalized.startsWith('::ffff:')) {
    return null
  }
  const tail = normalized.slice('::ffff:'.length)
  if (isIP(tail) === 4) {
    return tail
  }
  const hexGroups = tail.split(':')
  if (hexGroups.length === 2) {
    const high = Number.parseInt(hexGroups[0] ?? '', 16)
    const low = Number.parseInt(hexGroups[1] ?? '', 16)
    if (!Number.isNaN(high) && !Number.isNaN(low) && high <= 0xffff && low <= 0xffff) {
      return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
    }
  }
  return null
}

function normalizeAddressForCheck(raw: string): string {
  const unbracketed = raw.replace(/^\[|\]$/g, '')
  return unbracketed.split('%')[0] ?? unbracketed
}

export function isPrivateOrReservedIp(rawAddress: string): boolean {
  const address = normalizeAddressForCheck(rawAddress)
  const family = isIP(address)
  if (family === 0) {
    const packedV4 = inetAtonIPv4(address)
    return packedV4 ? isPrivateOrReservedIp(packedV4) : false
  }
  const netList = getBlockedNetworks()
  const type = family === 4 ? 'ipv4' : 'ipv6'
  if (netList.check(address, type) || ownInterfaceAddresses().check(address, type)) {
    return true
  }
  const mappedV4 = family === 6 ? extractMappedIPv4(address) : null
  if (mappedV4) {
    return netList.check(mappedV4, 'ipv4') || ownInterfaceAddresses().check(mappedV4, 'ipv4')
  }
  return false
}

export type SsrfLookupFn = (hostname: string) => Promise<readonly LookupAddress[]>

export type AssertSafeUrlOptions = {
  lookup?: SsrfLookupFn
}

export async function assertSafePublicWebUrl(
  rawUrl: string,
  options: AssertSafeUrlOptions = {}
): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error(GENERAL_CHAT_INVALID_URL_CODE)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(GENERAL_CHAT_INVALID_URL_CODE)
  }
  if (parsed.username || parsed.password) {
    throw new Error(GENERAL_CHAT_INVALID_URL_CODE)
  }
  const hostname = normalizeAddressForCheck(parsed.hostname.toLowerCase().replace(/\.$/, ''))
  if (!hostname) {
    throw new Error(GENERAL_CHAT_INVALID_URL_CODE)
  }
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    browserTunnelRemoteTargetBlockReason(hostname) !== null
  ) {
    throw new Error(GENERAL_CHAT_SSRF_BLOCKED_CODE)
  }
  if (isIP(hostname) !== 0 || inetAtonIPv4(hostname) !== null) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(GENERAL_CHAT_SSRF_BLOCKED_CODE)
    }
    return parsed
  }
  const lookup = options.lookup ?? ((host) => dnsLookup(host, { all: true, verbatim: true }))
  const resolved = await lookup(hostname).catch(() => [])
  if (resolved.length === 0) {
    throw new Error(GENERAL_CHAT_SSRF_BLOCKED_CODE)
  }
  if (resolved.some((entry) => isPrivateOrReservedIp(entry.address))) {
    throw new Error(GENERAL_CHAT_SSRF_BLOCKED_CODE)
  }
  return parsed
}

export type GuardedWebFetchOptions = {
  fetchImpl?: typeof fetch
  lookup?: SsrfLookupFn
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
}

const DEFAULT_FETCH_TIMEOUT_MS = 10_000

export async function guardedWebFetch(
  rawUrl: string,
  options: GuardedWebFetchOptions = {}
): Promise<{ url: string; response: Response }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  let currentUrl = rawUrl

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const safeUrl = await assertSafePublicWebUrl(currentUrl, { lookup: options.lookup })
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal
    const response = await fetchImpl(safeUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'user-agent': 'OrcaResearch/1.0 (+https://github.com/orca-ai)',
        accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5',
        ...options.headers
      },
      signal
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || hop >= MAX_REDIRECT_HOPS) {
        throw new Error(GENERAL_CHAT_SSRF_BLOCKED_CODE)
      }
      currentUrl = new URL(location, safeUrl).toString()
      continue
    }
    return { url: safeUrl.toString(), response }
  }
  throw new Error(GENERAL_CHAT_SSRF_BLOCKED_CODE)
}
