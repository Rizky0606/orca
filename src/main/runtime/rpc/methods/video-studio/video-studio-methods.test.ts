import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { openVideoStudioCatalog } from '../../../../video-studio/video-studio-catalog'
import {
  resolveVideoStudioProjectDir,
  resolveVideoStudioRenderOutputFile
} from '../../../../video-studio/video-studio-composition-paths'
import {
  disposeAllVideoStudioJobManagers,
  openVideoStudioJobManager
} from '../../../../video-studio/video-studio-job-registry'
import { RpcDispatcher } from '../../dispatcher'
import { VIDEO_STUDIO_METHODS } from './video-studio-methods'

const OkEnvelopeSchema = z.object({ ok: z.literal(true), result: z.unknown() })

function expectOkResult<S extends z.ZodTypeAny>(response: unknown, schema: S): z.infer<S> {
  return schema.parse(OkEnvelopeSchema.parse(response).result)
}

const directories: string[] = []

async function host() {
  const path = await mkdtemp(join(tmpdir(), 'orca-video-studio-rpc-'))
  directories.push(path)
  await openVideoStudioJobManager(path, {
    engineDeps: {
      hydrateShellPath: async () => {},
      resolveCommand: async () => null,
      allocateLoopbackPort: async () => 43210,
      runProcess: async () => ({ code: 0, signal: null, stdout: '', stderr: '', timedOut: false }),
      runProcessStreaming: async () => ({
        code: 0,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false
      }),
      spawnPreviewStream: () => ({
        stop: async () => {},
        exited: Promise.resolve(0)
      }),
      statFile: async () => null,
      removeFile: async () => {}
    }
  })
  const groups: {
    id: string
    name: string
    parentPath?: string | null
    createdFrom: string
    tabOrder: number
  }[] = []
  const workspaces: {
    id: string
    projectGroupId: string
    name: string
    folderPath: string
  }[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods need only the dispatch identity, group/folder state, and profile directory.
  const runtime = {
    getRuntimeId: () => 'video-studio-test-host',
    requireStore: () => ({
      getProfileStorageDirectory: () => path,
      getProjectGroups: () => groups,
      getFolderWorkspaces: () => workspaces
    }),
    listVisibleProjectGroups: () => groups,
    listVisibleFolderWorkspaces: () => workspaces,
    createProjectGroup: async (input: {
      name: string
      parentPath?: string | null
      createdFrom?: string
    }) => {
      const group = {
        id: `pg-${groups.length + 1}`,
        name: input.name,
        parentPath: input.parentPath ?? null,
        createdFrom: input.createdFrom ?? 'manual',
        tabOrder: groups.length
      }
      groups.push(group)
      return group
    },
    createFolderWorkspace: async (input: {
      projectGroupId: string
      name?: string
      folderPath?: string | null
    }) => {
      const ws = {
        id: `fw-${workspaces.length + 1}`,
        projectGroupId: input.projectGroupId,
        name: input.name ?? 'Workspace',
        folderPath: input.folderPath ?? ''
      }
      workspaces.push(ws)
      return { folderWorkspace: ws }
    }
  } as unknown as ConstructorParameters<typeof RpcDispatcher>[0]['runtime']
  const dispatcher = new RpcDispatcher({ runtime, methods: VIDEO_STUDIO_METHODS })
  return {
    path,
    file: join(path, 'video-studio-projects.json'),
    call: (method: string, params?: unknown) =>
      dispatcher.dispatch(
        { id: 'video', authToken: 'test', method, params },
        { callerScope: { kind: 'mobile', delegated: true } }
      )
  }
}

afterEach(async () => {
  await disposeAllVideoStudioJobManagers()
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const draft = {
  title: '  Flight paths  ',
  prompt: 'Follow a flock',
  aspectRatio: '16:9',
  durationSeconds: 30,
  workflowStage: 'research'
}

it('isolates durable project mutations between authenticated runtime hosts', async () => {
  const first = await host()
  const second = await host()
  const created = await first.call('videoStudio.createProject', draft)
  expect(created).toMatchObject({
    ok: true,
    result: {
      projectId: expect.any(String),
      projects: [{ title: 'Flight paths', engine: 'hyperframes', fps: 30, renders: [] }],
      invalidRecords: 0
    }
  })
  const [{ id, createdAt }] = JSON.parse(await readFile(first.file, 'utf8'))
  expect(await second.call('videoStudio.listProjects')).toMatchObject({
    ok: true,
    result: { projects: [], invalidRecords: 0 }
  })
  expect(await second.call('videoStudio.deleteProject', { id })).toMatchObject({
    ok: false,
    error: { code: 'video_studio_project_not_found' }
  })
  expect(
    await first.call('videoStudio.updateProject', { id, changes: { durationSeconds: 4 } })
  ).toMatchObject({
    ok: false,
    error: { code: 'invalid_argument' }
  })
  expect(
    await first.call('videoStudio.updateProject', { id, changes: { workflowStage: 'script' } })
  ).toMatchObject({
    ok: true,
    result: { projectId: id, projects: [{ id, createdAt, workflowStage: 'script' }] }
  })
  expect(await first.call('videoStudio.deleteProject', { id })).toMatchObject({
    ok: true,
    result: { projects: [], invalidRecords: 0 }
  })
})

it('reports unreadable catalog without sending parser details or replacing bytes', async () => {
  const runtime = await host()
  await writeFile(runtime.file, 'private invalid bytes')
  const response = await runtime.call('videoStudio.createProject', draft)
  expect(response.ok ? response : response.error).toEqual({
    code: 'video_studio_catalog_unreadable',
    message: 'video_studio_catalog_unreadable'
  })
  expect(await readFile(runtime.file, 'utf8')).toBe('private invalid bytes')
})

it('scaffolds composition and opens FolderWorkspace idempotently without exposing paths', async () => {
  const runtime = await host()
  const created = await runtime.call('videoStudio.createProject', draft)
  const { projectId } = expectOkResult(created, z.object({ projectId: z.string() }))

  const scaffold = await runtime.call('videoStudio.scaffoldComposition', { projectId })
  expect(scaffold).toMatchObject({
    ok: true,
    result: {
      initialized: true,
      entryExists: true,
      files: expect.arrayContaining(['hyperframes.json', 'index.html', 'project.json']),
      previewActive: false
    }
  })
  expect(JSON.stringify(scaffold)).not.toContain(runtime.path)

  const open1 = await runtime.call('videoStudio.openCompositionWorkspace', { projectId })
  const open2 = await runtime.call('videoStudio.openCompositionWorkspace', { projectId })
  expect(open1).toEqual(open2)
  expect(open1).toMatchObject({
    ok: true,
    result: { folderWorkspaceId: 'fw-1', worktreeId: 'folder:fw-1' }
  })
})

it('probes both engines and refuses Remotion execution', async () => {
  const runtime = await host()
  const probe = await runtime.call('videoStudio.probeEngines', {})
  expect(probe).toMatchObject({
    ok: true,
    result: {
      engines: expect.arrayContaining([
        expect.objectContaining({ engine: 'remotion', available: false, status: 'planned' }),
        expect.objectContaining({ engine: 'hyperframes' })
      ])
    }
  })

  const created = await runtime.call('videoStudio.createProject', {
    ...draft,
    engine: 'remotion'
  })
  const { projectId } = expectOkResult(created, z.object({ projectId: z.string() }))
  const renderRes = await runtime.call('videoStudio.startRender', { projectId, quality: 'looks' })
  expect(renderRes).toMatchObject({
    ok: false,
    error: { code: 'video_studio_engine_unavailable' }
  })
})

it('validates render ownership, bounds chunk sizes, and streams exact MP4 bytes', async () => {
  const runtime = await host()
  const created = await runtime.call('videoStudio.createProject', draft)
  const { projectId } = expectOkResult(created, z.object({ projectId: z.string() }))

  expect(
    await runtime.call('videoStudio.readRenderOutputChunk', {
      projectId,
      renderId: 'missing-render',
      offset: 0,
      maxBytes: 1024
    })
  ).toMatchObject({ ok: false, error: { code: 'video_studio_render_not_found' } })

  expect(
    await runtime.call('videoStudio.readRenderOutputChunk', {
      projectId,
      renderId: 'r1',
      offset: 0,
      maxBytes: 512 * 1024 + 1
    })
  ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })

  const projectDir = resolveVideoStudioProjectDir(runtime.path, projectId)
  await mkdir(join(projectDir, 'renders'), { recursive: true })
  const mp4Bytes = Buffer.from('0123456789ABCDEF', 'utf8')
  await writeFile(resolveVideoStudioRenderOutputFile(projectDir, 'r1.mp4'), mp4Bytes)
  const catalog = await openVideoStudioCatalog(runtime.path)
  await catalog.appendRender(projectId, {
    id: 'r1',
    engine: 'hyperframes',
    quality: 'looks',
    fileName: 'r1.mp4',
    durationSeconds: 30,
    width: 1920,
    height: 1080,
    fps: 30,
    sizeBytes: mp4Bytes.length,
    createdAt: 1_700_000_000_000
  })

  const c1 = await runtime.call('videoStudio.readRenderOutputChunk', {
    projectId,
    renderId: 'r1',
    offset: 0,
    maxBytes: 10
  })
  const c2 = await runtime.call('videoStudio.readRenderOutputChunk', {
    projectId,
    renderId: 'r1',
    offset: 10,
    maxBytes: 10
  })
  expect(c1).toMatchObject({
    ok: true,
    result: { totalBytes: 16, nextOffset: 10, eof: false, mimeType: 'video/mp4' }
  })
  expect(c2).toMatchObject({
    ok: true,
    result: { totalBytes: 16, nextOffset: 16, eof: true, mimeType: 'video/mp4' }
  })
  const chunkSchema = z.object({ dataBase64: z.string() })
  const combined = Buffer.concat([
    Buffer.from(expectOkResult(c1, chunkSchema).dataBase64, 'base64'),
    Buffer.from(expectOkResult(c2, chunkSchema).dataBase64, 'base64')
  ])
  expect(combined).toEqual(mp4Bytes)
})
