import { stat } from 'node:fs/promises'
import type * as z from 'zod'
import {
  MasterAssetRecordSchema,
  type MasterAssetRecord
} from '../../../shared/video-studio/video-studio-asset-contract'
import type {
  AssetImportStateFileSchema,
  VideoStudioRegisterOrImportAssetParams,
  VideoStudioUpdateAssetMetadataParams
} from '../../../shared/video-studio/video-studio-asset-rpc-contract'
import type { TransactionFileOperation } from '../video-studio-transactions'
import { readFileWithSha256, sha256Bytes } from '../video-studio-tx-journal'
import {
  assertAssetInvariantsAndFiles,
  assertSafeAssetStateKey,
  decodeBoundedBase64,
  defaultAssetStatePath,
  resolveAssetRootFilePath,
  toCanonicalProjectAssetPath,
  VIDEO_STUDIO_INVALID_STATE_FILE_ERROR
} from './video-studio-asset-invariants'

type StateFileInput = z.infer<typeof AssetImportStateFileSchema>

export type StagedStatesBundle = {
  states: MasterAssetRecord['states']
  stagedBytesByPath: Map<string, { bytes: Buffer; sha256: string }>
  writeOps: TransactionFileOperation[]
}

export function bumpSnapshotRevision(current?: string): string {
  const match = current ? /^rev-(\d+)$/.exec(current) : null
  return match ? `rev-${Number.parseInt(match[1], 10) + 1}` : current ? 'rev-2' : 'rev-1'
}

export async function stageImportedStateEntries(params: {
  projectDir: string | null
  assetId: string
  assetType: MasterAssetRecord['type']
  assetFormat: MasterAssetRecord['format']
  entries: Record<string, StateFileInput>
}): Promise<StagedStatesBundle> {
  const states: MasterAssetRecord['states'] = {}
  const stagedBytesByPath = new Map<string, { bytes: Buffer; sha256: string }>()
  const writeOps: TransactionFileOperation[] = []

  for (const [stateKey, input] of Object.entries(params.entries)) {
    assertSafeAssetStateKey(stateKey)
    const fmt = input.format ?? params.assetFormat
    const canonicalPath = input.relativePath
      ? toCanonicalProjectAssetPath(input.relativePath)
      : defaultAssetStatePath(params.assetId, params.assetType, stateKey, fmt)

    let sha256: string
    if (input.contentBase64 !== undefined) {
      const bytes = decodeBoundedBase64(input.contentBase64)
      sha256 = sha256Bytes(bytes)
      const existing = stagedBytesByPath.get(canonicalPath)
      if (existing) {
        if (existing.sha256 !== sha256) {
          throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR)
        }
      } else {
        stagedBytesByPath.set(canonicalPath, { bytes, sha256 })
        writeOps.push({ relativePath: canonicalPath, content: bytes })
      }
    } else if (params.projectDir) {
      const resolved = await resolveAssetRootFilePath(params.projectDir, canonicalPath)
      const info = await stat(resolved.absPath).catch(() => null)
      const disk = info?.isFile()
        ? await readFileWithSha256(resolved.absPath).catch(() => null)
        : null
      if (!disk?.exists || !disk.bytes || !disk.sha256) {
        throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR)
      }
      stagedBytesByPath.set(canonicalPath, { bytes: disk.bytes, sha256: disk.sha256 })
      sha256 = disk.sha256
    } else {
      throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR)
    }

    states[stateKey] = {
      file: canonicalPath,
      ...(input.format !== undefined ? { format: input.format } : {}),
      sha256,
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.dependencies !== undefined
        ? { dependencies: input.dependencies.map(toCanonicalProjectAssetPath) }
        : {})
    }
  }
  return { states, stagedBytesByPath, writeOps }
}

