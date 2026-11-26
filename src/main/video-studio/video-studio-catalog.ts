import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  normalizeVideoStudioProject,
  VideoStudioProjectSchema,
  VideoStudioRenderRecordSchema,
  type VideoStudioProject,
  type VideoStudioRenderRecord
} from '../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCreateProjectParams,
  VideoStudioDeleteProjectParams,
  VideoStudioListProjectsResult,
  VideoStudioUpdateProjectParams,
  VideoStudioUpdateProjectResult
} from '../../shared/video-studio/video-studio-rpc-contract'
import { AtomicSnapshotWriter } from '../persistence/atomic-snapshot-writer'
import { resolveVideoStudioProjectDir } from './video-studio-composition-paths'

type CatalogEntry = { project: VideoStudioProject; index: number }

function indexProjects(rows: readonly unknown[]): Map<string, CatalogEntry | null> {
  const entries = new Map<string, CatalogEntry | null>()
  rows.forEach((row, index) => {
    const project = normalizeVideoStudioProject(row)
    if (project) {
      entries.set(project.id, entries.has(project.id) ? null : { project, index })
    }
  })
  return entries
}

function snapshot(rows: readonly unknown[]): VideoStudioListProjectsResult {
  const projects = [...indexProjects(rows).values()].flatMap((entry) =>
    entry ? [entry.project] : []
  )
  return { projects, invalidRecords: rows.length - projects.length }
}

async function readRows(file: string): Promise<unknown[]> {
  try {
    const rows: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!Array.isArray(rows)) {
      throw new Error('Expected an array of project records')
    }
    return rows
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw new Error('video_studio_catalog_unreadable', { cause: error })
  }
}

class VideoStudioCatalog {
  private lane: Promise<void> = Promise.resolve()
  private readonly writer: AtomicSnapshotWriter

  constructor(
    private readonly file: string,
    private readonly profileDir: string
  ) {
    this.writer = new AtomicSnapshotWriter(() => file, { fileMode: 0o600 })
  }

  list(): Promise<VideoStudioListProjectsResult> {
    return this.lane.then(async () => snapshot(await readRows(this.file)))
  }

  get(id: string): Promise<VideoStudioProject | null> {
    return this.lane.then(async () => {
      const entry = indexProjects(await readRows(this.file)).get(id)
      return entry ? entry.project : null
    })
  }

  create(input: VideoStudioCreateProjectParams) {
    return this.mutate((rows) => {
      const projectId = randomUUID()
      const now = Date.now()
      rows.push(
        VideoStudioProjectSchema.parse({ ...input, id: projectId, createdAt: now, updatedAt: now })
      )
      return { projectId }
    })
  }

  update({ id, changes }: VideoStudioUpdateProjectParams) {
    return this.mutate((rows) => {
      const entry = indexProjects(rows).get(id)
      if (!entry) {
        throw new Error('video_studio_project_not_found')
      }
      const { index, project } = entry
      const updated = VideoStudioProjectSchema.parse({
        ...project,
        ...changes,
        id,
        renders: project.renders,
        createdAt: project.createdAt,
        updatedAt: Math.max(Date.now(), project.updatedAt + 1)
      })
      const raw = rows[index]
      rows[index] = { ...(typeof raw === 'object' && raw !== null ? raw : {}), ...updated }
      return { projectId: id }
    })
  }

  appendRender(
    projectId: string,
    record: VideoStudioRenderRecord
  ): Promise<VideoStudioUpdateProjectResult> {
    const validRecord = VideoStudioRenderRecordSchema.parse(record)
    return this.mutate((rows) => {
      const entry = indexProjects(rows).get(projectId)
      if (!entry) {
        throw new Error('video_studio_project_not_found')
      }
      const { index, project } = entry
      const updated = VideoStudioProjectSchema.parse({
        ...project,
        renders: [...project.renders, validRecord],
        createdAt: project.createdAt,
        updatedAt: Math.max(Date.now(), project.updatedAt + 1)
      })
      const raw = rows[index]
      rows[index] = { ...(typeof raw === 'object' && raw !== null ? raw : {}), ...updated }
      return { projectId }
    })
  }

  async remove({ id }: VideoStudioDeleteProjectParams) {
    const result = await this.mutate((rows) => {
      const entry = indexProjects(rows).get(id)
      if (!entry) {
        throw new Error('video_studio_project_not_found')
      }
      rows.splice(entry.index, 1)
      return {}
    })
    try {
      const projectDir = resolveVideoStudioProjectDir(this.profileDir, id)
      await rm(projectDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    } catch {
      // Best-effort cleanup after atomic catalog deletion
    }
    return result
  }

  private mutate<T>(apply: (rows: unknown[]) => T): Promise<VideoStudioListProjectsResult & T> {
    const mutation = this.lane.then(async () => {
      const rows = await readRows(this.file)
      const result = apply(rows)
      try {
        await this.writer.write(() => JSON.stringify(rows))
      } catch (error) {
        throw new Error('video_studio_write_failed', { cause: error })
      }
      return { ...snapshot(rows), ...result }
    })
    this.lane = mutation.then(
      () => {},
      () => {}
    )
    return mutation
  }
}

const catalogs = new Map<string, VideoStudioCatalog>()

export type { VideoStudioCatalog }

export async function openVideoStudioCatalog(userDataPath: string): Promise<VideoStudioCatalog> {
  const directory = await mkdir(userDataPath, { recursive: true, mode: 0o700 })
    .then(() => realpath(userDataPath))
    .catch((error) => {
      throw new Error('video_studio_catalog_unreadable', { cause: error })
    })
  let catalog = catalogs.get(directory)
  if (!catalog) {
    catalog = new VideoStudioCatalog(join(directory, 'video-studio-projects.json'), directory)
    catalogs.set(directory, catalog)
  }
  return catalog
}
