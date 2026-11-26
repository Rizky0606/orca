import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import type {
  AssetDynamicReferenceWarning,
  MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import { parseStoryboardMarkdown } from '../documents/video-studio-markdown-sync'
import { canonicalRealpath, isWithinCanonicalRoot } from '../video-studio-path-containment'
import {
  extractScriptBlocks,
  scanScriptTextForWarnings,
  SCRIPT_EXTS
} from './asset-script-warning-scan'
import {
  ASSET_REGISTRY_RELATIVE_PATH,
  collectAssetFilePaths,
  normalizeAssetSubPath,
  toComparableRelativePath
} from './video-studio-asset-invariants'

export type StaticAssetReference = {
  file: string
  kind: 'storyboard' | 'markup' | 'style' | 'svg' | 'script'
  detail: string
}

const SKIPPED_DIRS = new Set(['node_modules', 'renders'])
const SCANNABLE_EXTS = new Set(['.html', '.htm', '.css', '.svg', '.js', '.mjs', '.cjs'])

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function collectScannableFiles(
  projectDir: string
): Promise<{ rootReal: string; files: string[] }> {
  const dirInfo = await stat(projectDir).catch(() => null)
  if (!dirInfo?.isDirectory()) {
    return { rootReal: resolve(projectDir), files: [] }
  }
  const rootReal = await canonicalRealpath(projectDir).catch(() => resolve(projectDir))
  const visited = new Set<string>([rootReal])
  const out: string[] = []

  const walk = async (currentDir: string): Promise<void> => {
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue
      }
      const full = join(currentDir, entry.name)
      const targetReal = await canonicalRealpath(full).catch(() => null)
      if (!targetReal || !isWithinCanonicalRoot(rootReal, targetReal, false)) {
        continue
      }
      const targetStats = await stat(targetReal).catch(() => null)
      if (targetStats?.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !visited.has(targetReal)) {
          visited.add(targetReal)
          await walk(full)
        }
      } else if (targetStats?.isFile()) {
        const rel = relative(rootReal, full).split(sep).join('/')
        if (rel === 'STORYBOARD.md' || SCANNABLE_EXTS.has(extname(rel).toLowerCase())) {
          out.push(rel)
        }
      }
    }
  }

  await walk(rootReal)
  out.sort()
  return { rootReal, files: out }
}

function fileReferenceKind(ext: string): StaticAssetReference['kind'] {
  if (ext === '.css') {
    return 'style'
  }
  if (ext === '.svg') {
    return 'svg'
  }
  if (SCRIPT_EXTS.has(ext)) {
    return 'script'
  }
  return 'markup'
}

