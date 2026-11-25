import { describe, expect, it, vi } from 'vitest'
import type { VideoStudioProject } from '../../../shared/video-studio/video-studio-project'
import { createHyperFramesEngineAdapter } from './hyperframes-engine-adapter'
import { remotionEngineAdapter } from './remotion-engine-adapter'
import type { VideoEngineProcessDeps } from './video-render-engine'

const project: VideoStudioProject = {
  id: 'p1',
  title: 'Launch video',
  prompt: 'Show the flow',
  aspectRatio: '16:9',
  durationSeconds: 30,
  workflowStage: 'production',
  engine: 'hyperframes',
  fps: 30,
  renders: [],
  createdAt: 1000,
  updatedAt: 1000
}

function makeDeps(overrides: Partial<VideoEngineProcessDeps> = {}): VideoEngineProcessDeps {
  return {
    hydrateShellPath: vi.fn().mockResolvedValue(undefined),
    resolveCommand: vi.fn().mockImplementation(async (cmd) => {
      if (cmd === 'node') {
        return '/usr/bin/node'
      }
      if (cmd === 'ffmpeg' || cmd === 'ffprobe') {
        return `/usr/bin/${cmd}`
      }
      if (cmd === 'hyperframes') {
        return '/usr/bin/hyperframes'
      }
      return null
    }),
    allocateLoopbackPort: vi.fn().mockResolvedValue(43123),
    runProcess: vi.fn().mockImplementation(async ({ program, args }) => {
      if (program.endsWith('node') && args[0] === '-v') {
        return { code: 0, signal: null, stdout: 'v22.12.0\n', stderr: '', timedOut: false }
      }
      return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false }
    }),
    runProcessStreaming: vi
      .fn()
      .mockResolvedValue({ code: 0, signal: null, stdout: '', stderr: '', timedOut: false }),
    spawnPreviewStream: vi.fn(),
    statFile: vi.fn().mockResolvedValue({ size: 2048 }),
    removeFile: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('HyperFramesEngineAdapter', () => {
  const adapter = createHyperFramesEngineAdapter()

  it('reports missing tools clearly without throwing when CLI tools are absent', async () => {
    const deps = makeDeps({
      resolveCommand: vi
        .fn()
        .mockImplementation(async (cmd) => (cmd === 'node' ? '/usr/bin/node' : null)),
      runProcess: vi.fn().mockResolvedValue({
        code: 0,
        signal: null,
        stdout: 'v20.11.0\n',
        stderr: '',
        timedOut: false
      })
    })
    const status = await adapter.probeEnvironment(deps)
    expect(status.available).toBe(false)
    expect(status.status).toBe('missing-tools')
    expect(status.missingTools).toEqual(['node22', 'ffmpeg', 'hyperframes'])
  })

  it('runs doctor --json and reports ready when all tools are present', async () => {
    const deps = makeDeps({
      runProcess: vi.fn().mockImplementation(async ({ program, args }) => {
        if (program.endsWith('node')) {
          return { code: 0, signal: null, stdout: 'v22.14.0', stderr: '', timedOut: false }
        }
        expect(args).toContain('doctor')
        expect(args).toContain('--json')
        return {
          code: 0,
          signal: null,
          stdout: JSON.stringify({ ok: true, version: '1.9.0', ffmpeg: { ok: true } }),
          stderr: '',
          timedOut: false
        }
      })
    })
    const status = await adapter.probeEnvironment(deps)
    expect(status).toMatchObject({
      engine: 'hyperframes',
      available: true,
      status: 'ready',
      doctorOk: true,
      version: '1.9.0',
      missingTools: []
    })
  })

  it('invokes check --json and parses structured findings', async () => {
    const deps = makeDeps({
      runProcess: vi.fn().mockResolvedValue({
        code: 1,
        signal: null,
        stdout: JSON.stringify({
          ok: false,
          lint: { errors: [{ code: 'unregistered_timeline', message: 'No timeline registered' }] },
          layout: { warnings: [{ message: 'Clip ends near edge' }] }
        }),
        stderr: '',
        timedOut: false
      })
    })
    const res = await adapter.checkProject('/proj', deps)
    expect(res.passed).toBe(false)
    expect(res.errors).toEqual([
      { severity: 'error', code: 'unregistered_timeline', message: 'No timeline registered' }
    ])
    expect(res.warnings).toEqual([{ severity: 'warning', message: 'Clip ends near edge' }])
  })

  it('renders MP4 with quality/output args, removes partial output on abort, and reads metadata via ffprobe', async () => {
    const removeFile = vi.fn().mockResolvedValue(undefined)
    const ac = new AbortController()
    const abortDeps = makeDeps({
      removeFile,
      runProcessStreaming: vi.fn().mockImplementation(async () => {
        ac.abort()
        return { code: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: false }
      })
    })
    await expect(
      adapter.renderProject(
        '/proj',
        { renderId: 'r-abort', fileName: 'r-abort.mp4', quality: 'looks', project },
        abortDeps,
        vi.fn(),
        ac.signal
      )
    ).rejects.toThrow('video_studio_render_cancelled')
    expect(removeFile).toHaveBeenCalledTimes(1)

    const onProgress = vi.fn()
    const okDeps = makeDeps({
      runProcessStreaming: vi.fn().mockImplementation(async (spec) => {
        expect(spec.args).toEqual([
          'render',
          '--quality',
          'delivery',
          '--fps',
          '30',
          '--output',
          'renders/r-ok.mp4'
        ])
        spec.onOutputLine?.('{"progress":0.5,"stage":"capture"}')
        return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false }
      }),
      runProcess: vi.fn().mockResolvedValue({
        code: 0,
        signal: null,
        stdout: JSON.stringify({
          format: { duration: '30.5' },
          streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
        }),
        stderr: '',
        timedOut: false
      })
    })

    const record = await adapter.renderProject(
      '/proj',
      { renderId: 'r-ok', fileName: 'r-ok.mp4', quality: 'delivery', project },
      okDeps,
      onProgress
    )
    expect(onProgress).toHaveBeenCalledWith({
      progressPercent: 50,
      stageLabel: 'capture',
      logLine: '{"progress":0.5,"stage":"capture"}'
    })
    expect(record).toMatchObject({
      id: 'r-ok',
      engine: 'hyperframes',
      quality: 'delivery',
      fileName: 'r-ok.mp4',
      durationSeconds: 30.5,
      width: 1920,
      height: 1080,
      fps: 30,
      sizeBytes: 2048
    })
  })
})

describe('remotionEngineAdapter', () => {
  it('is reserved with planned status and rejects render execution', async () => {
    const deps = makeDeps()
    expect(await remotionEngineAdapter.probeEnvironment(deps)).toMatchObject({
      engine: 'remotion',
      available: false,
      status: 'planned'
    })
    await expect(
      remotionEngineAdapter.renderProject(
        '/proj',
        { renderId: 'r1', fileName: 'r1.mp4', quality: 'looks', project },
        deps,
        vi.fn()
      )
    ).rejects.toThrow('video_studio_engine_unavailable')
  })
})
