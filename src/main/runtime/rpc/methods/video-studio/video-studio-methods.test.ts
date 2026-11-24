import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { RpcDispatcher } from '../../dispatcher'
import { VIDEO_STUDIO_METHODS } from './video-studio-methods'

const directories: string[] = []

async function host() {
  const path = await mkdtemp(join(tmpdir(), 'orca-video-studio-rpc-'))
  directories.push(path)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods need only the dispatch identity and profile directory.
  const runtime = {
    getRuntimeId: () => 'video-studio-test-host',
    requireStore: () => ({ getProfileStorageDirectory: () => path })
  } as unknown as ConstructorParameters<typeof RpcDispatcher>[0]['runtime']
  const dispatcher = new RpcDispatcher({ runtime, methods: VIDEO_STUDIO_METHODS })
  return {
    file: join(path, 'video-studio-projects.json'),
    call: (method: string, params?: unknown) =>
      dispatcher.dispatch(
        { id: 'video', authToken: 'test', method, params },
        { callerScope: { kind: 'mobile', delegated: true } }
      )
  }
}

afterEach(async () => {
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
      projects: [{ title: 'Flight paths' }],
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
  expect(await first.call('videoStudio.listProjects')).toMatchObject({
    ok: true,
    result: { projects: [{ id, createdAt, durationSeconds: 30, workflowStage: 'research' }] }
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
