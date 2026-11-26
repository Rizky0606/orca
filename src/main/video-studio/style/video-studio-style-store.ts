import {
  VideoStudioApplyStyleProfileToProjectParams,
  VideoStudioDeleteLibraryStyleProfileParams,
  VideoStudioDuplicateStyleProfileParams,
  VideoStudioReconcileProjectStyleParams,
  VideoStudioSaveLibraryStyleProfileParams,
  VideoStudioUpdateProjectStyleTokensParams,
  type VideoStudioApplyStyleProfileToProjectResult,
  type VideoStudioDeleteLibraryStyleProfileResult,
  type VideoStudioDuplicateStyleProfileResult,
  type VideoStudioGetProjectStyleStateResult,
  type VideoStudioGetStyleReconciliationDiffResult,
  type VideoStudioListStyleProfilesResult,
  type VideoStudioReconcileProjectStyleResult,
  type VideoStudioSaveLibraryStyleProfileResult,
  type VideoStudioUpdateProjectStyleTokensResult
} from '../../../shared/video-studio/video-studio-style-rpc-contract'
import { StyleProfileSchema } from '../../../shared/video-studio/video-studio-style-contract'
import { resolveHostVideoStylesDir } from '../video-studio-composition-paths'
import { VideoStudioLockCoordinator } from '../video-studio-locks'
import { resolveContainedPath } from '../video-studio-path-containment'
import { VideoStudioTransactionCoordinator } from '../video-studio-transactions'
import { readFileWithSha256, VIDEO_STUDIO_FILE_CONFLICT_ERROR } from '../video-studio-tx-journal'
import {
  BUILTIN_STYLE_PRESETS,
  buildProjectStyleSnapshot,
  getBuiltinStylePreset,
  isBuiltinStyleId
} from './builtin-style-presets'
import {
  deleteLibraryStyleBundle,
  listLibraryStyleProfiles,
  readLibraryStyleBundle,
  resolveSafeProjectDir,
  saveLibraryStyleBundle
} from './host-style-library'
import {
  assertExpectedRevisions,
  bumpSnapshotRevision,
  commitProjectStyleSync,
  mergeStyleTokens,
  readProjectFileText,
  readProjectStyleMarkdown,
  STYLE_SYNC_FILES
} from './style-patch-merge'
import {
  applyMarkdownTokensToProfile,
  computeStyleReconciliationDiff
} from './style-reconciliation-diff'
import { assertSafeStyleProfileTokens } from './style-token-validation'

/** Coordinates dual-scope Host Library styles, project snapshots, and Markdown reconciliation. */
export class VideoStudioStyleStore {
  private readonly stylesDir: string

  constructor(
    private readonly profileDir: string,
    private readonly locks = new VideoStudioLockCoordinator(),
    private readonly tx = new VideoStudioTransactionCoordinator(locks)
  ) {
    this.stylesDir = resolveHostVideoStylesDir(profileDir)
  }

  async listStyleProfiles(): Promise<VideoStudioListStyleProfilesResult> {
    const libraryProfiles = await this.locks.withHostStylesLock(() =>
      listLibraryStyleProfiles(this.stylesDir)
    )
    return {
      profiles: [...BUILTIN_STYLE_PRESETS.map((p) => structuredClone(p)), ...libraryProfiles]
    }
  }

  async saveLibraryStyleProfile(
    params: VideoStudioSaveLibraryStyleProfileParams
  ): Promise<VideoStudioSaveLibraryStyleProfileResult> {
    const parsed = VideoStudioSaveLibraryStyleProfileParams.parse(params)
    if (isBuiltinStyleId(parsed.profile.id)) {
      throw new Error('video_studio_style_readonly')
    }
    return this.locks.withHostStylesLock(() => saveLibraryStyleBundle(this.stylesDir, parsed))
  }

  async duplicateStyleProfile(
    params: VideoStudioDuplicateStyleProfileParams
  ): Promise<VideoStudioDuplicateStyleProfileResult> {
    const parsed = VideoStudioDuplicateStyleProfileParams.parse(params)
    if (isBuiltinStyleId(parsed.newStyleId)) {
      throw new Error('video_studio_style_readonly')
    }
    return this.locks.withHostStylesLock(async () => {
      if (await readLibraryStyleBundle(this.stylesDir, parsed.newStyleId)) {
        throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
      }
      const builtin = getBuiltinStylePreset(parsed.sourceStyleId)
      const library = builtin
        ? null
        : await readLibraryStyleBundle(this.stylesDir, parsed.sourceStyleId)
      const source = builtin ?? library?.profile
      if (!source) {
        throw new Error('video_studio_style_not_found')
      }
      const { provenance: _p, snapshotRevision: _s, ...base } = source
      return saveLibraryStyleBundle(this.stylesDir, {
        profile: {
          ...base,
          id: parsed.newStyleId,
          version: 1,
          tier: 'library',
          name: parsed.name ?? `${source.name} (Copy)`
        },
        frameMarkdown: library?.frameMarkdown ?? undefined,
        designMarkdown: library?.designMarkdown ?? undefined,
        motionMarkdown: library?.motionMarkdown ?? undefined
      })
    })
  }

  async deleteLibraryStyleProfile(
    params: VideoStudioDeleteLibraryStyleProfileParams
  ): Promise<VideoStudioDeleteLibraryStyleProfileResult> {
    const parsed = VideoStudioDeleteLibraryStyleProfileParams.parse(params)
    if (isBuiltinStyleId(parsed.styleId)) {
      throw new Error('video_studio_style_readonly')
    }
    await this.locks.withHostStylesLock(() =>
      deleteLibraryStyleBundle(this.stylesDir, parsed.styleId, parsed.expectedRevision)
    )
    return { deleted: true, styleId: parsed.styleId }
  }

