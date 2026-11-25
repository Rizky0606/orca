import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  VideoStudioProject,
  VideoStudioRenderRecord
} from '../../shared/video-studio/video-studio-project'
import type { VideoRenderEngineAdapter } from './engines/video-render-engine'
import { openVideoStudioCatalog } from './video-studio-catalog'
import {
  disposeAllVideoStudioJobManagers,
  openVideoStudioJobManager
} from './video-studio-job-registry'

const sampleProject = (
  id: string,
  overrides: Partial<VideoStudioProject> = {}
): VideoStudioProject => ({
  id,
  title: `Project ${id}`,
  prompt: 'Motion clip',
  aspectRatio: '16:9',
  durationSeconds: 30,
  workflowStage: 'production',
  engine: 'hyperframes',
  fps: 30,
  renders: [],
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides
})

let profileDir: string

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), 'orca-vs-jobs-'))
})

afterEach(async () => {
  await disposeAllVideoStudioJobManagers()
  await rm(profileDir, { recursive: true, force: true })
})

describe('VideoStudioJobManager', () => {
  it('enforces single active job per project while allowing distinct projects concurrently', async () => {
    const blockers = new Map<string, () => void>()
    const adapter: VideoRenderEngineAdapter = {
      id: 'hyperframes',
      probeEnvironment: vi.fn(),
      scaffoldProject: vi.fn().mockResolvedValue({
        initialized: true,
        entryExists: true,
        files: ['hyperframes.json', 'index.html'],
        previewActive: false
      }),
      checkProject: vi.fn(),
      startPreview: vi.fn(),
      renderProject: vi.fn((_dir, req) => {
        return new Promise<VideoStudioRenderRecord>((resolve) => {
          blockers.set(req.project.id, () =>
            resolve({
              id: req.renderId,
              engine: 'hyperframes',
              quality: req.quality,
              fileName: req.fileName,
              durationSeconds: 30,
              width: 1920,
              height: 1080,
              fps: 30,
              sizeBytes: 1000,
              createdAt: 1_700_000_000_000
            })
          )
        })
      })
    }

    const catalog = await openVideoStudioCatalog(profileDir)
    const { projectId: p1 } = await catalog.create({
      title: 'One',
      prompt: '',
      aspectRatio: '16:9',
      durationSeconds: 30,
      workflowStage: 'production',
      engine: 'hyperframes',
      fps: 30
    })
    const { projectId: p2 } = await catalog.create({
      title: 'Two',
      prompt: '',
      aspectRatio: '16:9',
      durationSeconds: 30,
      workflowStage: 'production',
      engine: 'hyperframes',
      fps: 30
    })

    const manager = await openVideoStudioJobManager(profileDir, {
      catalog,
      getAdapter: () => adapter
    })

    await manager.startRender(sampleProject(p1), 'looks')
    await expect(manager.startRender(sampleProject(p1), 'looks')).rejects.toThrow(
      'video_studio_job_already_running'
    )
    // Distinct project succeeds immediately
    await expect(manager.startRender(sampleProject(p2), 'draft')).resolves.toMatchObject({
      projectId: p2,
      status: 'rendering'
    })

    blockers.get(p1)?.()
    blockers.get(p2)?.()
  })

  it('aborts active render, bumps revision clock, and bounds log buffer at 100 lines', async () => {
    const abortSignals: AbortSignal[] = []
    let release!: () => void
    const adapter: VideoRenderEngineAdapter = {
      id: 'hyperframes',
      probeEnvironment: vi.fn(),
      scaffoldProject: vi.fn().mockResolvedValue({
        initialized: true,
        entryExists: true,
        files: [],
        previewActive: false
      }),
      checkProject: vi.fn(),
      startPreview: vi.fn(),
      renderProject: vi.fn(async (_dir, _req, _deps, onProgress, signal) => {
        if (signal) {
          abortSignals.push(signal)
        }
        for (let i = 1; i <= 150; i++) {
          onProgress({ logLine: `line-${i}`, progressPercent: 50 })
        }
        await new Promise<void>((resolve) => {
          release = resolve
          signal?.addEventListener('abort', () => resolve(), { once: true })
        })
        throw new Error('video_studio_render_cancelled')
      })
    }

    const catalog = await openVideoStudioCatalog(profileDir)
    const manager = await openVideoStudioJobManager(profileDir, {
      catalog,
      getAdapter: () => adapter
    })
    const revBefore = manager.revisions.next()

    await manager.startRender(sampleProject('p-log'), 'looks')
    await vi.waitFor(() => expect(adapter.renderProject).toHaveBeenCalled())

    const snapWhileRunning = manager.getJobSnapshot('p-log')
    expect(snapWhileRunning?.logLines).toHaveLength(100)
    expect(snapWhileRunning?.logLines[0]).toBe('line-51')
    expect(snapWhileRunning?.logLines[99]).toBe('line-150')

    const cancelled = await manager.cancelProjectWork('p-log')
    release?.()
    expect(abortSignals[0]?.aborted).toBe(true)
    expect(cancelled?.status).toBe('cancelled')
    expect(manager.revisions.next()).toBeGreaterThan(revBefore)
  })

  it('persists VideoStudioRenderRecord on completion and stops previews on disposeAll', async () => {
    const stopPreview = vi.fn().mockResolvedValue(undefined)
    const adapter: VideoRenderEngineAdapter = {
      id: 'hyperframes',
      probeEnvironment: vi.fn(),
      scaffoldProject: vi.fn().mockResolvedValue({
        initialized: true,
        entryExists: true,
        files: [],
        previewActive: false
      }),
      checkProject: vi.fn(),
      startPreview: vi.fn().mockResolvedValue({
        state: { active: true, url: 'http://127.0.0.1:4100/#project/', port: 4100 },
        stop: stopPreview
      }),
      renderProject: vi.fn(async (_dir, req) => ({
        id: req.renderId,
        engine: 'hyperframes' as const,
        quality: req.quality,
        fileName: req.fileName,
        durationSeconds: 30,
        width: 1920,
        height: 1080,
        fps: 30,
        sizeBytes: 4096,
        createdAt: 12345
      }))
    }

    const catalog = await openVideoStudioCatalog(profileDir)
    const { projectId } = await catalog.create({
      title: 'Render test',
      prompt: 'Prompt',
      aspectRatio: '16:9',
      durationSeconds: 30,
      workflowStage: 'production',
      engine: 'hyperframes',
      fps: 30
    })

    const manager = await openVideoStudioJobManager(profileDir, {
      catalog,
      getAdapter: () => adapter
    })

    await manager.startRender(sampleProject(projectId), 'delivery')
    await vi.waitFor(() => {
      expect(manager.getJobSnapshot(projectId)?.status).toBe('completed')
    })

    const persisted = await catalog.get(projectId)
    expect(persisted?.renders).toHaveLength(1)
    expect(persisted?.renders[0]).toMatchObject({ quality: 'delivery', sizeBytes: 4096 })

    const preview = await manager.startPreview(sampleProject(projectId))
    expect(preview.active).toBe(true)

    await disposeAllVideoStudioJobManagers()
    expect(stopPreview).toHaveBeenCalledTimes(1)
  })

  it('rejects Remotion projects immediately with video_studio_engine_unavailable', async () => {
    const catalog = await openVideoStudioCatalog(profileDir)
    const manager = await openVideoStudioJobManager(profileDir, { catalog })
    await expect(
      manager.startRender(sampleProject('rem-1', { engine: 'remotion' }), 'looks')
    ).rejects.toThrow('video_studio_engine_unavailable')
  })
})
