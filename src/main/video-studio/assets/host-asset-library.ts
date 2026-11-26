import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as z from 'zod'
import {
  AssetIdSchema,
  MasterAssetRecordSchema,
  type AssetType,
  type MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import {
  canonicalRealpath,
  isWithinCanonicalRoot,
  resolveContainedPath
} from '../video-studio-path-containment'
import {
  readFileWithSha256,
  sha256Bytes,
  VIDEO_STUDIO_FILE_CONFLICT_ERROR,
  writeDurableContainedFile
} from '../video-studio-tx-journal'
import {
  assertAssetInvariantsAndFiles,
  resolveAssetRootFilePath,
  VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR,
  VIDEO_STUDIO_INVALID_STATE_FILE_ERROR
} from './video-studio-asset-invariants'

const LibraryAssetIndexEntrySchema = z.object({
  assetId: AssetIdSchema,
  latestVersion: z.number().int().positive(),
  versions: z.array(z.number().int().positive()).min(1)
})

const HostAssetLibraryIndexSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.record(AssetIdSchema, LibraryAssetIndexEntrySchema)
})
type HostAssetLibraryIndex = z.infer<typeof HostAssetLibraryIndexSchema>

export type LibraryAssetBundle = {
  asset: MasterAssetRecord
  versionDir: string
  revision: string
  versions: number[]
}

const VERSION_DIR_RE = /^v([1-9]\d*)$/

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readLibraryIndex(hostAssetsDir: string): Promise<HostAssetLibraryIndex | null> {
  const indexAbs = await resolveContainedPath(hostAssetsDir, 'library.json').catch(() => null)
  if (!indexAbs) {
    return null
  }
  const raw = await readFile(indexAbs, 'utf8').catch(() => null)
  if (!raw) {
    return null
  }
  const parsed = HostAssetLibraryIndexSchema.safeParse(safeJsonParse(raw))
  return parsed.success ? parsed.data : null
}

async function writeLibraryIndex(
  hostAssetsDir: string,
  index: HostAssetLibraryIndex
): Promise<void> {
  const indexAbs = await resolveContainedPath(hostAssetsDir, 'library.json')
  await writeDurableContainedFile(indexAbs, `${JSON.stringify(index, null, 2)}\n`)
}

async function collectDiskVersions(assetDir: string): Promise<number[]> {
  const entries = await readdir(assetDir, { withFileTypes: true }).catch(() => [])
  const rootReal = await canonicalRealpath(assetDir).catch(() => assetDir)
  const versions: number[] = []
  for (const entry of entries) {
    const match = VERSION_DIR_RE.exec(entry.name)
    if (!match) {
      continue
    }
    const candidate = join(rootReal, entry.name)
    const candidateReal = await canonicalRealpath(candidate).catch(() => null)
    if (!candidateReal || !isWithinCanonicalRoot(rootReal, candidateReal, false)) {
      continue
    }
    const assetJsonInfo = await stat(join(candidateReal, 'asset.json')).catch(() => null)
    if (assetJsonInfo?.isFile()) {
      versions.push(Number.parseInt(match[1], 10))
    }
  }
  return versions.sort((a, b) => a - b)
}

export async function readLibraryAssetBundle(
  hostAssetsDir: string,
  assetId: string,
  requestedVersion?: number
): Promise<LibraryAssetBundle | null> {
  const safeId = AssetIdSchema.safeParse(assetId)
  if (!safeId.success) {
    return null
  }
  const assetDir = await resolveContainedPath(hostAssetsDir, safeId.data).catch(() => null)
  if (!assetDir || !(await stat(assetDir).catch(() => null))?.isDirectory()) {
    return null
  }
  const diskVersions = await collectDiskVersions(assetDir)
  if (diskVersions.length === 0) {
    return null
  }
  const index = await readLibraryIndex(hostAssetsDir)
  const indexedLatest = index?.assets[safeId.data]?.latestVersion
  const targetVersion =
    requestedVersion ??
    (indexedLatest && diskVersions.includes(indexedLatest) ? indexedLatest : diskVersions.at(-1)!)
  if (!diskVersions.includes(targetVersion)) {
    return null
  }
  const versionDir = await resolveContainedPath(assetDir, `v${targetVersion}`).catch(() => null)
  if (!versionDir) {
    return null
  }
  const assetJsonAbs = await resolveContainedPath(versionDir, 'asset.json').catch(() => null)
  if (!assetJsonAbs) {
    return null
  }
  const disk = await readFileWithSha256(assetJsonAbs).catch(() => null)
  if (!disk?.exists || !disk.bytes || !disk.sha256) {
    return null
  }
  const parsed = MasterAssetRecordSchema.safeParse(safeJsonParse(disk.bytes.toString('utf8')))
  if (!parsed.success) {
    return null
  }
  return {
    asset: parsed.data,
    versionDir,
    revision: disk.sha256,
    versions: diskVersions
  }
}

