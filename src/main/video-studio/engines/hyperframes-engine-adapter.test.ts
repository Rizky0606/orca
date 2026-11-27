import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VideoStudioProject } from '../../../shared/video-studio/video-studio-project'
import { createHyperFramesEngineAdapter } from './hyperframes-engine-adapter'
import { remotionEngineAdapter } from './remotion-engine-adapter'
import type { VideoEngineProcessDeps } from './video-render-engine'

const FIXTURES_DIR = join(__dirname, '__fixtures__')
const readCaptured = (name: string): string =>
  readFileSync(join(FIXTURES_DIR, 'captured', name), 'utf8')
const readSynthetic = (name: string): string =>
  readFileSync(join(FIXTURES_DIR, 'synthetic', name), 'utf8')

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

const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('HyperFramesEngineAdapter', () => {
  const adapter = createHyperFramesEngineAdapter()

  it('declares pinned targetVersion 0.9.94 and accurate capabilities', () => {
    expect(adapter.targetVersion).toBe('0.9.94')
    expect(adapter.capabilities?.()).toMatchObject({
      supportsPartialRender: true,
      supportsPreviewServer: true,
      supportsStructuredCheck: true,
      supportsAudio: true
    })
  })

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
    expect(status.versionCompatibility).toBe('missing')
    expect(status.missingTools).toEqual(['node22', 'ffmpeg', 'hyperframes'])
  })

  it('prefers Orca-managed pinned executable before PATH hyperframes and checks exact 0.9.94 pin', async () => {
    const managedPath = '/opt/orca/video-studio/runtime/node_modules/.bin/hyperframes'
    const programsSeen: string[] = []
    const deps = makeDeps({
      resolveCommand: vi.fn().mockImplementation(async (cmd) => {
        if (cmd === managedPath) {
          return managedPath
        }
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
      runProcess: vi.fn().mockImplementation(async ({ program, args }) => {
        programsSeen.push(program)
        if (program.endsWith('node')) {
          return { code: 0, signal: null, stdout: 'v24.18.0', stderr: '', timedOut: false }
        }
        expect(args).toContain('doctor')
        expect(args).toContain('--json')
        return {
          code: 0,
          signal: null,
          stdout: readSynthetic('doctor-ready.json'),
          stderr: '',
          timedOut: false
        }
      })
    })

    const status = await adapter.probeEnvironment(deps, { managedPaths: [managedPath] })
    expect(programsSeen).toContain(managedPath)
    expect(programsSeen).not.toContain('/usr/bin/hyperframes')
    expect(status).toMatchObject({
      engine: 'hyperframes',
      available: true,
      status: 'ready',
      doctorOk: true,
      version: '0.9.94',
      pinnedVersion: '0.9.94',
      versionCompatibility: 'exact',
      resolutionSource: 'managed',
      executablePath: managedPath,
      missingTools: []
    })
  })

  it('flags any version other than 0.9.94 as unverified and handles captured doctor-actual.json', async () => {
    const unverifiedDeps = makeDeps({
      runProcess: vi.fn().mockImplementation(async ({ program }) => {
        if (program.endsWith('node')) {
          return { code: 0, signal: null, stdout: 'v22.14.0', stderr: '', timedOut: false }
        }
        return {
          code: 0,
          signal: null,
          stdout: JSON.stringify({
            ok: true,
            checks: [
              { name: 'FFmpeg', ok: true },
              { name: 'FFprobe', ok: true },
              { name: 'Chrome', ok: true }
            ],
            _meta: { version: '0.9.95' }
          }),
          stderr: '',
          timedOut: false
        }
      })
    })
    const unverifiedStatus = await adapter.probeEnvironment(unverifiedDeps)
    expect(unverifiedStatus.versionCompatibility).toBe('unverified')
    expect(unverifiedStatus.version).toBe('0.9.95')
    expect(unverifiedStatus.summary.toLowerCase()).toContain('unverified')

    const actualMissingFfmpegDeps = makeDeps({
      resolveCommand: vi.fn().mockImplementation(async (cmd) => {
        if (cmd === 'node') {
          return '/usr/bin/node'
        }
        if (cmd === 'hyperframes') {
          return '/usr/bin/hyperframes'
        }
        return null
      }),
      runProcess: vi.fn().mockImplementation(async ({ program }) => {
        if (program.endsWith('node')) {
          return { code: 0, signal: null, stdout: 'v24.18.0', stderr: '', timedOut: false }
        }
        return {
          code: 0,
          signal: null,
          stdout: readCaptured('doctor-actual.json'),
          stderr: '',
          timedOut: false
        }
      })
    })
    const actualStatus = await adapter.probeEnvironment(actualMissingFfmpegDeps)
    expect(actualStatus.available).toBe(false)
    expect(actualStatus.status).toBe('missing-tools')
    expect(actualStatus.versionCompatibility).toBe('exact')
    expect(actualStatus.missingTools).toContain('ffmpeg')
    expect(actualStatus.missingDetails).toContain('ffprobe')
  })

  it('invokes check --json or lint --json, attaches inputFingerprint, and parses findings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-hf-check-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'index.html'), '<div data-composition-id="main">v1</div>', 'utf8')
    await writeFile(join(dir, 'hyperframes.json'), '{"paths":{"blocks":"compositions"}}', 'utf8')

    const browserDeps = makeDeps({
      runProcess: vi.fn().mockImplementation(async ({ args }) => {
        expect(args).toEqual(['check', '--json'])
        return {
          code: 0,
          signal: null,
          stdout: readCaptured('init-check-browser.json'),
          stderr: '',
          timedOut: false
        }
      })
    })
    const res1 = await adapter.checkProject(dir, browserDeps)
    expect(res1.status).toBe('passed')
    expect(res1.passed).toBe(true)
    expect(res1.inputFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(res1.warnings[0]?.code).toBe('sweep_static')

    await writeFile(join(dir, 'index.html'), '<div data-composition-id="main">v2</div>', 'utf8')
    const res2 = await adapter.checkProject(dir, browserDeps)
    expect(res2.inputFingerprint).not.toBe(res1.inputFingerprint)

    const staticDeps = makeDeps({
      runProcess: vi.fn().mockImplementation(async ({ args }) => {
        expect(args).toEqual(['lint', '--json'])
        return {
          code: 0,
          signal: null,
          stdout: JSON.stringify({
            ok: true,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            findings: [],
            _meta: { version: '0.9.94' }
          }),
          stderr: '',
          timedOut: false
        }
      })
    })
    const staticRes = await adapter.checkProject(dir, staticDeps, { browser: false })
    expect(staticRes.status).toBe('partial')
    expect(staticRes.productionGate.allowed).toBe(false)
  })

  it('starts preview with --foreground --json --no-open and conditional --force-new only', async () => {
    const spawnCalls: (readonly string[])[] = []
    const deps = makeDeps({
      spawnPreviewStream: vi.fn((spec) => {
        spawnCalls.push(spec.args)
        queueMicrotask(() => {
          spec.onOutputLine(readCaptured('preview-start-actual.json'))
        })
        return {
          pid: 11008,
          stop: vi.fn().mockResolvedValue(undefined),
          exited: new Promise<number | null>(() => {})
        }
      })
    })

    const handleNormal = await adapter.startPreview('/proj', deps, vi.fn())
    expect(spawnCalls[0]).toEqual([
      'preview',
      '/proj',
      '--foreground',
      '--json',
      '--no-open',
      '--port',
      '43123'
    ])
    expect(handleNormal.state).toEqual({
      active: true,
      url: 'http://127.0.0.1:3002/#project/hf-cap-165139268',
      port: 3002
    })
    expect(handleNormal.pid).toBe(11008)

    await adapter.startPreview('/proj', deps, vi.fn(), { forceNew: true })
    expect(spawnCalls[1]).toEqual([
      'preview',
      '/proj',
      '--foreground',
      '--json',
      '--no-open',
      '--port',
      '43123',
      '--force-new'
    ])
  })

  it('rejects non-loopback preview URLs emitted by untrusted output', async () => {
    const stopMock = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({
      spawnPreviewStream: vi.fn((spec) => {
        queueMicrotask(() => {
          spec.onOutputLine(
            JSON.stringify({
              schemaVersion: 1,
              operation: 'start',
              ok: true,
              result: {
                state: 'started',
                mode: 'foreground',
                projectName: 'p',
                projectDir: '/proj',
                host: '192.168.1.50',
                port: 3002,
                pid: 11008,
                serverUrl: 'http://192.168.1.50:3002',
                studioUrl: 'http://192.168.1.50:3002/#project/p',
                ready: true
              }
            })
          )
        })
        return {
          stop: stopMock,
          exited: new Promise<number | null>(() => {})
        }
      })
    })

    await expect(adapter.startPreview('/proj', deps, vi.fn())).rejects.toThrow(
      'invalid_preview_url'
    )
    expect(stopMock).toHaveBeenCalledTimes(1)
  })

  it('does not resolve preview prematurely on ready:false or bare diagnostic text', async () => {
    let emitLine!: (line: string) => void
    let emitExit!: (code: number | null) => void
    const deps = makeDeps({
      spawnPreviewStream: vi.fn((spec) => {
        emitLine = spec.onOutputLine
        emitExit = spec.onExit
        return {
          pid: 11008,
          stop: vi.fn().mockResolvedValue(undefined),
          exited: new Promise<number | null>(() => {})
        }
      })
    })

    let settled = false
    const pending = adapter.startPreview('/proj', deps, vi.fn()).then((res) => {
      settled = true
      return res
    })

    await vi.waitFor(() => expect(emitLine).toBeDefined())
    emitLine('Studio preview failed to bind')
    emitLine(
      JSON.stringify({
        schemaVersion: 1,
        operation: 'start',
        ok: true,
        result: {
          state: 'starting',
          mode: 'foreground',
          projectName: 'p',
          projectDir: '/proj',
          host: '127.0.0.1',
          port: 43123,
          pid: 11008,
          studioUrl: 'http://127.0.0.1:43123/#project/p',
          ready: false
        }
      })
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    emitExit(1)
    await expect(pending).rejects.toThrow('video_studio_preview_exited:1')
  })

  it('renders MP4 with @hf-progress, optional partial start/end, abort cleanup, and ffprobe metadata', async () => {
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
    const progressLines = readSynthetic('render-progress.txt')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('@hf-progress'))

    const okDeps = makeDeps({
      runProcessStreaming: vi.fn().mockImplementation(async (spec) => {
        expect(spec.args).toEqual([
          'render',
          '--quality',
          'delivery',
          '--fps',
          '30',
          '--output',
          'renders/r-ok.mp4',
          '--start',
          '2',
          '--end',
          '8'
        ])
        for (const line of progressLines) {
          spec.onOutputLine?.(line)
        }
        return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false }
      }),
      runProcess: vi.fn().mockResolvedValue({
        code: 0,
        signal: null,
        stdout: JSON.stringify({
          format: { duration: '6.0' },
          streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
        }),
        stderr: '',
        timedOut: false
      })
    })

    const record = await adapter.renderProject(
      '/proj',
      {
        renderId: 'r-ok',
        fileName: 'r-ok.mp4',
        quality: 'delivery',
        project,
        startSeconds: 2,
        endSeconds: 8
      },
      okDeps,
      onProgress
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progressPercent: 15, stageLabel: 'extract_video' })
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progressPercent: 90, stageLabel: 'encode' })
    )
    expect(record).toMatchObject({
      id: 'r-ok',
      engine: 'hyperframes',
      quality: 'delivery',
      fileName: 'r-ok.mp4',
      durationSeconds: 6,
      width: 1920,
      height: 1080,
      fps: 30,
      sizeBytes: 2048
    })
  })
})

describe('remotionEngineAdapter', () => {
  it('is reserved with planned status, returns unsupported validation, and rejects render execution', async () => {
    const deps = makeDeps()
    expect(await remotionEngineAdapter.probeEnvironment(deps)).toMatchObject({
      engine: 'remotion',
      available: false,
      status: 'planned'
    })
    expect(remotionEngineAdapter.targetVersion).toBe('planned')

    const checkRes = await remotionEngineAdapter.checkProject('/proj', deps)
    expect(checkRes).toMatchObject({
      passed: false,
      status: 'unsupported',
      engine: 'remotion',
      productionGate: {
        allowed: false,
        blockingReasons: ['Remotion runtime is scheduled for Phase 06.']
      }
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
