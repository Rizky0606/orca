import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  StoryboardDocumentSchema,
  VideoStudioResearchSourceSchema
} from '../../../shared/video-studio/video-studio-storyboard-contract'
import { parseStoryboardMarkdown } from '../../video-studio/documents/video-studio-markdown-sync'
import { VideoStudioStyleStore } from '../../video-studio/style/video-studio-style-store'
import { openVideoStudioCatalog } from '../../video-studio/video-studio-catalog'
import { resolveVideoStudioProjectDir } from '../../video-studio/video-studio-composition-paths'
import { disposeAllVideoStudioJobManagers } from '../../video-studio/video-studio-job-registry'
import { GeneralChatResearchJobStore } from './general-chat-research-job-store'
import { GeneralChatSourceStore } from './general-chat-source-store'
import { handoffGeneralChatToVideoStudio } from './general-chat-video-handoff'

let profileDir: string

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), 'orca-gc-vs-handoff-'))
})

afterEach(async () => {
  await disposeAllVideoStudioJobManagers()
  await rm(profileDir, { recursive: true, force: true })
})

it('scaffolds modular v2 project with BRIEF, STORYBOARD Frame N, sources.json, research-notes.md, and built-in styleProfileId', async () => {
  const jobStore = new GeneralChatResearchJobStore(profileDir)
  const sourceStore = new GeneralChatSourceStore(profileDir)

  await sourceStore.appendJobSources('job-handoff-1', [
    {
      id: 'src-verified-1',
      sessionId: 'sess-1',
      query: 'how heat pumps move heat',
      url: 'https://energy.gov/heat-pumps',
      title: 'DOE Heat Pump Guide',
      domain: 'energy.gov',
      snippet: 'Heat pumps transfer heat using refrigerant phase changes.',
      extractedText: 'Detailed thermodynamic cycle explanation across evaporator and condenser.',
      provider: 'duckduckgo',
      origin: 'deep-research',
      jobId: 'job-handoff-1',
      fetchedAt: 1_700_000_010_000
    },
    {
      id: 'src-unverified-2',
      sessionId: 'sess-1',
      query: 'refrigerant pressure',
      url: 'https://example.org/pressure',
      title: 'Refrigerant Pressure Notes',
      domain: 'example.org',
      snippet: 'Higher compression raises boiling temperature.',
      provider: 'duckduckgo',
      origin: 'web-search',
      jobId: 'job-handoff-1',
      fetchedAt: 1_700_000_020_000
    }
  ])

  await jobStore.upsert({
    id: 'job-handoff-1',
    sessionId: 'sess-1',
    topic: 'How Heat Pumps Work',
    providerPreference: 'duckduckgo',
    status: 'completed',
    steps: [
      {
        id: 'step-1',
        title: 'Evaporator Absorption',
        query: 'heat pump evaporator',
        status: 'completed',
        sourceIds: ['src-verified-1'],
        note: 'Cold refrigerant absorbs indoor heat.'
      },
      {
        id: 'step-2',
        title: 'Compression & Condensation',
        query: 'heat pump compressor',
        status: 'completed',
        sourceIds: ['src-unverified-2'],
        note: 'Compressor raises pressure to reject heat outside.'
      }
    ],
    currentStepIndex: 2,
    queriesExecuted: 2,
    sourcesCollected: 2,
    pagesRead: 1,
    citationIds: ['src-verified-1', 'src-unverified-2'],
    reportMarkdown: [
      '# How Heat Pumps Work',
      '',
      '## Evaporator Cycle',
      'Low-pressure liquid refrigerant absorbs ambient thermal energy inside the evaporator.',
      '',
      '## Compressor & Rejection',
      'Compressing the vapor raises temperature so heat flows out at the condenser.'
    ].join('\n'),
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_030_000
  })

  const { projectId } = await handoffGeneralChatToVideoStudio(profileDir, {
    jobId: 'job-handoff-1',
    aspectRatio: '9:16',
    durationSeconds: 30,
    engine: 'hyperframes',
    styleProfileId: 'clean-editorial-01'
  } as Parameters<typeof handoffGeneralChatToVideoStudio>[1])

  const catalog = await openVideoStudioCatalog(profileDir)
  const project = await catalog.get(projectId)
  expect(project).toMatchObject({
    title: 'How Heat Pumps Work',
    aspectRatio: '9:16',
    durationSeconds: 30,
    workflowStage: 'script',
    styleProfileId: 'clean-editorial-01'
  })

  const projectDir = resolveVideoStudioProjectDir(profileDir, projectId)
  const [hyperframesRaw, briefRaw, storyboardRaw, sourcesRaw, notesRaw, styleRaw] =
    await Promise.all([
      readFile(join(projectDir, 'hyperframes.json'), 'utf8'),
      readFile(join(projectDir, 'BRIEF.md'), 'utf8'),
      readFile(join(projectDir, 'STORYBOARD.md'), 'utf8'),
      readFile(join(projectDir, 'references', 'sources.json'), 'utf8'),
      readFile(join(projectDir, 'references', 'research-notes.md'), 'utf8'),
      readFile(join(projectDir, 'styles', 'style-profile.json'), 'utf8')
    ])

  expect(JSON.parse(hyperframesRaw)).toMatchObject({
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }
  })
  expect(briefRaw).toContain('clean-editorial-01')
  expect(briefRaw).toContain('Evaporator Cycle')

  expect(storyboardRaw).toContain('## Frame 1 —')
  expect(storyboardRaw).toContain('## Frame 2 —')
  const storyboard = StoryboardDocumentSchema.parse(parseStoryboardMarkdown(storyboardRaw))
  expect(storyboard.frames.length).toBeGreaterThanOrEqual(2)
  expect(storyboard.frontmatter.styleProfile).toBe('clean-editorial-01')

  const parsedSources = JSON.parse(sourcesRaw) as {
    schemaVersion: number
    sources: unknown[]
  }
  expect(parsedSources.schemaVersion).toBe(1)
  expect(parsedSources.sources).toHaveLength(2)
  const validatedSources = parsedSources.sources.map((s) =>
    VideoStudioResearchSourceSchema.parse(s)
  )
  expect(validatedSources.find((s) => s.id === 'src-verified-1')).toMatchObject({
    id: 'src-verified-1',
    origin: 'deep-research',
    verificationStatus: 'verified',
    claimIds: ['step-1']
  })
  expect(validatedSources.find((s) => s.id === 'src-unverified-2')).toMatchObject({
    id: 'src-unverified-2',
    origin: 'general-chat-search',
    verificationStatus: 'unverified',
    claimIds: ['step-2']
  })

  expect(notesRaw).toContain('Evaporator Cycle')
  expect(notesRaw).toContain('DOE Heat Pump Guide')
  expect(JSON.parse(styleRaw)).toMatchObject({ id: 'clean-editorial-01' })
})

