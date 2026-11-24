import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  normalizeVideoStudioProject,
  VideoStudioProjectSchema,
  type VideoStudioProject
} from '../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCreateProjectParams,
  VideoStudioDeleteProjectParams,
  VideoStudioListProjectsResult,
  VideoStudioUpdateProjectParams
} from '../../shared/video-studio/video-studio-rpc-contract'
import { AtomicSnapshotWriter } from '../persistence/atomic-snapshot-writer'

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

  constructor(private readonly file: string) {
    this.writer = new AtomicSnapshotWriter(() => file, { fileMode: 0o600 })
  }

  list(): Promise<VideoStudioListProjectsResult> {
    return this.lane.then(async () => snapshot(await readRows(this.file)))
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
        createdAt: project.createdAt,
        updatedAt: Math.max(Date.now(), project.updatedAt + 1)
      })
      const raw = rows[index]
      rows[index] = { ...(typeof raw === 'object' && raw !== null ? raw : {}), ...updated }
      return { projectId: id }
    })
  }

  remove({ id }: VideoStudioDeleteProjectParams) {
    return this.mutate((rows) => {
      const entry = indexProjects(rows).get(id)
      if (!entry) {
        throw new Error('video_studio_project_not_found')
      }
      rows.splice(entry.index, 1)
      return {}
    })
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
    catalog = new VideoStudioCatalog(join(directory, 'video-studio-projects.json'))
    catalogs.set(directory, catalog)
  }
  return catalog
}
