import http from 'node:http'
import { z } from 'zod'
import { isEligibleLocalCertificateHost } from '../../shared/browser/navigation/browser-url'

const HTTP_IDENTITY_TIMEOUT_MS = 1500
const HTTP_IDENTITY_MAX_BYTES = 64 * 1024

export type PreviewHttpIdentity = {
  isHyperframes: boolean
  pid?: number
  projectName?: string
  projectDir?: string
  sessionId?: string
  version?: string
}

const HttpConfigSchema = z
  .object({
    isHyperframes: z.boolean(),
    pid: z.number().optional(),
    projectName: z.string().optional(),
    projectDir: z.string().optional(),
    sessionId: z.string().optional(),
    version: z.string().optional()
  })
  .passthrough()

export function probeLoopbackHttpIdentity(
  host: string,
  port: number
): Promise<PreviewHttpIdentity | null> {
  if (
    !isEligibleLocalCertificateHost(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return Promise.resolve(null)
  }
  const connectHost = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  return new Promise((resolvePromise) => {
    const request = http.get(
      {
        host: connectHost,
        port,
        path: '/__hyperframes_config',
        agent: false,
        headers: { accept: 'application/json' },
        timeout: HTTP_IDENTITY_TIMEOUT_MS
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume()
          resolvePromise(null)
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size <= HTTP_IDENTITY_MAX_BYTES) {
            chunks.push(chunk)
          } else {
            response.destroy()
            resolvePromise(null)
          }
        })
        response.on('end', () => {
          try {
            const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const parsed = HttpConfigSchema.safeParse(raw)
            resolvePromise(parsed.success ? parsed.data : null)
          } catch {
            resolvePromise(null)
          }
        })
        response.on('error', () => resolvePromise(null))
      }
    )
    request.on('timeout', () => {
      request.destroy()
      resolvePromise(null)
    })
    request.on('error', () => resolvePromise(null))
  })
}
