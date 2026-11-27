import { videoStudioDimensionsForAspectRatio } from '../../../shared/video-studio/video-studio-project'
import { StoryboardDocumentSchema } from '../../../shared/video-studio/video-studio-storyboard-contract'
import type { StyleProfile } from '../../../shared/video-studio/video-studio-style-contract'
import type {
  DeepResearchJob,
  GeneralChatHandoffVideoStudioParams,
  GeneralChatSource
} from '../../../shared/general-chat/general-chat-research-contract'
import { readContainedDisk } from '../../video-studio/documents/project-research-documents'
import {
  formatStoryboardMarkdown,
  parseStoryboardMarkdown,
  syncResearchNotesMarkdown,
  updateBriefMarkdown
} from '../../video-studio/documents/video-studio-markdown-sync'
import { computeProjectInputFingerprint } from '../../video-studio/engines/project-input-fingerprint'
import { getBuiltinStylePreset } from '../../video-studio/style/builtin-style-presets'
import { openVideoStudioCatalog } from '../../video-studio/video-studio-catalog'
import { resolveVideoStudioProjectDir } from '../../video-studio/video-studio-composition-paths'
import { scaffoldHyperFramesComposition } from '../../video-studio/video-studio-hyperframes-template'
import { openVideoStudioJobManager } from '../../video-studio/video-studio-job-registry'
import { GeneralChatResearchJobStore } from './general-chat-research-job-store'
import { openGeneralChatDeepResearchManager } from './general-chat-research-registry'
import { GeneralChatSourceStore } from './general-chat-source-store'
import {
  buildDraftStoryboardFrames,
  extractDraftBeats,
  formatHandoffSourcesBlock,
  mapResearchSources
} from './general-chat-video-handoff-seeds'

async function resolveSelectedStyle(
  profileDir: string,
  styleProfileId?: string
): Promise<StyleProfile> {
  const manager = await openVideoStudioJobManager(profileDir)
  const targetId = styleProfileId ?? 'technical-explainer-01'
  const builtin = getBuiltinStylePreset(targetId)
  if (builtin) {
    return builtin
  }
  const listed = await manager.styleStore.listStyleProfiles()
  const found = listed.profiles.find((p) => p.id === targetId)
  if (!found) {
    throw new Error('video_studio_style_not_found')
  }
  return found
}