it('applies custom Host Library styleProfileId and rejects unknown styleProfileId cleanly', async () => {
  const styleStore = new VideoStudioStyleStore(profileDir)
  await styleStore.duplicateStyleProfile({
    sourceStyleId: 'technical-explainer-01',
    newStyleId: 'brand-heat-pack',
    name: 'Brand Heat Pack'
  })

  await expect(
    handoffGeneralChatToVideoStudio(profileDir, {
      title: 'Bad style',
      aspectRatio: '16:9',
      durationSeconds: 20,
      engine: 'hyperframes',
      styleProfileId: 'does-not-exist'
    } as Parameters<typeof handoffGeneralChatToVideoStudio>[1])
  ).rejects.toThrow('video_studio_style_not_found')

  const catalog = await openVideoStudioCatalog(profileDir)
  expect((await catalog.list()).projects).toHaveLength(0)

  const { projectId } = await handoffGeneralChatToVideoStudio(profileDir, {
    title: 'Thermal Conductivity',
    briefMarkdown: 'Explain Fourier conduction with copper vs air.',
    aspectRatio: '16:9',
    durationSeconds: 24,
    engine: 'hyperframes',
    styleProfileId: 'brand-heat-pack'
  } as Parameters<typeof handoffGeneralChatToVideoStudio>[1])

  const projectDir = resolveVideoStudioProjectDir(profileDir, projectId)
  const projectStyle = JSON.parse(
    await readFile(join(projectDir, 'styles', 'style-profile.json'), 'utf8')
  ) as { id: string; sourceTier?: string }
  expect(projectStyle.id).toBe('brand-heat-pack')
})