function isMatchingStoryboardToken(
  rawRef: string,
  assetId: string,
  comparablePaths: ReadonlySet<string>
): boolean {
  const normalized = rawRef.trim().replace(/^\.\//, '').replaceAll('\\', '/')
  if (!normalized) {
    return false
  }
  const comparable = toComparableRelativePath(normalized)
  return (
    normalized === assetId ||
    normalized.startsWith(`${assetId}:`) ||
    comparablePaths.has(comparable) ||
    comparablePaths.has(toComparableRelativePath(`assets/${normalized}`))
  )
}

function matchStoryboardReferences(
  rawStoryboard: string,
  asset: MasterAssetRecord,
  comparablePaths: ReadonlySet<string>,
  pathMatchers: readonly RegExp[]
): StaticAssetReference[] {
  const matches: StaticAssetReference[] = []
  try {
    const doc = parseStoryboardMarkdown(rawStoryboard)
    for (const frame of doc.frames) {
      for (const rawRef of frame.assets) {
        if (isMatchingStoryboardToken(rawRef, asset.id, comparablePaths)) {
          matches.push({
            file: 'STORYBOARD.md',
            kind: 'storyboard',
            detail: `Frame ${frame.frameNumber} (${frame.sceneId}) references "${rawRef}"`
          })
        }
      }
    }
    return matches
  } catch {
    // Fallback line-based scan when STORYBOARD.md has malformed YAML frontmatter.
    const assetTokenRe = new RegExp(`(?:^|\\s|:|-)${escapeRegex(asset.id)}(?:$|:|\\s|,)`)
    for (const line of rawStoryboard.split(/\r?\n/)) {
      const assetsBullet = /^\s*-\s*assets\s*:(.*)$/i.exec(line)
      if (assetsBullet) {
        const tokens = assetsBullet[1].replace(/[[\]"']/g, '').split(',')
        if (tokens.some((tok) => isMatchingStoryboardToken(tok, asset.id, comparablePaths))) {
          matches.push({
            file: 'STORYBOARD.md',
            kind: 'storyboard',
            detail: `Fallback scan matched "${line.trim()}"`
          })
          continue
        }
      }
      if (assetTokenRe.test(line) || pathMatchers.some((re) => re.test(line))) {
        matches.push({
          file: 'STORYBOARD.md',
          kind: 'storyboard',
          detail: `Fallback scan matched "${line.trim()}"`
        })
      }
    }
    return matches
  }
}

function buildAssetCandidatePaths(asset: MasterAssetRecord): {
  comparableSet: Set<string>
  matchPatterns: string[]
} {
  const comparableSet = new Set<string>()
  const matchSet = new Set<string>()
  for (const canonicalPath of collectAssetFilePaths(asset)) {
    comparableSet.add(toComparableRelativePath(canonicalPath))
    matchSet.add(canonicalPath)
    matchSet.add(normalizeAssetSubPath(canonicalPath))
  }
  return { comparableSet, matchPatterns: [...matchSet] }
}

/** Scans a project directory for dynamic script patterns that may resolve assets at runtime. */
export async function scanProjectDynamicScriptWarnings(
  projectDir: string
): Promise<AssetDynamicReferenceWarning[]> {
  const { rootReal, files } = await collectScannableFiles(projectDir)
  const warnings: AssetDynamicReferenceWarning[] = []
  const seen = new Set<string>()

  for (const relFile of files) {
    if (relFile === 'STORYBOARD.md') {
      continue
    }
    const ext = extname(relFile).toLowerCase()
    const raw = await readFile(join(rootReal, relFile), 'utf8').catch(() => null)
    if (!raw) {
      continue
    }
    for (const block of extractScriptBlocks(raw, ext)) {
      scanScriptTextForWarnings(relFile, block, seen, warnings)
    }
  }
  return warnings
}

/** Scans STORYBOARD.md, HTML, CSS, SVG, and JS scripts for static refs and dynamic JS caveats. */
export async function scanProjectAssetReferences(
  projectDir: string,
  asset: MasterAssetRecord,
  otherAssets: readonly MasterAssetRecord[]
): Promise<{
  staticRefs: StaticAssetReference[]
  dynamicWarnings: AssetDynamicReferenceWarning[]
}> {
  const { rootReal, files } = await collectScannableFiles(projectDir)
  const { comparableSet, matchPatterns } = buildAssetCandidatePaths(asset)
  const otherOwned = new Set<string>()
  for (const other of otherAssets) {
    for (const path of collectAssetFilePaths(other)) {
      otherOwned.add(toComparableRelativePath(path))
    }
  }
  const exclusiveOwnFiles = new Set([...comparableSet].filter((path) => !otherOwned.has(path)))
  const pathFlags = process.platform === 'win32' || process.platform === 'darwin' ? 'i' : ''
  const pathMatchers = matchPatterns.map(
    (pattern) =>
      new RegExp(`(?:^|[\\s"'\`(=,/])${escapeRegex(pattern)}(?=$|[\\s"'\`),;>?#])`, pathFlags)
  )
  const dataAttrRe = new RegExp(
    `\\bdata-asset(?:-id|-ref)?\\s*=\\s*["']${escapeRegex(asset.id)}(?::[^"']*)?["']`,
    'i'
  )

  const staticRefs: StaticAssetReference[] = []
  const dynamicWarnings: AssetDynamicReferenceWarning[] = []
  const seenWarnings = new Set<string>()

  for (const relFile of files) {
    const comparableRel = toComparableRelativePath(relFile)
    if (
      comparableRel === toComparableRelativePath(ASSET_REGISTRY_RELATIVE_PATH) ||
      exclusiveOwnFiles.has(comparableRel)
    ) {
      continue
    }
    const raw = await readFile(join(rootReal, relFile), 'utf8').catch(() => null)
    if (!raw) {
      continue
    }
    if (comparableRel === toComparableRelativePath('STORYBOARD.md')) {
      staticRefs.push(...matchStoryboardReferences(raw, asset, comparableSet, pathMatchers))
      continue
    }

    const ext = extname(relFile).toLowerCase()
    for (const block of extractScriptBlocks(raw, ext)) {
      scanScriptTextForWarnings(relFile, block, seenWarnings, dynamicWarnings)
    }

    const bodyForStatic =
      ext === '.html' || ext === '.htm' || ext === '.svg'
        ? raw.replace(/<!--[\s\S]*?-->/g, '')
        : raw
    const kind = fileReferenceKind(ext)
    if (dataAttrRe.test(bodyForStatic)) {
      staticRefs.push({
        file: relFile,
        kind,
        detail: `Matches data-asset attribute for ${asset.id}`
      })
      continue
    }
    const matchedPath = matchPatterns.find((_, idx) => pathMatchers[idx].test(bodyForStatic))
    if (matchedPath) {
      staticRefs.push({ file: relFile, kind, detail: `References "${matchedPath}"` })
    }
  }

  return { staticRefs, dynamicWarnings }
}