export async function listLibraryAssetRecords(
  hostAssetsDir: string,
  filter?: { type?: AssetType; tag?: string }
): Promise<MasterAssetRecord[]> {
  if (!(await stat(hostAssetsDir).catch(() => null))?.isDirectory()) {
    return []
  }
  const rootReal = await canonicalRealpath(hostAssetsDir).catch(() => hostAssetsDir)
  const index = await readLibraryIndex(rootReal)
  const entries = await readdir(rootReal, { withFileTypes: true }).catch(() => [])
  const candidateIds = new Set<string>(Object.keys(index?.assets ?? {}))
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'library.json') {
      continue
    }
    const candidateReal = await canonicalRealpath(join(rootReal, entry.name)).catch(() => null)
    if (candidateReal && isWithinCanonicalRoot(rootReal, candidateReal, false)) {
      candidateIds.add(entry.name)
    }
  }
  const out: MasterAssetRecord[] = []
  for (const id of candidateIds) {
    const bundle = await readLibraryAssetBundle(rootReal, id).catch(() => null)
    if (!bundle) {
      continue
    }
    if (filter?.type && bundle.asset.type !== filter.type) {
      continue
    }
    if (filter?.tag && !bundle.asset.tags.includes(filter.tag)) {
      continue
    }
    out.push(bundle.asset)
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export async function publishLibraryAssetVersion(
  hostAssetsDir: string,
  params: {
    asset: MasterAssetRecord
    fileBytesByPath: ReadonlyMap<string, { bytes: Buffer; sha256: string }>
    requireNewAsset?: boolean
    expectedRevision?: string
  }
): Promise<{ asset: MasterAssetRecord; revision: string }> {
  await mkdir(hostAssetsDir, { recursive: true, mode: 0o700 })
  const assetDir = await resolveContainedPath(hostAssetsDir, params.asset.id)
  await mkdir(assetDir, { recursive: true, mode: 0o700 })

  const index = (await readLibraryIndex(hostAssetsDir)) ?? { schemaVersion: 1 as const, assets: {} }
  const diskVersions = await collectDiskVersions(assetDir)
  const indexedVersions = index.assets[params.asset.id]?.versions ?? []
  const allVersions = [...new Set([...diskVersions, ...indexedVersions])].sort((a, b) => a - b)

  if (params.requireNewAsset && allVersions.length > 0) {
    throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
  }
  if (params.expectedRevision !== undefined) {
    const existing = await readLibraryAssetBundle(hostAssetsDir, params.asset.id)
    if (!existing || existing.revision !== params.expectedRevision) {
      throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
    }
  }

  const nextVersion = allVersions.length > 0 ? allVersions.at(-1)! + 1 : 1
  const versionDir = await resolveContainedPath(assetDir, `v${nextVersion}`)
  if ((await stat(versionDir).catch(() => null)) !== null) {
    throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
  }

  const { snapshotRevision: _dropSnapshotRev, ...withoutSnapshot } = params.asset
  const candidate = MasterAssetRecordSchema.parse({
    ...withoutSnapshot,
    version: nextVersion,
    provenance: {
      ...withoutSnapshot.provenance,
      source: 'library',
      libraryAssetId: withoutSnapshot.id,
      libraryVersion: nextVersion
    },
    updatedAt: Date.now()
  })

  let assetJson = ''
  try {
    await mkdir(versionDir, { recursive: true, mode: 0o700 })
    for (const [canonicalPath, entry] of params.fileBytesByPath.entries()) {
      const target = await resolveAssetRootFilePath(versionDir, canonicalPath)
      await writeDurableContainedFile(target.absPath, entry.bytes)
      const verified = await readFileWithSha256(target.absPath)
      if (!verified.exists || verified.sha256 !== entry.sha256) {
        throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR)
      }
    }
    const verifiedBundle = await assertAssetInvariantsAndFiles(versionDir, candidate)
    assetJson = `${JSON.stringify(verifiedBundle.asset, null, 2)}\n`
    await writeDurableContainedFile(await resolveContainedPath(versionDir, 'asset.json'), assetJson)
    candidate.states = verifiedBundle.asset.states
    candidate.dependencies = verifiedBundle.asset.dependencies
  } catch (error) {
    await rm(versionDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  const nextVersions = [...allVersions, nextVersion].sort((a, b) => a - b)
  index.assets[candidate.id] = {
    assetId: candidate.id,
    latestVersion: nextVersion,
    versions: nextVersions
  }
  await writeLibraryIndex(hostAssetsDir, index)
  return { asset: candidate, revision: sha256Bytes(assetJson) }
}

export async function deleteLibraryAssetEntry(
  hostAssetsDir: string,
  assetId: string,
  version?: number
): Promise<void> {
  const safeId = AssetIdSchema.parse(assetId)
  const assetDir = await resolveContainedPath(hostAssetsDir, safeId)
  if (!(await stat(assetDir).catch(() => null))?.isDirectory()) {
    throw new Error(VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR)
  }
  const index = (await readLibraryIndex(hostAssetsDir)) ?? { schemaVersion: 1 as const, assets: {} }
  const diskVersions = await collectDiskVersions(assetDir)

  if (version !== undefined) {
    if (!diskVersions.includes(version)) {
      throw new Error(VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR)
    }
    const versionDir = await resolveContainedPath(assetDir, `v${version}`)
    await rm(versionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    const remaining = diskVersions.filter((v) => v !== version)
    if (remaining.length === 0) {
      await rm(assetDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
      delete index.assets[safeId]
    } else {
      index.assets[safeId] = {
        assetId: safeId,
        latestVersion: remaining.at(-1)!,
        versions: remaining
      }
    }
  } else {
    if (diskVersions.length === 0 && !index.assets[safeId]) {
      throw new Error(VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR)
    }
    await rm(assetDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    delete index.assets[safeId]
  }
  await writeLibraryIndex(hostAssetsDir, index)
}