  async getProjectStyleState(projectId: string): Promise<VideoStudioGetProjectStyleStateResult> {
    const projectDir = resolveSafeProjectDir(this.profileDir, projectId)
    const profileDisk = await readFileWithSha256(
      await resolveContainedPath(projectDir, 'styles/style-profile.json')
    )
    if (!profileDisk.exists || !profileDisk.bytes) {
      return { profile: null, revision: null, markdownDrift: false, driftedFiles: [] }
    }
    const profile = StyleProfileSchema.parse(JSON.parse(profileDisk.bytes.toString('utf8')))
    const diff = await this.getStyleReconciliationDiff(projectId)
    const driftedFiles = [...new Set(diff.diffs.map((entry) => entry.file))]
    return {
      profile,
      revision: profileDisk.sha256,
      markdownDrift: driftedFiles.length > 0,
      driftedFiles
    }
  }

  async applyStyleProfileToProject(
    params: VideoStudioApplyStyleProfileToProjectParams
  ): Promise<VideoStudioApplyStyleProfileToProjectResult> {
    const parsed = VideoStudioApplyStyleProfileToProjectParams.parse(params)
    return this.locks.withHostStylesLock(async () => {
      const builtin = getBuiltinStylePreset(parsed.styleId)
      const library = builtin ? null : await readLibraryStyleBundle(this.stylesDir, parsed.styleId)
      const sourceProfile = builtin ?? library?.profile
      if (!sourceProfile) {
        throw new Error('video_studio_style_not_found')
      }
      return this.locks.withProjectLock(parsed.projectId, async () => {
        const projectDir = resolveSafeProjectDir(this.profileDir, parsed.projectId)
        const expectedMap = await assertExpectedRevisions(
          projectDir,
          parsed.expectedRevision,
          parsed.expectedRevisions
        )
        const snapshot = buildProjectStyleSnapshot(sourceProfile, Date.now(), 'rev-1')
        const existing = await readProjectStyleMarkdown(projectDir)
        const result = await commitProjectStyleSync({
          tx: this.tx,
          projectDir,
          projectId: parsed.projectId,
          profile: snapshot,
          expectedMap,
          mdOverride: {
            frameMarkdown: existing.frameMarkdown ?? library?.frameMarkdown ?? null,
            designMarkdown: library?.designMarkdown ?? existing.designMarkdown,
            motionMarkdown: existing.motionMarkdown ?? library?.motionMarkdown ?? null
          }
        })
        return { ...result, filesWritten: [...STYLE_SYNC_FILES] }
      })
    })
  }

  async updateProjectStyleTokens(
    params: VideoStudioUpdateProjectStyleTokensParams
  ): Promise<VideoStudioUpdateProjectStyleTokensResult> {
    const parsed = VideoStudioUpdateProjectStyleTokensParams.parse(params)
    assertSafeStyleProfileTokens(parsed.tokens)
    return this.locks.withProjectLock(parsed.projectId, async () => {
      const projectDir = resolveSafeProjectDir(this.profileDir, parsed.projectId)
      const expectedMap = await assertExpectedRevisions(
        projectDir,
        parsed.expectedRevision,
        parsed.expectedRevisions
      )
      const currentRaw = await readProjectFileText(projectDir, 'styles/style-profile.json')
      if (!currentRaw) {
        throw new Error('video_studio_style_not_found')
      }
      const updated = mergeStyleTokens(
        StyleProfileSchema.parse(JSON.parse(currentRaw)),
        parsed.tokens
      )
      return commitProjectStyleSync({
        tx: this.tx,
        projectDir,
        projectId: parsed.projectId,
        profile: updated,
        expectedMap
      })
    })
  }

  async getStyleReconciliationDiff(
    projectId: string
  ): Promise<VideoStudioGetStyleReconciliationDiffResult> {
    const projectDir = resolveSafeProjectDir(this.profileDir, projectId)
    const profileRaw = await readProjectFileText(projectDir, 'styles/style-profile.json')
    if (!profileRaw) {
      return { inSync: true, diffs: [] }
    }
    const profile = StyleProfileSchema.parse(JSON.parse(profileRaw))
    const diffs = computeStyleReconciliationDiff(
      profile,
      await readProjectStyleMarkdown(projectDir)
    )
    return { inSync: diffs.length === 0, diffs }
  }

  async reconcileProjectStyle(
    params: VideoStudioReconcileProjectStyleParams
  ): Promise<VideoStudioReconcileProjectStyleResult> {
    const parsed = VideoStudioReconcileProjectStyleParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, async () => {
      const projectDir = resolveSafeProjectDir(this.profileDir, parsed.projectId)
      const expectedMap = await assertExpectedRevisions(
        projectDir,
        parsed.expectedRevision,
        parsed.expectedRevisions
      )
      const profileRaw = await readProjectFileText(projectDir, 'styles/style-profile.json')
      if (!profileRaw) {
        throw new Error('video_studio_style_not_found')
      }
      const current = StyleProfileSchema.parse(JSON.parse(profileRaw))
      const md = await readProjectStyleMarkdown(projectDir)
      let target = current
      if (parsed.mode === 'import-from-markdown') {
        target = applyMarkdownTokensToProfile(current, md, parsed.sourceFile)
        target.snapshotRevision = bumpSnapshotRevision(current.snapshotRevision)
      } else {
        assertSafeStyleProfileTokens(current)
      }
      return commitProjectStyleSync({
        tx: this.tx,
        projectDir,
        projectId: parsed.projectId,
        profile: target,
        expectedMap,
        mdOverride: md
      })
    })
  }
}
