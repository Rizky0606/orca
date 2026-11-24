import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AtomicSnapshotWriter } from '../persistence/atomic-snapshot-writer'
import { openVideoStudioCatalog } from './video-studio-catalog'

const draft = {
  title: 'Flight paths',
  prompt: 'Follow a flock',
  aspectRatio: '16:9',
  durationSeconds: 30,
  workflowStage: 'research'
} as const
const stored = { ...draft, id: 'saved-project', createdAt: 100, updatedAt: 100 }

let directory: string
const catalogFile = () => join(directory, 'video-studio-projects.json')

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-video-studio-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('keeps concurrent edits durable without sharing mutable snapshots or changing creation time', async () => {
  const catalog = await openVideoStudioCatalog(directory)
  const alias = await openVideoStudioCatalog(join(directory, '.'))
  expect(alias).toBe(catalog)

  const { projectId } = await catalog.create(draft)
  expect(projectId).toMatch(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/)
  const before = (await catalog.list()).projects[0]
  const [first] = await Promise.all([
    catalog.update({ id: projectId, changes: { title: 'A new title' } }),
    alias.update({ id: projectId, changes: { workflowStage: 'script' } })
  ])
  first.projects[0].title = 'Client-side edit only'

  const copy = join(directory, 'reopened')
  await cp(catalogFile(), join(copy, 'video-studio-projects.json'))
  const reopened = await openVideoStudioCatalog(copy)
  const result = (await reopened.list()).projects[0]
  expect(result).toMatchObject({
    id: projectId,
    title: 'A new title',
    workflowStage: 'script',
    createdAt: before.createdAt
  })
  expect(result.updatedAt).toBeGreaterThan(before.updatedAt)
  expect(await reopened.remove({ id: projectId })).toEqual({ projects: [], invalidRecords: 0 })
  expect((await catalog.list()).projects[0].title).toBe('A new title')
})

it('keeps the previous bytes when snapshot publication fails and permits a retry', async () => {
  await writeFile(catalogFile(), JSON.stringify([stored]))
  const catalog = await openVideoStudioCatalog(directory)
  vi.spyOn(AtomicSnapshotWriter.prototype, 'write').mockRejectedValueOnce(new Error('write failed'))
  const update = { id: stored.id, changes: { title: 'New title' } }

  await expect(catalog.update(update)).rejects.toThrow('video_studio_write_failed')
  expect(await catalog.list()).toEqual({ projects: [stored], invalidRecords: 0 })
  expect(await readFile(catalogFile(), 'utf8')).toBe(JSON.stringify([stored]))
  await expect(catalog.update(update)).resolves.toMatchObject({
    projects: [{ title: 'New title' }]
  })
})

it('isolates malformed and duplicate rows while preserving them and unknown fields on disk', async () => {
  const rows = [
    { ...stored, future: { stage: 'render' } },
    { ...stored, id: 'duplicate', title: 'First' },
    { ...stored, id: 'duplicate', title: 'Second' },
    { ...stored, id: 'invalid', title: '' }
  ]
  await writeFile(catalogFile(), JSON.stringify(rows))
  const catalog = await openVideoStudioCatalog(directory)

  expect(await catalog.list()).toEqual({ projects: [stored], invalidRecords: 3 })
  await expect(catalog.remove({ id: 'duplicate' })).rejects.toThrow(
    'video_studio_project_not_found'
  )
  expect(await readFile(catalogFile(), 'utf8')).toBe(JSON.stringify(rows))
  const result = await catalog.update({ id: stored.id, changes: { title: 'Renamed' } })
  expect(result).toMatchObject({ projects: [{ title: 'Renamed' }], invalidRecords: 3 })
  expect(JSON.parse(await readFile(catalogFile(), 'utf8'))).toEqual([
    expect.objectContaining({ id: stored.id, title: 'Renamed', future: { stage: 'render' } }),
    ...rows.slice(1)
  ])
})

it('keeps unreadable catalog bytes intact until the file is repaired', async () => {
  await writeFile(catalogFile(), '{broken')
  const catalog = await openVideoStudioCatalog(directory)

  await expect(catalog.list()).rejects.toThrow('video_studio_catalog_unreadable')
  await expect(catalog.create(draft)).rejects.toThrow('video_studio_catalog_unreadable')
  expect(await readFile(catalogFile(), 'utf8')).toBe('{broken')
  await writeFile(catalogFile(), '[]')
  await expect(catalog.create(draft)).resolves.toMatchObject({
    projects: [{ title: 'Flight paths' }]
  })
})
