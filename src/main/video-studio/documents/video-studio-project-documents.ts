import {
  VideoStudioAddStoryboardFrameParams,
  VideoStudioDeleteResearchSourceParams,
  VideoStudioDeleteStoryboardFrameParams,
  VideoStudioPatchStoryboardFrameParams,
  VideoStudioReorderStoryboardFramesParams,
  VideoStudioUpdateProjectBriefParams,
  VideoStudioUpdateProjectScriptParams,
  VideoStudioUpsertResearchSourceParams,
  type VideoStudioAddStoryboardFrameResult,
  type VideoStudioDeleteResearchSourceResult,
  type VideoStudioDeleteStoryboardFrameResult,
  type VideoStudioGetProjectDocumentsResult,
  type VideoStudioPatchStoryboardFrameResult,
  type VideoStudioReorderStoryboardFramesResult,
  type VideoStudioUpdateProjectBriefResult,
  type VideoStudioUpdateProjectScriptResult,
  type VideoStudioUpsertResearchSourceResult
} from '../../../shared/video-studio/video-studio-document-rpc-contract'
import type { StoryboardDocument } from '../../../shared/video-studio/video-studio-storyboard-contract'
import { resolveVideoStudioProjectDir } from '../video-studio-composition-paths'
import { VideoStudioLockCoordinator } from '../video-studio-locks'
import { VideoStudioTransactionCoordinator } from '../video-studio-transactions'
import type { VideoStudioTrustStore } from '../video-studio-trust-store'
import {
  assertExpectedRevision,
  commitBriefUpdate,
  commitResearchSourceDelete,
  commitResearchSourceUpsert,
  commitScriptUpdate,
  parseSourcesJson,
  readContainedDisk
} from './project-research-documents'
import {
  applyAddStoryboardFrame,
  applyDeleteStoryboardFrame,
  applyPatchStoryboardFrame,
  applyReorderStoryboardFrames
} from './storyboard-frame-mutations'
import {
  detectLineEnding,
  formatStoryboardMarkdown,
  parseStoryboardMarkdown,
  splitYamlFrontmatter
} from './video-studio-markdown-sync'

const TRACKED_DOCUMENT_PATHS = [
  'BRIEF.md',
  'STORYBOARD.md',
  'SCRIPT.md',
  'references/sources.json',
  'references/research-notes.md',
  'frame.md',
  'DESIGN.md',
  'MOTION.md',
  'styles/style-profile.json',
  'assets/asset-registry.json'
] as const

/** Manages project documents (`BRIEF.md`, `STORYBOARD.md`, `SCRIPT.md`, research sources) via TX + optimistic locks. */
export class VideoStudioProjectDocumentsStore {
  constructor(
    private readonly profileDir: string,
    private readonly locks = new VideoStudioLockCoordinator(),
    private readonly tx = new VideoStudioTransactionCoordinator(locks),
    private readonly trustStore?: VideoStudioTrustStore
  ) {}

  async getProjectDocuments(projectId: string): Promise<VideoStudioGetProjectDocumentsResult> {
    const projectDir = resolveVideoStudioProjectDir(this.profileDir, projectId)
    const revisions: Record<string, string> = {}
    const contents = new Map<string, string>()

    await Promise.all(
      TRACKED_DOCUMENT_PATHS.map(async (relPath) => {
        const disk = await readContainedDisk(projectDir, relPath)
        if (disk.exists && disk.bytes && disk.sha256) {
          revisions[relPath] = disk.sha256
          contents.set(relPath, disk.bytes.toString('utf8'))
        }
      })
    )

    const briefMarkdown = contents.get('BRIEF.md') ?? ''
    const storyboardMarkdown = contents.get('STORYBOARD.md') ?? ''
    const trustRecord = this.trustStore
      ? await this.trustStore.getTrustRecord(projectId, projectDir)
      : null

    return {
      briefMarkdown,
      briefFrontmatter: briefMarkdown ? splitYamlFrontmatter(briefMarkdown).frontmatter : {},
      storyboard: storyboardMarkdown ? parseStoryboardMarkdown(storyboardMarkdown) : null,
      storyboardMarkdown,
      scriptMarkdown: contents.get('SCRIPT.md') ?? '',
      researchSources: parseSourcesJson(contents.get('references/sources.json') ?? null),
      researchNotesMarkdown: contents.get('references/research-notes.md') ?? '',
      revisions,
      trustState: trustRecord?.trustState ?? 'unapproved',
      ...(trustRecord ? { approvedInputFingerprint: trustRecord.inputFingerprint } : {})
    }
  }