/** Creates a modular v2 Video Studio project from General Chat research findings and sources. */
export async function handoffGeneralChatToVideoStudio(
  profileDir: string,
  params: GeneralChatHandoffVideoStudioParams
): Promise<{ projectId: string }> {
  const resolvedStyle = await resolveSelectedStyle(profileDir, params.styleProfileId)
  const sourceStore = new GeneralChatSourceStore(profileDir)
  let title = params.title?.trim() ?? ''
  let briefBody = params.briefMarkdown?.trim() ?? ''
  let sources: GeneralChatSource[] = []
  let job: DeepResearchJob | null = null

  if (params.jobId) {
    job = await new GeneralChatResearchJobStore(profileDir).get(params.jobId)
    if (job) {
      if (!title) {
        title = job.topic.slice(0, 120)
      }
      if (!briefBody && job.reportMarkdown) {
        briefBody = job.reportMarkdown
      }
      sources = await sourceStore.listJobSources(job.id)
    }
  }
  if (sources.length === 0 && params.sessionId) {
    sources = await sourceStore.listSessionSources(params.sessionId)
  }
  if (!title) {
    title = sources[0]?.title.slice(0, 120) || 'General Chat Video Brief'
  }

  const baseGoal =
    briefBody ||
    `Create an engaging explainer video about "${title}" grounded in the verified sources below.`
  const prompt = [baseGoal, formatHandoffSourcesBlock(sources)]
    .filter(Boolean)
    .join('\n')
    .slice(0, 50_000)

  const catalog = await openVideoStudioCatalog(profileDir)
  const created = await catalog.create({
    title,
    prompt,
    aspectRatio: params.aspectRatio,
    durationSeconds: params.durationSeconds,
    workflowStage: briefBody ? 'script' : 'research',
    engine: params.engine,
    fps: 30,
    ...(params.styleProfileId ? { styleProfileId: params.styleProfileId } : {})
  })
  const project = await catalog.get(created.projectId)
  if (!project) {
    throw new Error('video_studio_project_not_found')
  }

  const manager = await openVideoStudioJobManager(profileDir)
  const projectDir = resolveVideoStudioProjectDir(profileDir, project.id)
  await manager.watcher.suppressDuring(project.id, projectDir, async () => {
    await scaffoldHyperFramesComposition(projectDir, project, { styleProfileId: resolvedStyle.id })
    if (params.styleProfileId) {
      await manager.styleStore.applyStyleProfileToProject({
        projectId: project.id,
        styleId: params.styleProfileId
      })
    }

    const mappedSources = mapResearchSources(sources, job)
    const frames = buildDraftStoryboardFrames(
      project,
      extractDraftBeats(title, briefBody, job),
      resolvedStyle
    )
    const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
    const inlineMessage = baseGoal.replace(/\s+/g, ' ').trim().slice(0, 240)
    const storyboardMd = formatStoryboardMarkdown({
      frontmatter: {
        format: `${width}x${height}`,
        duration: `${project.durationSeconds}s`,
        message: inlineMessage,
        arc: 'Hook -> Context -> Evidence -> Conclusion',
        audience: 'General viewers',
        styleProfile: resolvedStyle.id
      },
      frames,
      lockedSections: []
    })
    StoryboardDocumentSchema.parse(parseStoryboardMarkdown(storyboardMd))

    const scriptMd = [
      `# Narration Script — ${title}`,
      '',
      ...frames.flatMap((f) => [
        `## Frame ${f.frameNumber} — ${f.title}`,
        '',
        `_Add timed voiceover narration for \`${f.sceneId}\` here._`,
        ''
      ])
    ].join('\n')

    await manager.locks.withProjectLock(project.id, async () => {
      const [briefDisk, sbDisk, scriptDisk, srcDisk, notesDisk] = await Promise.all([
        readContainedDisk(projectDir, 'BRIEF.md'),
        readContainedDisk(projectDir, 'STORYBOARD.md'),
        readContainedDisk(projectDir, 'SCRIPT.md'),
        readContainedDisk(projectDir, 'references/sources.json'),
        readContainedDisk(projectDir, 'references/research-notes.md')
      ])
      const nextBrief = updateBriefMarkdown(`# Brief — ${title}\n\n## Core Goal\n\n${baseGoal}\n`, {
        frontmatter: {
          title,
          aspect_ratio: project.aspectRatio,
          duration: `${project.durationSeconds}s`,
          fps: project.fps,
          engine: project.engine,
          style_profile: resolvedStyle.id,
          message: inlineMessage,
          handoff_source: 'general-chat',
          sources_count: mappedSources.length,
          ...(job ? { research_job_id: job.id } : {})
        }
      })
      const nextNotes = syncResearchNotesMarkdown(
        `# Research Notes — ${title}\n\n${baseGoal}\n`,
        mappedSources,
        title
      )
      await manager.tx.runProjectTransaction({
        projectDir,
        projectId: project.id,
        operations: [
          { relativePath: 'BRIEF.md', content: nextBrief, expectedSha256: briefDisk.sha256 },
          { relativePath: 'STORYBOARD.md', content: storyboardMd, expectedSha256: sbDisk.sha256 },
          { relativePath: 'SCRIPT.md', content: scriptMd, expectedSha256: scriptDisk.sha256 },
          {
            relativePath: 'references/sources.json',
            content: `${JSON.stringify({ schemaVersion: 1, sources: mappedSources }, null, 2)}\n`,
            expectedSha256: srcDisk.sha256
          },
          {
            relativePath: 'references/research-notes.md',
            content: nextNotes,
            expectedSha256: notesDisk.sha256
          }
        ]
      })
    })
  })

  if (project.engine === 'hyperframes') {
    const live = await computeProjectInputFingerprint(projectDir)
    await manager.trustStore.approveProjectExecution({
      projectId: project.id,
      projectDir,
      trustState: 'approved-render',
      inputFingerprint: live.inputFingerprint
    })
  }

  if (params.jobId) {
    const researchManager = await openGeneralChatDeepResearchManager(profileDir)
    await researchManager.markHandoffProject(params.jobId, created.projectId).catch(() => undefined)
  }

  return { projectId: created.projectId }
}
