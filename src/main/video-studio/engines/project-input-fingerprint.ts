import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
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

async function collectFingerprintFiles(
  rootDir: string,
  currentDir: string,
  out: string[]
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!FINGERPRINT_SKIP_DIRS.has(entry.name)) {
        await collectFingerprintFiles(rootDir, join(currentDir, entry.name), out)
      }
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    const rel = relative(rootDir, join(currentDir, entry.name)).split(sep).join('/')
    if (EXECUTABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      out.push(rel)
    }
  }
}

export async function computeProjectInputFingerprint(projectDir: string): Promise<{
  inputFingerprint: string
  revisions: {
    compositionSha256: string
    styleSha256?: string
    assetsSha256?: string
  }
}> {
  const fileSet = new Set<string>()
  const collected: string[] = []
  await collectFingerprintFiles(projectDir, projectDir, collected)
  for (const rel of collected) {
    fileSet.add(rel)
  }
  for (const cfg of CONFIG_RELATIVE_PATHS) {
    fileSet.add(cfg)
  }

  const sortedPaths = [...fileSet].sort()
  const masterHash = createHash('sha256')
  masterHash.update(`runtime:hyperframes@${HYPERFRAMES_PINNED_VERSION}\0`)

  const compositionHash = createHash('sha256')
  let styleSha256: string | undefined
  let assetsSha256: string | undefined

  for (const rel of sortedPaths) {
    const abs = join(projectDir, ...rel.split('/'))
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
