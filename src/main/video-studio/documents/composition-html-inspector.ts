import { readFile, stat } from 'node:fs/promises'
import { resolveContainedPath } from '../video-studio-path-containment'

export type MountedCompositionTag = {
  rawSrc: string
  normalizedSrc: string | null
  durationSeconds: number | null
}

export type AssetRegistryEntry = {
  defaultState: string | null
  states: Map<string, string>
}

export type AssetRegistryLookup = Map<string, AssetRegistryEntry>

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/i

export function parseDurationSeconds(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }
  const match = DURATION_RE.exec(value.trim())
  if (!match) {
    return null
  }
  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }
  const unit = match[2]?.toLowerCase()
  if (unit === 'ms') {
    return amount / 1000
  }
  if (unit === 'm') {
    return amount * 60
  }
  return amount
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

function extractHtmlAttribute(tag: string, attrName: string): string | null {
  const re = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = re.exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '').trim() : null
}

export function normalizeRelativeCompositionPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\.\//, '')
  if (!trimmed || trimmed.includes('\\') || trimmed.includes('..') || trimmed.startsWith('/')) {
    return null
  }
  return trimmed
}

export function parseMountedCompositionsFromIndexHtml(indexHtml: string): MountedCompositionTag[] {
  const cleaned = stripHtmlComments(indexHtml)
  const tags = cleaned.match(/<[a-zA-Z0-9-]+\b[^>]*\sdata-composition-src\s*=[^>]*>/gi) ?? []
  const mounted: MountedCompositionTag[] = []
  for (const tag of tags) {
    const rawSrc = extractHtmlAttribute(tag, 'data-composition-src')
    if (!rawSrc) {
      continue
    }
    const rawDur = extractHtmlAttribute(tag, 'data-duration')
    mounted.push({
      rawSrc,
      normalizedSrc: normalizeRelativeCompositionPath(rawSrc),
      durationSeconds: rawDur ? parseDurationSeconds(rawDur) : null
    })
  }
  return mounted
}

export function parseCompositionDurationFromHtml(html: string): number | null {
  const cleaned = stripHtmlComments(html)
  const tags = cleaned.match(/<[a-zA-Z0-9-]+\b[^>]*\sdata-duration\s*=[^>]*>/gi) ?? []
  for (const tag of tags) {
    const rawDur = extractHtmlAttribute(tag, 'data-duration')
    const parsed = rawDur ? parseDurationSeconds(rawDur) : null
    if (parsed !== null) {
      return parsed
    }
  }
  return null
}

export async function readAssetRegistryLookup(
  projectDir: string
): Promise<AssetRegistryLookup | null> {
  const abs = await resolveContainedPath(projectDir, 'assets/asset-registry.json').catch(() => null)
  if (!abs) {
    return null
  }
  const raw = await readFile(abs, 'utf8').catch(() => null)
  if (!raw) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('assets' in parsed) ||
    !Array.isArray(parsed.assets)
  ) {
    return null
  }
  const rawAssets: unknown[] = parsed.assets
  const map: AssetRegistryLookup = new Map()
  for (const entry of rawAssets) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const idVal = 'id' in entry ? entry.id : undefined
    const defaultStateVal = 'defaultState' in entry ? entry.defaultState : undefined
    const statesVal = 'states' in entry ? entry.states : undefined
    if (
      typeof idVal !== 'string' ||
      typeof statesVal !== 'object' ||
      statesVal === null ||
      Array.isArray(statesVal)
    ) {
      continue
    }
    const statesMap = new Map<string, string>()
    for (const [stateName, stateVal] of Object.entries(statesVal)) {
      if (
        typeof stateVal === 'object' &&
        stateVal !== null &&
        'file' in stateVal &&
        typeof stateVal.file === 'string'
      ) {
        statesMap.set(stateName, stateVal.file)
      }
    }
    map.set(idVal, {
      defaultState: typeof defaultStateVal === 'string' ? defaultStateVal : null,
      states: statesMap
    })
  }
  return map
}

export async function checkContainedFileExists(
  projectDir: string,
  relativePath: string
): Promise<boolean> {
  const abs = await resolveContainedPath(projectDir, relativePath).catch(() => null)
  if (!abs) {
    return false
  }
  const info = await stat(abs).catch(() => null)
  return info?.isFile() === true
}

export async function isReferencedAssetAvailable(
  projectDir: string,
  assetRef: string,
  assetRegistry: AssetRegistryLookup | null
): Promise<boolean> {
  if (assetRef.includes('/') || assetRef.includes('\\')) {
    const normAsset = normalizeRelativeCompositionPath(assetRef)
    return Boolean(normAsset && (await checkContainedFileExists(projectDir, normAsset)))
  }
  if (!assetRegistry) {
    return true
  }
  const [assetId, stateName] = assetRef.split(':')
  const entry = assetRegistry.get(assetId)
  if (!entry) {
    return false
  }
  const targetState = stateName ?? entry.defaultState
  const stateFile = targetState ? entry.states.get(targetState) : entry.states.values().next().value
  const normalizedStatePath = stateFile ? normalizeRelativeCompositionPath(stateFile) : null
  if (!normalizedStatePath) {
    return false
  }
  const projectRelative = normalizedStatePath.startsWith('assets/')
    ? normalizedStatePath
    : `assets/${normalizedStatePath}`
  return checkContainedFileExists(projectDir, projectRelative)
}

export async function readCompositionFileDurations(
  projectDir: string,
  relPaths: Iterable<string>
): Promise<Map<string, number | null>> {
  const fileDurations = new Map<string, number | null>()
  for (const rel of new Set(relPaths)) {
    const abs = await resolveContainedPath(projectDir, rel).catch(() => null)
    const html = abs ? await readFile(abs, 'utf8').catch(() => null) : null
    fileDurations.set(rel, html !== null ? parseCompositionDurationFromHtml(html) : null)
  }
  return fileDurations
}
