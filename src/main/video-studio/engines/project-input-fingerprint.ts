import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import {
  canonicalRealpath,
  isWithinCanonicalRoot,
  resolveContainedPath,
  VIDEO_STUDIO_INVALID_PATH_ERROR
} from '../video-studio-path-containment'
import { HYPERFRAMES_PINNED_VERSION } from './hyperframes-cli-parsers'

const FINGERPRINT_SKIP_DIRS = new Set(['.git', 'node_modules', '.orca', '.hyperframes', 'renders'])
const EXECUTABLE_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.svg'])
const CONFIG_RELATIVE_PATHS = [
  'hyperframes.json',
  'package.json',
  'meta.json',
  'styles/style-profile.json',
  'assets/asset-registry.json'
] as const

export type ProjectInputFingerprintOptions = {
  engineConfig?: unknown
  runtimeIdentity?: string
}

export function stableJsonSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) =>
        item === undefined || typeof item === 'function' || typeof item === 'symbol'
          ? 'null'
          : stableJsonSerialize(item)
      )
      .join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const parts = keys
    .filter(
      (key) =>
        record[key] !== undefined &&
        typeof record[key] !== 'function' &&
        typeof record[key] !== 'symbol'
    )
    .map((key) => `${JSON.stringify(key)}:${stableJsonSerialize(record[key])}`)
  return `{${parts.join(',')}}`
}

async function collectFingerprintFiles(
  rootReal: string,
  currentDir: string,
  out: string[]
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(currentDir, entry.name)
    if (entry.isSymbolicLink()) {
      const targetReal = await canonicalRealpath(full).catch(() => null)
      if (!targetReal || !isWithinCanonicalRoot(rootReal, targetReal, false)) {
        throw new Error(VIDEO_STUDIO_INVALID_PATH_ERROR)
      }
      continue
    }
    if (entry.isDirectory()) {
      if (!FINGERPRINT_SKIP_DIRS.has(entry.name)) {
        await collectFingerprintFiles(rootReal, full, out)
      }
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    const rel = relative(rootReal, full).split(sep).join('/')
    if (EXECUTABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      out.push(rel)
    }
  }
}

export async function computeProjectInputFingerprint(
  projectDir: string,
  options: ProjectInputFingerprintOptions = {}
): Promise<{
  inputFingerprint: string
  revisions: {
    compositionSha256: string
    styleSha256?: string
    assetsSha256?: string
  }
}> {
  const rootReal = await canonicalRealpath(projectDir).catch(() => projectDir)
  const fileSet = new Set<string>()
  const collected: string[] = []
  await collectFingerprintFiles(rootReal, rootReal, collected)
  for (const rel of collected) {
    fileSet.add(rel)
  }
  for (const cfg of CONFIG_RELATIVE_PATHS) {
    fileSet.add(cfg)
  }

  const runtimeIdentity = options.runtimeIdentity ?? `hyperframes@${HYPERFRAMES_PINNED_VERSION}`
  const sortedPaths = [...fileSet].sort()
  const masterHash = createHash('sha256')
  masterHash.update(`runtime:${runtimeIdentity}\0`)
  if (options.engineConfig !== undefined) {
    masterHash.update(`engineConfig:${stableJsonSerialize(options.engineConfig)}\0`)
  }

  const compositionHash = createHash('sha256')
  let styleSha256: string | undefined
  let assetsSha256: string | undefined

  for (const rel of sortedPaths) {
    const abs = await resolveContainedPath(rootReal, rel)
    const bytes = await readFile(abs).catch(() => null)
    if (bytes === null) {
      continue
    }
    const fileSha = createHash('sha256').update(bytes).digest('hex')
    masterHash.update(`${rel}\0${fileSha}\n`)
    if (rel.endsWith('.html') || rel === 'hyperframes.json') {
      compositionHash.update(`${rel}\0${fileSha}\n`)
    }
    if (rel === 'styles/style-profile.json') {
      styleSha256 = fileSha
    } else if (rel === 'assets/asset-registry.json') {
      assetsSha256 = fileSha
    }
  }

  return {
    inputFingerprint: masterHash.digest('hex'),
    revisions: {
      compositionSha256: compositionHash.digest('hex'),
      ...(styleSha256 ? { styleSha256 } : {}),
      ...(assetsSha256 ? { assetsSha256 } : {})
    }
  }
}
