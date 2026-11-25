import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { openVideoStudioCatalog } from '../../video-studio/video-studio-catalog'
import { GeneralChatWebSearchService } from '../search/general-chat-web-search-service'
import {
  SearchProviderKeyStore,
  type SearchKeyBackingStore
} from '../search/search-provider-key-store'
import { GeneralChatDeepResearchManager } from './general-chat-deep-research-runner'
import { GeneralChatResearchJobStore } from './general-chat-research-job-store'
import {
  GENERAL_CHAT_INVALID_JOB_ID_CODE,
  GENERAL_CHAT_INVALID_SESSION_ID_CODE,
  resolveGeneralChatResearchJobDir,
  resolveGeneralChatSessionSourcesFile
} from './general-chat-research-paths'
import { GeneralChatSourceStore } from './general-chat-source-store'
import { handoffGeneralChatToVideoStudio } from './general-chat-video-handoff'

const tempDirs: string[] = []

async function createTempProfileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-gc-research-'))
  tempDirs.push(dir)
  return dir
}

function emptyKeyStore(): SearchProviderKeyStore {
  const mem: SearchKeyBackingStore = {
    read: async () => null,
    write: async () => undefined,
    clear: async () => undefined
  }
  return new SearchProviderKeyStore(mem)
}

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

it('blocks path traversal across source and research job storage paths', () => {
  expect(() => resolveGeneralChatSessionSourcesFile('/tmp/profile', '../bad')).toThrow(
    GENERAL_CHAT_INVALID_SESSION_ID_CODE
  )
  expect(() => resolveGeneralChatResearchJobDir('/tmp/profile', 'sub/dir')).toThrow(
    GENERAL_CHAT_INVALID_JOB_ID_CODE
  )
})

it('recovers interrupted active jobs as paused and resumes only pending steps to completion', async () => {
  const profileDir = await createTempProfileDir()
  const executedQueries: string[] = []

  const fetchMock: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('https://html.duckduckgo.com/')) {
      const q = new URL(url).searchParams.get('q') ?? ''
      executedQueries.push(q)
      const encoded = encodeURIComponent(`https://example.com/${executedQueries.length}`)
      return new Response(
        `<a class="result__a" href="https://duckduckgo.com/l/?uddg=${encoded}">Result ${executedQueries.length}</a>
         <a class="result__snippet">Evidence for ${q}</a>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    }
    if (url.startsWith('https://example.com/')) {
      return new Response('<html><body><p>Verified detail paragraph.</p></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })
    }
    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  const jobStore = new GeneralChatResearchJobStore(profileDir)
  const seeded = await jobStore.upsert({
    id: 'job-interrupted',
    sessionId: 'sess-alpha',
    topic: 'Distributed storage engines',
    providerPreference: 'duckduckgo',
    status: 'searching',
    steps: [
      {
        id: 'step-1',
        title: 'Overview',
        query: 'distributed storage overview',
        status: 'completed',
        sourceIds: []
      },
      {
        id: 'step-2',
        title: 'Consistency model',
        query: 'distributed storage consistency model',
        status: 'running',
        sourceIds: []
      }
    ],
    currentStepIndex: 1,
    queriesExecuted: 1,
    sourcesCollected: 0,
    pagesRead: 0,
    citationIds: [],
    createdAt: 1000,
    updatedAt: 1000
  })
  expect(seeded.id).toBe('job-interrupted')

  // Simulate process restart with a fresh job store + manager
  const freshStore = new GeneralChatResearchJobStore(profileDir)
  const searchService = new GeneralChatWebSearchService({
    keyStore: emptyKeyStore(),
    fetchImpl: fetchMock,
    lookup: publicLookup
  })
  const manager = new GeneralChatDeepResearchManager(profileDir, {
    searchService,
    jobStore: freshStore,
    sourceStore: new GeneralChatSourceStore(profileDir)
  })

  const recovered = await freshStore.get('job-interrupted')
  expect(recovered?.status).toBe('paused')
  expect(recovered?.steps[1]?.status).toBe('pending')

  const done = await new Promise<Awaited<ReturnType<typeof manager.getJobWithCitations>>>(
    (resolve, reject) => {
      const stop = manager.subscribe(() => {
        void manager
          .getJobWithCitations('job-interrupted')
          .then((detail) => {
            if (detail.job.status === 'completed' || detail.job.status === 'failed') {
              stop()
              resolve(detail)
            }
          })
          .catch(reject)
      })
      void manager.resume('job-interrupted').catch(reject)
    }
  )

  expect(done.job.status).toBe('completed')
  expect(executedQueries).toEqual(['distributed storage consistency model'])
  expect(done.job.reportMarkdown).toContain('Distributed storage engines')
  expect(done.citations.length).toBeGreaterThan(0)

  const reportOnDisk = await readFile(
    join(profileDir, 'general-chat', 'research', 'job-interrupted', 'report.md'),
    'utf8'
  )
  expect(reportOnDisk).toContain('## Sources')

  // Hand off completed research into Video Studio catalog
  const handoff = await handoffGeneralChatToVideoStudio(profileDir, {
    jobId: 'job-interrupted',
    aspectRatio: '16:9',
    durationSeconds: 45,
    engine: 'hyperframes'
  })
  const catalog = await openVideoStudioCatalog(profileDir)
  const createdProject = await catalog.get(handoff.projectId)
  expect(createdProject).toMatchObject({
    title: 'Distributed storage engines',
    workflowStage: 'script',
    engine: 'hyperframes',
    durationSeconds: 45
  })
  expect(createdProject?.prompt).toContain('Verified Sources')
  await manager.dispose()
})
