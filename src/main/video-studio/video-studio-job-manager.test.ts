import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  VideoStudioProject,
  VideoStudioRenderRecord
} from '../../shared/video-studio/video-studio-project'
import { computeProjectInputFingerprint } from './engines/project-input-fingerprint'
import type { VideoRenderEngineAdapter } from './engines/video-render-engine'
import { openVideoStudioCatalog } from './video-studio-catalog'
import { resolveVideoStudioProjectDir } from './video-studio-composition-paths'
import {
  disposeAllVideoStudioJobManagers,
  openVideoStudioJobManager
} from './video-studio-job-registry'
import { VideoStudioPreviewManager } from './video-studio-preview-manager'
import { VideoStudioTrustStore } from './video-studio-trust-store'

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

  it('enforces Host Trust Store before Chrome check, preview, and render including TOCTOU edits', async () => {
    const projectDir = resolveVideoStudioProjectDir(profileDir, 'p-untrusted')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'hyperframes.json'), '{"paths":{}}', 'utf8')
    await writeFile(join(projectDir, 'index.html'), '<html><body>untrusted</body></html>', 'utf8')

    const adapter: VideoRenderEngineAdapter = {
      id: 'hyperframes',
      probeEnvironment: vi.fn(),
      scaffoldProject: vi.fn(),
      checkProject: vi.fn(async (dir) => ({
        passed: true,
        errors: [],
        warnings: [],
        summary: 'ok',
        checkedAt: 1_700_000_000_000,
        status: 'passed' as const,
        engine: 'hyperframes' as const,
        inputFingerprint: (await computeProjectInputFingerprint(dir)).inputFingerprint,
        findings: [],
        skippedChecks: [],
        sectionStatuses: {},
        productionGate: { allowed: true, blockingReasons: [] }
      })),
      startPreview: vi.fn().mockResolvedValue({
        state: { active: true, url: 'http://127.0.0.1:4101/#project/p-untrusted', port: 4101 },
        stop: vi.fn().mockResolvedValue(undefined)
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
        sizeBytes: 512,
        createdAt: 12345
      }))
    }

    const catalog = await openVideoStudioCatalog(profileDir)
    const manager = await openVideoStudioJobManager(profileDir, {
      catalog,
      getAdapter: () => adapter
    })
    const project = sampleProject('p-untrusted')

    await expect(manager.runCheck(project)).rejects.toThrow(
      'video_studio_execution_approval_required'
    )
    await expect(manager.startPreview(project)).rejects.toThrow(
      'video_studio_execution_approval_required'
    )
    await expect(manager.startRender(project, 'looks')).rejects.toThrow(
      'video_studio_execution_approval_required'
    )
    expect(adapter.checkProject).not.toHaveBeenCalled()
    expect(adapter.startPreview).not.toHaveBeenCalled()
    expect(adapter.renderProject).not.toHaveBeenCalled()

    // Static browserless lint mode skips Chrome and does not require execution approval
    await expect(manager.runCheck(project, { browser: false })).resolves.toMatchObject({
      passed: true
    })
    expect(adapter.checkProject).toHaveBeenCalledTimes(1)

    // Preview-only approval allows check & preview, blocks render
    const trustStore = new VideoStudioTrustStore(profileDir)
    const fp = await computeProjectInputFingerprint(projectDir)
    await trustStore.approveProjectExecution({
      projectId: 'p-untrusted',
      projectDir,
      trustState: 'approved-preview',
      inputFingerprint: fp.inputFingerprint
    })

    await expect(manager.runCheck(project)).resolves.toMatchObject({ passed: true })
    await expect(manager.startPreview(project)).resolves.toMatchObject({ active: true })
    await expect(manager.startRender(project, 'looks')).rejects.toThrow(
      'video_studio_execution_approval_required'
    )

    // Full render approval allows render, then external file edit invalidates trust & marks check stale
    await trustStore.approveProjectExecution({
      projectId: 'p-untrusted',
      projectDir,
      trustState: 'approved-render',
      inputFingerprint: fp.inputFingerprint
    })
    await writeFile(
      join(projectDir, 'index.html'),
      '<html><body><script>tamper()</script></body></html>',
      'utf8'
    )

    const compState = await manager.getCompositionState('p-untrusted')
    expect(compState.checkStale).toBe(true)

    await expect(manager.startRender(project, 'looks')).rejects.toThrow(
      'video_studio_execution_approval_required'
    )
    expect(adapter.renderProject).not.toHaveBeenCalled()
  })

  it('catches TOCTOU edit right before Chrome render spawn and cleans up preview sessions', async () => {
    const projectDir = resolveVideoStudioProjectDir(profileDir, 'p-toctou')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'hyperframes.json'), '{"paths":{}}', 'utf8')
    await writeFile(join(projectDir, 'index.html'), '<html><body>safe</body></html>', 'utf8')
    const fp = await computeProjectInputFingerprint(projectDir)
    const trustStore = new VideoStudioTrustStore(profileDir)
    await trustStore.approveProjectExecution({
      projectId: 'p-toctou',
      projectDir,
      trustState: 'approved-render',
      inputFingerprint: fp.inputFingerprint
    })

    const renderProject = vi.fn()
    const adapter: VideoRenderEngineAdapter = {
      id: 'hyperframes',
      probeEnvironment: vi.fn(),
      scaffoldProject: vi.fn(),
      checkProject: vi.fn(),
      startPreview: vi.fn().mockResolvedValue({
        state: { active: true, url: 'http://127.0.0.1:4102/#project/p-toctou', port: 4102 },
        stop: vi.fn().mockResolvedValue(undefined)
      }),
      renderProject
    }

    const catalog = await openVideoStudioCatalog(profileDir)
    const manager = await openVideoStudioJobManager(profileDir, {
      catalog,
      getAdapter: () => adapter,
      beforeExecutionSpawn: async () => {
        await writeFile(
          join(projectDir, 'index.html'),
          '<html><body><script>toctou()</script></body></html>',
          'utf8'
        )
      }
    })

    await expect(manager.startRender(sampleProject('p-toctou'), 'looks')).rejects.toThrow(
      'video_studio_execution_approval_required'
    )
    expect(renderProject).not.toHaveBeenCalled()
    expect(VideoStudioPreviewManager.getSessionsFilePath(profileDir)).toContain('security')
  })

  it('watches project directory for external edits while suppressing Orca TX self-writes', async () => {
    const adapter: VideoRenderEngineAdapter = {
      id: 'hyperframes',
      probeEnvironment: vi.fn(),
      scaffoldProject: vi.fn(async (dir) => {
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, 'hyperframes.json'), '{}', 'utf8')
        await writeFile(join(dir, 'index.html'), '<html></html>', 'utf8')
        await writeFile(join(dir, 'STORYBOARD.md'), '# Storyboard\n', 'utf8')
        return {
          initialized: true,
          entryExists: true,
          files: ['STORYBOARD.md', 'hyperframes.json', 'index.html'],
          previewActive: false
        }
      }),
      checkProject: vi.fn(),
      startPreview: vi.fn(),
      renderProject: vi.fn()
    }

    const catalog = await openVideoStudioCatalog(profileDir)
    const manager = await openVideoStudioJobManager(profileDir, {
      catalog,
      getAdapter: () => adapter,
      watcherDebounceMs: 30
    })
    const project = sampleProject('p-watch')
    await manager.scaffoldComposition(project)

    const fileEvents: unknown[] = []
    const unsub = manager.subscribeFilesChanged((evt) => fileEvents.push(evt))
    await manager.watchProject('p-watch')

    // Self-write via TX must NOT emit projectFilesChanged
    await manager.documents.updateProjectScript({
      projectId: 'p-watch',
      scriptMarkdown: '# Script\nInternal TX update'
    })
    // ast-grep-ignore: test-no-real-time-wait -- intentional negative settle window confirming TX suppression does not emit after debounceMs
    await new Promise((r) => setTimeout(r, 120))
    expect(fileEvents).toHaveLength(0)

    // External write MUST emit projectFilesChanged
    const projectDir = resolveVideoStudioProjectDir(profileDir, 'p-watch')
    await writeFile(join(projectDir, 'STORYBOARD.md'), '## Frame 1 — External\n', 'utf8')
    await vi.waitFor(() => {
      expect(fileEvents.length).toBeGreaterThanOrEqual(1)
    })
    expect(fileEvents[0]).toMatchObject({
      type: 'projectFilesChanged',
      projectId: 'p-watch',
      externalEdit: true,
      changedPaths: expect.arrayContaining(['STORYBOARD.md'])
    })
    unsub()
  })
})
