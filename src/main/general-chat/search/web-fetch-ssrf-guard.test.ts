import { expect, it } from 'vitest'
import {
  assertSafePublicWebUrl,
  GENERAL_CHAT_INVALID_URL_CODE,
  GENERAL_CHAT_SSRF_BLOCKED_CODE,
  guardedWebFetch,
  isPrivateOrReservedIp
} from './web-fetch-ssrf-guard'

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

it('rejects private, loopback, metadata, mapped-v6, and integer IPv4 targets', () => {
  expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
  expect(isPrivateOrReservedIp('10.20.30.40')).toBe(true)
  expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true)
  expect(isPrivateOrReservedIp('192.168.1.50')).toBe(true)
  expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
  expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true)
  expect(isPrivateOrReservedIp('::ffff:7f00:0001')).toBe(true)
  expect(isPrivateOrReservedIp('2130706433')).toBe(true)
  expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false)
})

it('blocks invalid protocols, embedded credentials, DNS-rebinding private IPs, and metadata hosts', async () => {
  await expect(
    assertSafePublicWebUrl('file:///etc/passwd', { lookup: publicLookup })
  ).rejects.toThrow(GENERAL_CHAT_INVALID_URL_CODE)
  await expect(
    assertSafePublicWebUrl('https://user:pass@example.com/', { lookup: publicLookup })
  ).rejects.toThrow(GENERAL_CHAT_INVALID_URL_CODE)
  await expect(
    assertSafePublicWebUrl('http://metadata.google.internal/computeMetadata/v1/', {
      lookup: publicLookup
    })
  ).rejects.toThrow(GENERAL_CHAT_SSRF_BLOCKED_CODE)
  await expect(
    assertSafePublicWebUrl('https://rebind.example.com/', {
      lookup: async () => [{ address: '192.168.0.10', family: 4 }]
    })
  ).rejects.toThrow(GENERAL_CHAT_SSRF_BLOCKED_CODE)
  await expect(
    assertSafePublicWebUrl('https://example.com/article', { lookup: publicLookup })
  ).resolves.toMatchObject({ hostname: 'example.com' })
})

it('re-validates redirect hops against SSRF policy', async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1:8080/internal' }
    })

  await expect(
    guardedWebFetch('https://example.com/start', {
      fetchImpl: fetchMock,
      lookup: publicLookup
    })
  ).rejects.toThrow(GENERAL_CHAT_SSRF_BLOCKED_CODE)
})