  async updateProjectBrief(
    params: VideoStudioUpdateProjectBriefParams
  ): Promise<VideoStudioUpdateProjectBriefResult> {
    const parsed = VideoStudioUpdateProjectBriefParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, () =>
      commitBriefUpdate(
        this.tx,
        resolveVideoStudioProjectDir(this.profileDir, parsed.projectId),
        parsed.projectId,
        parsed
      )
    )
  }

  async updateProjectScript(
    params: VideoStudioUpdateProjectScriptParams
  ): Promise<VideoStudioUpdateProjectScriptResult> {
    const parsed = VideoStudioUpdateProjectScriptParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, () =>
      commitScriptUpdate(
        this.tx,
        resolveVideoStudioProjectDir(this.profileDir, parsed.projectId),
        parsed.projectId,
        parsed
      )
    )
  }

  async upsertResearchSource(
    params: VideoStudioUpsertResearchSourceParams
  ): Promise<VideoStudioUpsertResearchSourceResult> {
    const parsed = VideoStudioUpsertResearchSourceParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, () =>
      commitResearchSourceUpsert(
        this.tx,
        resolveVideoStudioProjectDir(this.profileDir, parsed.projectId),
        parsed.projectId,
        parsed.source,
        parsed.expectedRevision
      )
    )
  }

  async deleteResearchSource(
    params: VideoStudioDeleteResearchSourceParams
  ): Promise<VideoStudioDeleteResearchSourceResult> {
    const parsed = VideoStudioDeleteResearchSourceParams.parse(params)
    return this.locks.withProjectLock(parsed.projectId, () =>
      commitResearchSourceDelete(
        this.tx,
        resolveVideoStudioProjectDir(this.profileDir, parsed.projectId),
        parsed.projectId,
        parsed.sourceId,
        parsed.expectedRevision
      )
    )
  }

  async addStoryboardFrame(
    params: VideoStudioAddStoryboardFrameParams
  ): Promise<VideoStudioAddStoryboardFrameResult> {
    const parsed = VideoStudioAddStoryboardFrameParams.parse(params)
    return this.mutateStoryboard(parsed.projectId, parsed.expectedRevision, (doc) =>
      applyAddStoryboardFrame(doc, parsed.frame, parsed.insertAtIndex)
    )
  }

  async patchStoryboardFrame(
    params: VideoStudioPatchStoryboardFrameParams
  ): Promise<VideoStudioPatchStoryboardFrameResult> {
    const parsed = VideoStudioPatchStoryboardFrameParams.parse(params)
    return this.mutateStoryboard(parsed.projectId, parsed.expectedRevision, (doc) =>
      applyPatchStoryboardFrame(doc, parsed.sceneId, parsed.patch)
    )
  }

  async deleteStoryboardFrame(
    params: VideoStudioDeleteStoryboardFrameParams
  ): Promise<VideoStudioDeleteStoryboardFrameResult> {
    const parsed = VideoStudioDeleteStoryboardFrameParams.parse(params)
    return this.mutateStoryboard(parsed.projectId, parsed.expectedRevision, (doc) =>
      applyDeleteStoryboardFrame(doc, parsed.sceneId)
    )
  }

  async reorderStoryboardFrames(
    params: VideoStudioReorderStoryboardFramesParams
  ): Promise<VideoStudioReorderStoryboardFramesResult> {
    const parsed = VideoStudioReorderStoryboardFramesParams.parse(params)
    return this.mutateStoryboard(parsed.projectId, parsed.expectedRevision, (doc) =>
      applyReorderStoryboardFrames(doc, parsed.sceneIds)
    )
  }

  private mutateStoryboard<T extends Record<string, unknown>>(
    projectId: string,
    expectedRevision: string | undefined,
    apply: (doc: StoryboardDocument) => { storyboard: StoryboardDocument; result: T }
  ): Promise<T & { storyboard: StoryboardDocument; revision: string }> {
    return this.locks.withProjectLock(projectId, async () => {
      const projectDir = resolveVideoStudioProjectDir(this.profileDir, projectId)
      const disk = await readContainedDisk(projectDir, 'STORYBOARD.md')
      assertExpectedRevision(disk.sha256, expectedRevision)
      const raw = disk.bytes?.toString('utf8') ?? ''
      const eol = raw ? detectLineEnding(raw) : '\n'
      const currentDoc: StoryboardDocument = raw
        ? parseStoryboardMarkdown(raw)
        : { frontmatter: {}, frames: [], lockedSections: [] }
      const { storyboard, result } = apply(currentDoc)
      const formatted = formatStoryboardMarkdown(storyboard, { eol })
      const txRes = await this.tx.runProjectTransaction({
        projectDir,
        projectId,
        operations: [
          { relativePath: 'STORYBOARD.md', content: formatted, expectedSha256: disk.sha256 }
        ]
      })
      return {
        ...result,
        storyboard,
        revision: txRes.revisions['STORYBOARD.md']!
      }
    })
  }
}
