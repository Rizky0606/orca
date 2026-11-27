import {
  VideoStudioApplyLibraryAssetToProjectParams,
  VideoStudioDeleteLibraryAssetParams,
  VideoStudioListLibraryAssetsParams,
  VideoStudioListProjectAssetsParams,
  VideoStudioRegisterOrImportAssetParams,
  VideoStudioRemoveProjectAssetParams,
  VideoStudioSaveProjectAssetToLibraryParams,
  VideoStudioUpdateAssetMetadataParams,
  type VideoStudioApplyLibraryAssetToProjectResult,
  type VideoStudioDeleteLibraryAssetResult,
  type VideoStudioListLibraryAssetsResult,
  type VideoStudioListProjectAssetsResult,
  type VideoStudioRegisterOrImportAssetResult,
  type VideoStudioRemoveProjectAssetResult,
  type VideoStudioSaveProjectAssetToLibraryResult,
  type VideoStudioUpdateAssetMetadataResult
} from '../../../shared/video-studio/video-studio-asset-rpc-contract'
import {
  resolveHostVideoAssetsDir,
  resolveVideoStudioProjectDir
} from '../video-studio-composition-paths'
import { VideoStudioLockCoordinator } from '../video-studio-locks'
import { VideoStudioTransactionCoordinator } from '../video-studio-transactions'
import { VIDEO_STUDIO_FILE_CONFLICT_ERROR } from '../video-studio-tx-journal'
import { scanProjectAssetReferences } from './asset-reference-scanner'
import {
  deleteLibraryAssetEntry,
  listLibraryAssetRecords,
  publishLibraryAssetVersion,
  readLibraryAssetBundle
} from './host-asset-library'
import {
  applyAssetMetadataChanges,
  buildAppliedLibrarySnapshot,
  buildImportedAssetRecord
} from './project-asset-import-staging'
import {
  collectExclusiveDeleteOps,
  commitProjectAssetRegistry,
  inspectProjectAssetRegistry,
  readProjectRegistryForMutation
} from './project-asset-registry'
import {
  assertAssetInvariantsAndFiles,
  VIDEO_STUDIO_ASSET_IN_USE_ERROR,
  VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR,
  VIDEO_STUDIO_INVALID_STATE_FILE_ERROR
} from './video-studio-asset-invariants'

/** Coordinates project `asset-registry.json`, dependency scanning, and immutable Host Asset Library. */
export class VideoStudioAssetStore {
  private readonly hostAssetsDir: string

  constructor(
    private readonly profileDir: string,
    private readonly locks = new VideoStudioLockCoordinator(),
    private readonly tx = new VideoStudioTransactionCoordinator(locks)
  ) {
    this.hostAssetsDir = resolveHostVideoAssetsDir(profileDir)
  }

  async listLibraryAssets(
    params: VideoStudioListLibraryAssetsParams = {}
  ): Promise<VideoStudioListLibraryAssetsResult> {
    const parsed = VideoStudioListLibraryAssetsParams.parse(params)
    const assets = await this.locks.withHostAssetsLock(() =>
      listLibraryAssetRecords(this.hostAssetsDir, parsed)
    )
    return { assets }
  }

