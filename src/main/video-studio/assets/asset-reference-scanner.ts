import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import {
  dynamicReferenceWarning,
  type AssetDynamicReferenceWarning,
  type MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import { parseStoryboardMarkdown } from '../documents/video-studio-markdown-sync'
import { canonicalRealpath, isWithinCanonicalRoot } from '../video-studio-path-containment'
import {
  ASSET_REGISTRY_RELATIVE_PATH,
  collectAssetFilePaths,
  normalizeAssetSubPath
} from './video-studio-asset-invariants'

export type StaticAssetReference = {
  file: string
  kind: 'storyboard' | 'markup' | 'style' | 'svg' | 'script'
  detail: string
}

const SKIPPED_DIRS = new Set(['node_modules', 'renders'])
const SCANNABLE_EXTS = new Set(['.html', '.htm', '.css', '.svg', '.js', '.mjs', '.cjs'])
const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs'])
const HTML_SCRIPT_TAG_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
const TEMPLATE_LITERAL_RE = /`(?:\\[\s\S]|[^`\\])*`/g
const TEMPLATE_ASSET_CUE_RE =
  /\$\{[^}]+\}[\s\S]*(?:assets\/|(?:objects|characters|environments|graphics|models|audio|video|lottie|custom)\/|asset-registry|\.(?:svg|png|webp|glb|gltf|mp4|webm|wav|mp3|json)\b)|(?:assets\/|(?:objects|characters|environments|graphics|models|audio|video|lottie|custom)\/|asset-registry)[\s\S]*\$\{[^}]+\}/i
const CONCAT_ASSET_RE =
  /(?:['"`](?:assets\/|(?:objects|characters|environments|graphics|models|audio|video|lottie|custom)\/)[^'"`]*['"`]\s*\+|\+\s*['"`][^'"`]*\.(?:svg|png|webp|glb|gltf|mp4|webm|wav|mp3|json)['"`])|(?:\[\s*['"]assets['"]\s*,[^[\]]{0,160}\]\s*\.join\s*\()/i
const EVAL_CALL_RE = /\b(?:eval|new\s+Function)\s*\(/
const DYNAMIC_FETCH_RE = /\b(?:fetch|import)\s*\(\s*(?!['"][^'"]+['"]\s*\))[^)]*assets\//i

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

function extractScriptBlocks(content: string, ext: string): string[] {
  if (SCRIPT_EXTS.has(ext)) {
    return [content]
  }
  if (ext !== '.html' && ext !== '.htm' && ext !== '.svg') {
    return []
  }
  const blocks: string[] = []
  HTML_SCRIPT_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null = HTML_SCRIPT_TAG_RE.exec(content)
  while (match !== null) {
    if (match[1].trim()) {
      blocks.push(match[1])
    }
    match = HTML_SCRIPT_TAG_RE.exec(content)
  }
  return blocks
}

function scanScriptTextForWarnings(
  relFile: string,
  scriptText: string,
  seen: Set<string>,
  out: AssetDynamicReferenceWarning[]
): void {
  const pushUnique = (reason: string, expression: string): void => {
    const trimmed = expression.trim().slice(0, 160)
    const key = `${relFile}::${reason}::${trimmed}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(dynamicReferenceWarning(relFile, reason, trimmed))
    }
  }

  TEMPLATE_LITERAL_RE.lastIndex = 0
  let tplMatch: RegExpExecArray | null = TEMPLATE_LITERAL_RE.exec(scriptText)
  while (tplMatch !== null) {
    if (TEMPLATE_ASSET_CUE_RE.test(tplMatch[0])) {
      pushUnique('Dynamic template literal may construct asset paths under assets/', tplMatch[0])
    }
    tplMatch = TEMPLATE_LITERAL_RE.exec(scriptText)
  }

  const concatMatch = CONCAT_ASSET_RE.exec(scriptText)
  if (concatMatch) {
    pushUnique(
      'Dynamic string concatenation may construct asset paths under assets/',
      concatMatch[0]
    )
  }

  const evalMatch = EVAL_CALL_RE.exec(scriptText)
  if (evalMatch) {
    pushUnique(
      'Evaluated JavaScript (eval/Function) may reference assets dynamically',
      evalMatch[0]
    )
  }

  const fetchMatch = DYNAMIC_FETCH_RE.exec(scriptText)
  if (fetchMatch) {
    pushUnique('Dynamic fetch/import expression targets assets/', fetchMatch[0])
  }
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

function matchStoryboardReferences(
  rawStoryboard: string,
  asset: MasterAssetRecord,
  candidatePaths: ReadonlySet<string>
): StaticAssetReference[] {
  const doc = parseStoryboardMarkdown(rawStoryboard)
  const matches: StaticAssetReference[] = []
  for (const frame of doc.frames) {
    for (const rawRef of frame.assets) {
      const normalized = rawRef.trim().replace(/^\.\//, '').replaceAll('\\', '/')
      if (
        normalized === asset.id ||
        normalized.startsWith(`${asset.id}:`) ||
        candidatePaths.has(normalized) ||
        candidatePaths.has(`assets/${normalized}`)
      ) {
        matches.push({
          file: 'STORYBOARD.md',
          kind: 'storyboard',
          detail: `Frame ${frame.frameNumber} (${frame.sceneId}) references "${rawRef}"`
        })
      }
    }
  }
  return matches
}

function buildAssetCandidatePaths(asset: MasterAssetRecord): {
  canonicalSet: Set<string>
  matchPatterns: string[]
} {
  const canonicalSet = new Set<string>()
  const matchSet = new Set<string>()
  for (const canonicalPath of collectAssetFilePaths(asset)) {
    canonicalSet.add(canonicalPath)
    matchSet.add(canonicalPath)
    matchSet.add(normalizeAssetSubPath(canonicalPath))
  }
  return { canonicalSet, matchPatterns: [...matchSet] }
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
  const { canonicalSet, matchPatterns } = buildAssetCandidatePaths(asset)
  const otherOwned = new Set<string>()
  for (const other of otherAssets) {
    for (const path of collectAssetFilePaths(other)) {
      otherOwned.add(path)
    }
  }
  const exclusiveOwnFiles = new Set([...canonicalSet].filter((path) => !otherOwned.has(path)))
  const pathMatchers = matchPatterns.map(
    (pattern) => new RegExp(`(?:^|[\\s"'\`(=,/])${escapeRegex(pattern)}(?=$|[\\s"'\`),;>?#])`)
  )
  const dataAttrRe = new RegExp(
    `\\bdata-asset(?:-id|-ref)?\\s*=\\s*["']${escapeRegex(asset.id)}(?::[^"']*)?["']`,
    'i'
  )

  const staticRefs: StaticAssetReference[] = []
  const dynamicWarnings: AssetDynamicReferenceWarning[] = []
  const seenWarnings = new Set<string>()

  for (const relFile of files) {
    if (relFile === ASSET_REGISTRY_RELATIVE_PATH || exclusiveOwnFiles.has(relFile)) {
      continue
    }
    const raw = await readFile(join(rootReal, relFile), 'utf8').catch(() => null)
    if (!raw) {
      continue
    }
    if (relFile === 'STORYBOARD.md') {
      staticRefs.push(...matchStoryboardReferences(raw, asset, canonicalSet))
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
