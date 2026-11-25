import { describe, expect, it, vi } from 'vitest'
import { hyperFramesEngineAdapter } from './hyperframes-engine-adapter'
import type { VideoEngineProcessDeps } from './video-render-engine'

function makeDeps(overrides: Partial<VideoEngineProcessDeps> = {}): VideoEngineProcessDeps {
  return {
    resolveCommand: vi.fn().mockResolvedValue('/usr/local/bin/hyperframes'),
    hydrateShellPath: vi.fn().mockResolvedValue(undefined),
    runProcess: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false }),
    spawnStream: vi.fn().mockResolvedValue({ kill: vi.fn(), exited: Promise.resolve() }),
    ...overrides
  }
}

describe('hyperFramesEngineAdapter.probeEnvironment', () => {
  it('returns available:false with status not_installed when hyperframes is not on PATH', async () => {
    const deps = makeDeps({ resolveCommand: vi.fn().mockResolvedValue(null) })
    const status = await hyperFramesEngineAdapter.probeEnvironment(deps)
    expect(status.available).toBe(false)
    expect(status.status).toBe('not_installed')
  })

  it('returns available:true when hyperframes and ffmpeg are both installed', async () => {
    const deps = makeDeps({
      runProcess: vi.fn().mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({
          hyperframes: { installed: true, version: '1.4.2' },
          ffmpeg: { installed: true }
        }),
        stderr: '',
        timedOut: false
      })
    })
    const status = await hyperFramesEngineAdapter.probeEnvironment(deps)
    expect(status.available).toBe(true)
    expect(status.status).toBe('ready')
    expect(status.version).toBe('1.4.2')
  })

  it('returns available:false with missing_dependency when ffmpeg is absent', async () => {
    const deps = makeDeps({
      runProcess: vi.fn().mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({
          hyperframes: { installed: true, version: '1.4.2' },
          ffmpeg: { installed: false }
        }),
        stderr: '',
        timedOut: false
      })
    })
    const status = await hyperFramesEngineAdapter.probeEnvironment(deps)
    expect(status.available).toBe(false)
    expect(status.status).toBe('missing_dependency')
  })
})

describe('hyperFramesEngineAdapter.checkComposition', () => {
  it('returns passed:true when hyperframes check exits 0', async () => {
    const deps = makeDeps({
      runProcess: vi.fn().mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ issues: [] }),
        stderr: '',
        timedOut: false
      })
    })
    const result = await hyperFramesEngineAdapter.checkComposition('/proj', deps)
    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('returns passed:false with issues when check exits non-zero', async () => {
    const deps = makeDeps({
      runProcess: vi.fn().mockResolvedValue({
        code: 1,
        stdout: 'Missing hyperframes.json\nindex.html not found',
        stderr: '',
        timedOut: false
      })
    })
    const result = await hyperFramesEngineAdapter.checkComposition('/proj', deps)
    expect(result.passed).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].severity).toBe('error')
  })
})

describe('hyperFramesEngineAdapter.renderProject', () => {
  it('throws video_studio_engine_unavailable when hyperframes is not on PATH', async () => {
    const deps = makeDeps({ resolveCommand: vi.fn().mockResolvedValue(null) })
    await expect(
      hyperFramesEngineAdapter.renderProject(
        '/proj',
        '/out/render.mp4',
        { quality: 'standard' },
        deps,
        vi.fn()
      )
    ).rejects.toThrow('video_studio_engine_unavailable')
  })

  it('throws on non-zero exit code', async () => {
    const deps = makeDeps({
      runProcess: vi.fn().mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'render error',
        timedOut: false
      })
    })
    await expect(
      hyperFramesEngineAdapter.renderProject(
        '/proj',
        '/out/render.mp4',
        { quality: 'standard' },
        deps,
        vi.fn()
      )
    ).rejects.toThrow('video_studio_render_failed')
  })
})