export async function buildImportedAssetRecord(params: {
  input: VideoStudioRegisterOrImportAssetParams['asset']
  scope: VideoStudioRegisterOrImportAssetParams['scope']
  projectDir: string | null
  now: number
}): Promise<{ record: MasterAssetRecord; staged: StagedStatesBundle }> {
  const { input, scope, projectDir, now } = params
  const staged = await stageImportedStateEntries({
    projectDir,
    assetId: input.id,
    assetType: input.type,
    assetFormat: input.format,
    entries: input.stateFiles
  })
  const record = MasterAssetRecordSchema.parse({
    id: input.id,
    schemaVersion: 1,
    version: 1,
    ...(scope === 'project' ? { snapshotRevision: 'rev-1' } : {}),
    name: input.name,
    type: input.type,
    format: input.format,
    tags: input.tags,
    defaultState: input.defaultState,
    states: staged.states,
    components: input.components ?? [],
    supportedEngines: input.supportedEngines ?? ['hyperframes'],
    dependencies: (input.dependencies ?? []).map(toCanonicalProjectAssetPath),
    provenance: input.provenance ?? {
      source: scope === 'library' ? 'library' : 'imported'
    },
    ...(input.license ? { license: input.license } : {}),
    consistency: input.consistency ?? {
      lockGeometry: true,
      lockProportions: true,
      lockMaterials: true
    },
    createdAt: now,
    updatedAt: now
  })
  return { record, staged }
}

export async function applyAssetMetadataChanges(params: {
  projectDir: string
  existing: MasterAssetRecord
  changes: VideoStudioUpdateAssetMetadataParams['changes']
}): Promise<{ asset: MasterAssetRecord; writeOps: TransactionFileOperation[] }> {
  const { projectDir, existing, changes } = params
  const nextType = changes.type ?? existing.type
  const states = { ...existing.states }
  for (const removeKey of changes.removeStates ?? []) {
    delete states[removeKey]
  }
  const staged = await stageImportedStateEntries({
    projectDir,
    assetId: existing.id,
    assetType: nextType,
    assetFormat: existing.format,
    entries: changes.upsertStates ?? {}
  })
  Object.assign(states, staged.states)

  const candidate = MasterAssetRecordSchema.parse({
    ...existing,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.type !== undefined ? { type: changes.type } : {}),
    ...(changes.tags !== undefined ? { tags: changes.tags } : {}),
    ...(changes.defaultState !== undefined ? { defaultState: changes.defaultState } : {}),
    states,
    ...(changes.components !== undefined ? { components: changes.components } : {}),
    ...(changes.supportedEngines !== undefined
      ? { supportedEngines: changes.supportedEngines }
      : {}),
    ...(changes.dependencies !== undefined
      ? { dependencies: changes.dependencies.map(toCanonicalProjectAssetPath) }
      : {}),
    ...(changes.provenance !== undefined ? { provenance: changes.provenance } : {}),
    ...(changes.license !== undefined ? { license: changes.license } : {}),
    ...(changes.consistency !== undefined ? { consistency: changes.consistency } : {}),
    snapshotRevision: bumpSnapshotRevision(existing.snapshotRevision),
    updatedAt: Date.now()
  })

  const verified = await assertAssetInvariantsAndFiles(
    projectDir,
    candidate,
    staged.stagedBytesByPath
  )
  return { asset: verified.asset, writeOps: staged.writeOps }
}

export function buildAppliedLibrarySnapshot(params: {
  libraryAsset: MasterAssetRecord
  fileBytesByPath: ReadonlyMap<string, { bytes: Buffer; sha256: string }>
  existingAssets: readonly MasterAssetRecord[]
}): {
  snapshotAsset: MasterAssetRecord
  nextAssets: MasterAssetRecord[]
  writeOps: TransactionFileOperation[]
} {
  const { libraryAsset, fileBytesByPath, existingAssets } = params
  const existingIdx = existingAssets.findIndex((entry) => entry.id === libraryAsset.id)
  const existing = existingIdx !== -1 ? existingAssets[existingIdx] : undefined
  const snapshotAsset = MasterAssetRecordSchema.parse({
    ...libraryAsset,
    snapshotRevision: existing ? bumpSnapshotRevision(existing.snapshotRevision) : 'rev-1',
    provenance: {
      source: 'library',
      libraryAssetId: libraryAsset.id,
      libraryVersion: libraryAsset.version,
      ...(libraryAsset.provenance.originUrl ? { originUrl: libraryAsset.provenance.originUrl } : {})
    },
    updatedAt: Date.now()
  })
  const writeOps: TransactionFileOperation[] = []
  for (const [canonicalPath, entry] of fileBytesByPath.entries()) {
    writeOps.push({ relativePath: canonicalPath, content: entry.bytes })
  }
  const nextAssets = [...existingAssets]
  if (existingIdx !== -1) {
    nextAssets[existingIdx] = snapshotAsset
  } else {
    nextAssets.push(snapshotAsset)
  }
  return { snapshotAsset, nextAssets, writeOps }
}