  async listProjectAssets(
    params: VideoStudioListProjectAssetsParams
  ): Promise<VideoStudioListProjectAssetsResult> {
    const parsed = VideoStudioListProjectAssetsParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, () =>
      inspectProjectAssetRegistry(resolveVideoStudioProjectDir(this.profileDir, parsed.projectId))
    )
  }

  async registerOrImportAsset(
    params: VideoStudioRegisterOrImportAssetParams
  ): Promise<VideoStudioRegisterOrImportAssetResult> {
    const parsed = VideoStudioRegisterOrImportAssetParams.parse(params)
    const now = Date.now()

    if (parsed.scope === 'library') {
      const runLibrary = async (projectDir: string | null) => {
        if (parsed.expectedRevision !== undefined) {
          throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
        }
        const { record, staged } = await buildImportedAssetRecord({
          input: parsed.asset,
          scope: 'library',
          projectDir,
          now
        })
        if (
          !projectDir &&
          (record.dependencies.length > 0 ||
            Object.values(record.states).some((s) => (s.dependencies?.length ?? 0) > 0))
        ) {
          throw new Error(VIDEO_STUDIO_INVALID_STATE_FILE_ERROR)
        }
        const verified = await assertAssetInvariantsAndFiles(
          projectDir ?? this.hostAssetsDir,
          record,
          staged.stagedBytesByPath
        )
        return publishLibraryAssetVersion(this.hostAssetsDir, {
          asset: verified.asset,
          fileBytesByPath: verified.fileBytesByPath,
          requireNewAsset: true
        })
      }

      return this.locks.withHostAssetsLock(() => {
        if (parsed.projectId) {
          return this.locks.withProjectLock(parsed.projectId, () =>
            runLibrary(resolveVideoStudioProjectDir(this.profileDir, parsed.projectId!))
          )
        }
        return runLibrary(null)
      })
    }

    const projectId = parsed.projectId!
    return this.locks.withProjectLock(projectId, async () => {
      const projectDir = resolveVideoStudioProjectDir(this.profileDir, projectId)
      const registry = await readProjectRegistryForMutation(projectDir, parsed.expectedRevision)
      if (registry.doc.assets.some((entry) => entry.id === parsed.asset.id)) {
        throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
      }
      const { record, staged } = await buildImportedAssetRecord({
        input: parsed.asset,
        scope: 'project',
        projectDir,
        now
      })
      const verified = await assertAssetInvariantsAndFiles(
        projectDir,
        record,
        staged.stagedBytesByPath
      )
      const revision = await commitProjectAssetRegistry({
        tx: this.tx,
        projectDir,
        projectId,
        assets: [...registry.doc.assets, verified.asset],
        expectedRegistrySha256: registry.sha256,
        fileOps: staged.writeOps
      })
      return { asset: verified.asset, revision }
    })
  }

  async updateAssetMetadata(
    params: VideoStudioUpdateAssetMetadataParams
  ): Promise<VideoStudioUpdateAssetMetadataResult> {
    const parsed = VideoStudioUpdateAssetMetadataParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, async () => {
      const projectDir = resolveVideoStudioProjectDir(this.profileDir, parsed.projectId)
      const registry = await readProjectRegistryForMutation(projectDir, parsed.expectedRevision)
      const index = registry.doc.assets.findIndex((entry) => entry.id === parsed.assetId)
      if (index === -1) {
        throw new Error(VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR)
      }
      const updated = await applyAssetMetadataChanges({
        projectDir,
        existing: registry.doc.assets[index],
        changes: parsed.changes
      })
      const nextAssets = [...registry.doc.assets]
      nextAssets[index] = updated.asset
      const revision = await commitProjectAssetRegistry({
        tx: this.tx,
        projectDir,
        projectId: parsed.projectId,
        assets: nextAssets,
        expectedRegistrySha256: registry.sha256,
        fileOps: updated.writeOps
      })
      return { asset: updated.asset, revision }
    })
  }

  async applyLibraryAssetToProject(
    params: VideoStudioApplyLibraryAssetToProjectParams
  ): Promise<VideoStudioApplyLibraryAssetToProjectResult> {
    const parsed = VideoStudioApplyLibraryAssetToProjectParams.parse(params)
    return this.locks.withHostAssetsLock(async () => {
      const bundle = await readLibraryAssetBundle(
        this.hostAssetsDir,
        parsed.assetId,
        parsed.version
      )
      if (!bundle) {
        throw new Error(VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR)
      }
      const verifiedLib = await assertAssetInvariantsAndFiles(bundle.versionDir, bundle.asset)

      return this.locks.withProjectLock(parsed.projectId, async () => {
        const projectDir = resolveVideoStudioProjectDir(this.profileDir, parsed.projectId)
        const registry = await readProjectRegistryForMutation(projectDir, parsed.expectedRevision)
        const { snapshotAsset, nextAssets, writeOps } = buildAppliedLibrarySnapshot({
          libraryAsset: verifiedLib.asset,
          fileBytesByPath: verifiedLib.fileBytesByPath,
          existingAssets: registry.doc.assets
        })
        const revision = await commitProjectAssetRegistry({
          tx: this.tx,
          projectDir,
          projectId: parsed.projectId,
          assets: nextAssets,
          expectedRegistrySha256: registry.sha256,
          fileOps: writeOps
        })
        return { asset: snapshotAsset, revision }
      })
    })
  }

  async saveProjectAssetToLibrary(
    params: VideoStudioSaveProjectAssetToLibraryParams
  ): Promise<VideoStudioSaveProjectAssetToLibraryResult> {
    const parsed = VideoStudioSaveProjectAssetToLibraryParams.parse(params)
    return this.locks.withHostAssetsLock(() =>
      this.locks.withProjectLock(parsed.projectId, async () => {
        const projectDir = resolveVideoStudioProjectDir(this.profileDir, parsed.projectId)
        const registry = await readProjectRegistryForMutation(
          projectDir,
          parsed.expectedProjectRevision
        )
        const target = registry.doc.assets.find((entry) => entry.id === parsed.assetId)
        if (!target) {
          throw new Error(VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR)
        }
        const verified = await assertAssetInvariantsAndFiles(projectDir, target)
        const published = await publishLibraryAssetVersion(this.hostAssetsDir, {
          asset: verified.asset,
          fileBytesByPath: verified.fileBytesByPath
        })
        return { asset: published.asset }
      })
    )
  }

  async removeProjectAsset(
    params: VideoStudioRemoveProjectAssetParams
  ): Promise<VideoStudioRemoveProjectAssetResult> {
    const parsed = VideoStudioRemoveProjectAssetParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, async () => {
      const projectDir = resolveVideoStudioProjectDir(this.profileDir, parsed.projectId)
      const registry = await readProjectRegistryForMutation(projectDir, parsed.expectedRevision)
      const target = registry.doc.assets.find((entry) => entry.id === parsed.assetId)
      if (!target) {
        throw new Error(VIDEO_STUDIO_ASSET_NOT_FOUND_ERROR)
      }
      const remaining = registry.doc.assets.filter((entry) => entry.id !== parsed.assetId)
      const scan = await scanProjectAssetReferences(projectDir, target, remaining)
      if (scan.staticRefs.length > 0 && !parsed.force) {
        throw new Error(VIDEO_STUDIO_ASSET_IN_USE_ERROR)
      }

      const { deletedFiles, deleteOps } = parsed.forceDeleteFiles
        ? await collectExclusiveDeleteOps(projectDir, target, remaining)
        : { deletedFiles: [], deleteOps: [] }

      const revision = await commitProjectAssetRegistry({
        tx: this.tx,
        projectDir,
        projectId: parsed.projectId,
        assets: remaining,
        expectedRegistrySha256: registry.sha256,
        fileOps: deleteOps
      })
      return { removed: true, deletedFiles, warnings: scan.dynamicWarnings, revision }
    })
  }

  async deleteLibraryAsset(
    params: VideoStudioDeleteLibraryAssetParams
  ): Promise<VideoStudioDeleteLibraryAssetResult> {
    const parsed = VideoStudioDeleteLibraryAssetParams.parse(params)
    await this.locks.withHostAssetsLock(() =>
      deleteLibraryAssetEntry(this.hostAssetsDir, parsed.assetId, parsed.version)
    )
    return { deleted: true, assetId: parsed.assetId }
  }
}
