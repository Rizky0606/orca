import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  VideoEngineProcessDeps,
  VideoRenderEngineAdapter,
  VideoStudioPreviewHandle
} from './engines/video-render-engine'
import { buildWindowsSingleProcessCimScript, inspectWindowsProcessWith } from './preview-os-control'
import {
  VideoStudioPreviewManager,
  type PreviewOsControl,
  type PreviewSessionRecord
} from './video-studio-preview-manager'

let profileDir: string
let projectDir: string
let projectDirRealpath: string

const NODE_EXE =
  process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/bin/node'

function makeDummyDeps(): VideoEngineProcessDeps {
  return {
    hydrateShellPath: vi.fn().mockResolvedValue(undefined),
    resolveCommand: vi.fn().mockResolvedValue('/usr/bin/hyperframes'),
    allocateLoopbackPort: vi.fn().mockResolvedValue(43002),
    runProcess: vi
      .fn()
      .mockResolvedValue({ code: 0, signal: null, stdout: '', stderr: '', timedOut: false }),
    runProcessStreaming: vi
      .fn()
      .mockResolvedValue({ code: 0, signal: null, stdout: '', stderr: '', timedOut: false }),
    spawnPreviewStream: vi.fn(),
    statFile: vi.fn().mockResolvedValue(null),
    removeFile: vi.fn().mockResolvedValue(undefined)
  }
}

function makeAdapter(
  onStart?: (options?: { forceNew?: boolean; signal?: AbortSignal }) => void
): VideoRenderEngineAdapter {
  let seq = 0
  return {
    id: 'hyperframes',
    probeEnvironment: vi.fn(),
    scaffoldProject: vi.fn(),
    checkProject: vi.fn(),
    renderProject: vi.fn(),
    startPreview: vi.fn(async (_dir, _deps, _onExit, signalOrOptions) => {
      const options =
        signalOrOptions instanceof AbortSignal ? { signal: signalOrOptions } : signalOrOptions
      onStart?.(options)
      seq += 1
      const port = 43000 + seq
      const handle: VideoStudioPreviewHandle = {
        state: {
          active: true,
          url: `http://127.0.0.1:${port}/#project/proj-1`,
          port
        },
        pid: 51000 + seq,
        projectName: 'proj-1',
        executablePath: NODE_EXE,
        stop: vi.fn().mockResolvedValue(undefined)
      }
      return handle
    })
  }
}

async function seedStoredSession(
  targetProfileDir: string,
  record: PreviewSessionRecord
): Promise<string> {
  const sessionsFile = VideoStudioPreviewManager.getSessionsFilePath(targetProfileDir)
  await mkdir(join(targetProfileDir, 'video-studio', 'security'), { recursive: true })
  await writeFile(
    sessionsFile,
    JSON.stringify({ schemaVersion: 1, sessions: { [record.projectId]: record } }, null, 2),
    'utf8'
  )
  return sessionsFile
}

function makeStoredRecord(overrides: Partial<PreviewSessionRecord> = {}): PreviewSessionRecord {
  return {
    sessionId: 'sess-valid-1',
    projectId: 'proj-1',
    projectDirRealpath,
    pid: 44100,
    creationTimeMs: 1_700_000_010_000,
    executablePath: NODE_EXE,
    port: 43123,
    host: '127.0.0.1',
    url: 'http://127.0.0.1:43123/#project/proj-1',
    projectName: 'proj-1',
    startedAt: 1_700_000_010_500,
    ...overrides
  }
}

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), 'orca-vs-preview-profile-'))
  projectDir = join(profileDir, 'video-studio', 'projects', 'proj-1')
  await mkdir(projectDir, { recursive: true })
  projectDirRealpath = await realpath(projectDir)
})

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true })
})

describe('VideoStudioPreviewManager (6-factor identity verification)', () => {
  it('persists 6-factor session record inside host security dir and reuses healthy verified session', async () => {
    const startOptionsSeen: ({ forceNew?: boolean } | undefined)[] = []
    const osControl: PreviewOsControl = {
      inspectProcess: vi.fn(async (pid) => ({
        pid,
        creationTimeMs: 1_700_000_050_000,
        executablePath: NODE_EXE,
        commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}" --foreground --json --no-open`,
        cwd: projectDirRealpath
      })),
      findLoopbackPortOwner: vi.fn(async (port) => ({ host: '127.0.0.1', port, pid: 51001 })),
      probeHttpIdentity: vi.fn(async () => ({
        isHyperframes: true,
        pid: 51001,
        projectName: 'proj-1',
        projectDir: projectDirRealpath,
        version: '0.9.94'
      })),
      terminateProcessTree: vi.fn().mockResolvedValue(true)
    }

    const manager = new VideoStudioPreviewManager(profileDir, { osControl })
    const adapter = makeAdapter((opts) => startOptionsSeen.push(opts))
    const deps = makeDummyDeps()

    const handle = await manager.startPreview({
      projectId: 'proj-1',
      projectDir,
      adapter,
      deps
    })

    expect(startOptionsSeen).toEqual([{ forceNew: false, signal: undefined }])
    expect(handle.state).toEqual({
      active: true,
      url: 'http://127.0.0.1:43001/#project/proj-1',
      port: 43001
    })

    const sessionsFile = VideoStudioPreviewManager.getSessionsFilePath(profileDir)
    const persisted = JSON.parse(await readFile(sessionsFile, 'utf8')) as {
      schemaVersion: number
      sessions: Record<string, PreviewSessionRecord>
    }
    expect(persisted.schemaVersion).toBe(1)
    expect(persisted.sessions['proj-1']).toMatchObject({
      projectId: 'proj-1',
      projectDirRealpath,
      pid: 51001,
      creationTimeMs: 1_700_000_050_000,
      executablePath: NODE_EXE,
      port: 43001,
      host: '127.0.0.1',
      projectName: 'proj-1'
    })
    expect(persisted.sessions['proj-1']?.sessionId).toBeTruthy()

    const reused = await manager.startPreview({
      projectId: 'proj-1',
      projectDir,
      adapter,
      deps
    })
    expect(reused.state).toEqual(handle.state)
    expect(adapter.startPreview).toHaveBeenCalledTimes(1)
    expect(osControl.terminateProcessTree).not.toHaveBeenCalled()
  })

  it('clears stale state WITHOUT killing unrelated processes across all 6 mismatch factors', async () => {
    const cases: {
      name: string
      expectedSessionId?: string
      osControl: PreviewOsControl
    }[] = [
      {
        name: '1. dead PID',
        osControl: {
          inspectProcess: vi.fn().mockResolvedValue(null),
          findLoopbackPortOwner: vi.fn().mockResolvedValue(null),
          probeHttpIdentity: vi.fn().mockResolvedValue(null),
          terminateProcessTree: vi.fn().mockResolvedValue(true)
        }
      },
      {
        name: '2. stale creationTimeMs (PID reused)',
        osControl: {
          inspectProcess: vi.fn(async (pid) => ({
            pid,
            creationTimeMs: 1_700_000_999_999,
            executablePath: NODE_EXE,
            commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}"`,
            cwd: projectDirRealpath
          })),
          findLoopbackPortOwner: vi
            .fn()
            .mockResolvedValue({ host: '127.0.0.1', port: 43123, pid: 44100 }),
          probeHttpIdentity: vi.fn().mockResolvedValue({
            isHyperframes: true,
            pid: 44100,
            projectName: 'proj-1',
            projectDir: projectDirRealpath
          }),
          terminateProcessTree: vi.fn().mockResolvedValue(true)
        }
      },
      {
        name: '3. wrong executablePath even when args contain hyperframes substring',
        osControl: {
          inspectProcess: vi.fn(async (pid) => ({
            pid,
            creationTimeMs: 1_700_000_010_000,
            executablePath:
              process.platform === 'win32' ? 'C:\\Python312\\python.exe' : '/usr/bin/python3',
            commandLine: `python3 -m http.server 43123 --directory "${projectDirRealpath}/hyperframes"`,
            cwd: projectDirRealpath
          })),
          findLoopbackPortOwner: vi
            .fn()
            .mockResolvedValue({ host: '127.0.0.1', port: 43123, pid: 44100 }),
          probeHttpIdentity: vi.fn().mockResolvedValue({ isHyperframes: false }),
          terminateProcessTree: vi.fn().mockResolvedValue(true)
        }
      },
      {
        name: '4. wrong projectDirRealpath',
        osControl: {
          inspectProcess: vi.fn(async (pid) => ({
            pid,
            creationTimeMs: 1_700_000_010_000,
            executablePath: NODE_EXE,
            commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "/tmp/completely-different-project"`,
            cwd: '/tmp/completely-different-project'
          })),
          findLoopbackPortOwner: vi
            .fn()
            .mockResolvedValue({ host: '127.0.0.1', port: 43123, pid: 44100 }),
          probeHttpIdentity: vi.fn().mockResolvedValue({
            isHyperframes: true,
            pid: 44100,
            projectName: 'other-proj',
            projectDir: '/tmp/completely-different-project'
          }),
          terminateProcessTree: vi.fn().mockResolvedValue(true)
        }
      },
      {
        name: '5a. port owned by another PID',
        osControl: {
          inspectProcess: vi.fn(async (pid) => ({
            pid,
            creationTimeMs: 1_700_000_010_000,
            executablePath: NODE_EXE,
            commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}"`,
            cwd: projectDirRealpath
          })),
          findLoopbackPortOwner: vi
            .fn()
            .mockResolvedValue({ host: '127.0.0.1', port: 43123, pid: 99999 }),
          probeHttpIdentity: vi.fn().mockResolvedValue({
            isHyperframes: true,
            pid: 99999,
            projectName: 'other',
            projectDir: '/tmp/other'
          }),
          terminateProcessTree: vi.fn().mockResolvedValue(true)
        }
      },
      {
        name: '5b. HTTP returns generic 200 / wrong project marker',
        osControl: {
          inspectProcess: vi.fn(async (pid) => ({
            pid,
            creationTimeMs: 1_700_000_010_000,
            executablePath: NODE_EXE,
            commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}"`,
            cwd: projectDirRealpath
          })),
          findLoopbackPortOwner: vi
            .fn()
            .mockResolvedValue({ host: '127.0.0.1', port: 43123, pid: 44100 }),
          probeHttpIdentity: vi.fn().mockResolvedValue({
            isHyperframes: true,
            pid: 44100,
            projectName: 'other-project',
            projectDir: '/tmp/other-project'
          }),
          terminateProcessTree: vi.fn().mockResolvedValue(true)
        }
      },
      {
        name: '6. mismatched sessionId',
        expectedSessionId: 'sess-other-999',
        osControl: {
          inspectProcess: vi.fn(async (pid) => ({
            pid,
            creationTimeMs: 1_700_000_010_000,
            executablePath: NODE_EXE,
            commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}"`,
            cwd: projectDirRealpath
          })),
          findLoopbackPortOwner: vi
            .fn()
            .mockResolvedValue({ host: '127.0.0.1', port: 43123, pid: 44100 }),
          probeHttpIdentity: vi.fn().mockResolvedValue({
            isHyperframes: true,
            pid: 44100,
            projectName: 'proj-1',
            projectDir: projectDirRealpath
          }),
          terminateProcessTree: vi.fn().mockResolvedValue(true)
        }
      }
    ]

    for (const testCase of cases) {
      const record = makeStoredRecord()
      const sessionsFile = await seedStoredSession(profileDir, record)
      const manager = new VideoStudioPreviewManager(profileDir, { osControl: testCase.osControl })

      const stopped = await manager.stopPreview('proj-1', projectDir, {
        expectedSessionId: testCase.expectedSessionId
      })
      expect(stopped, testCase.name).toEqual({ active: false })
      expect(testCase.osControl.terminateProcessTree, testCase.name).not.toHaveBeenCalled()

      const afterStop = JSON.parse(await readFile(sessionsFile, 'utf8')) as {
        sessions: Record<string, PreviewSessionRecord>
      }
      expect(afterStop.sessions['proj-1'], testCase.name).toBeUndefined()

      if (!testCase.expectedSessionId) {
        await seedStoredSession(profileDir, record)
        const startOptionsSeen: ({ forceNew?: boolean } | undefined)[] = []
        const adapter = makeAdapter((opts) => startOptionsSeen.push(opts))
        await manager.startPreview({
          projectId: 'proj-1',
          projectDir,
          adapter,
          deps: makeDummyDeps()
        })
        expect(testCase.osControl.terminateProcessTree, testCase.name).not.toHaveBeenCalled()
        expect(startOptionsSeen[0]?.forceNew, testCase.name).toBe(false)
      }
    }
  })

  it('kills and passes --force-new ONLY when replacing a confirmed unhealthy session for the same project', async () => {
    await seedStoredSession(profileDir, makeStoredRecord({ pid: 44200, port: 43123 }))

    let oldAlive = true
    const osControl: PreviewOsControl = {
      inspectProcess: vi.fn(async (pid) => {
        if (pid === 44200 && oldAlive) {
          return {
            pid: 44200,
            creationTimeMs: 1_700_000_010_000,
            executablePath: NODE_EXE,
            commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}" --foreground`,
            cwd: projectDirRealpath
          }
        }
        return {
          pid,
          creationTimeMs: 1_700_000_090_000,
          executablePath: NODE_EXE,
          commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}" --foreground`,
          cwd: projectDirRealpath
        }
      }),
      // Port owned by 44200 (or not listening yet), HTTP server is hung/unhealthy (returns null)
      findLoopbackPortOwner: vi.fn(async (port) =>
        oldAlive ? { host: '127.0.0.1', port, pid: 44200 } : { host: '127.0.0.1', port, pid: 51001 }
      ),
      probeHttpIdentity: vi.fn(async () =>
        oldAlive
          ? null
          : {
              isHyperframes: true,
              pid: 51001,
              projectName: 'proj-1',
              projectDir: projectDirRealpath,
              version: '0.9.94'
            }
      ),
      terminateProcessTree: vi.fn(async (pid) => {
        if (pid === 44200) {
          oldAlive = false
        }
        return true
      })
    }

    const startOptionsSeen: ({ forceNew?: boolean } | undefined)[] = []
    const manager = new VideoStudioPreviewManager(profileDir, { osControl })
    const adapter = makeAdapter((opts) => startOptionsSeen.push(opts))

    await manager.startPreview({
      projectId: 'proj-1',
      projectDir,
      adapter,
      deps: makeDummyDeps()
    })

    expect(osControl.terminateProcessTree).toHaveBeenCalledTimes(1)
    expect(osControl.terminateProcessTree).toHaveBeenCalledWith(44200)
    expect(startOptionsSeen[0]?.forceNew).toBe(true)
  })

  it('verifies all 6 factors before stopping a confirmed live session across restarts and ignores .orca/project-state.json', async () => {
    await mkdir(join(projectDir, '.orca'), { recursive: true })
    await writeFile(
      join(projectDir, '.orca', 'project-state.json'),
      JSON.stringify({ pid: process.pid, port: 9999, sessionId: 'forged-in-project-dir' }),
      'utf8'
    )

    const sessionsFile = await seedStoredSession(profileDir, makeStoredRecord({ pid: 44300 }))
    const osControl: PreviewOsControl = {
      inspectProcess: vi.fn(async (pid) => ({
        pid,
        creationTimeMs: 1_700_000_010_000,
        executablePath: NODE_EXE,
        commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}" --foreground`,
        cwd: projectDirRealpath
      })),
      findLoopbackPortOwner: vi.fn(async (port) => ({ host: '127.0.0.1', port, pid: 44300 })),
      probeHttpIdentity: vi.fn(async () => ({
        isHyperframes: true,
        pid: 44300,
        projectName: 'proj-1',
        projectDir: projectDirRealpath,
        version: '0.9.94'
      })),
      terminateProcessTree: vi.fn().mockResolvedValue(true)
    }

    const manager = new VideoStudioPreviewManager(profileDir, { osControl })
    const stopped = await manager.stopPreview('proj-1', projectDir)
    expect(stopped).toEqual({ active: false })
    expect(osControl.terminateProcessTree).toHaveBeenCalledWith(44300)

    const persisted = JSON.parse(await readFile(sessionsFile, 'utf8')) as {
      sessions: Record<string, PreviewSessionRecord>
    }
    expect(persisted.sessions['proj-1']).toBeUndefined()
  })

  it('serializes concurrent startPreview calls for the same project so only one server spawns', async () => {
    let releaseFirstStart!: () => void
    const firstStartGate = new Promise<void>((resolve) => {
      releaseFirstStart = resolve
    })
    let spawnCount = 0
    const adapter: VideoRenderEngineAdapter = {
      ...makeAdapter(),
      startPreview: vi.fn(async () => {
        spawnCount += 1
        if (spawnCount === 1) {
          await firstStartGate
        }
        return {
          state: { active: true, url: 'http://127.0.0.1:43001/#project/proj-1', port: 43001 },
          pid: 51001,
          projectName: 'proj-1',
          executablePath: NODE_EXE,
          stop: vi.fn().mockResolvedValue(undefined)
        }
      })
    }

    const osControl: PreviewOsControl = {
      inspectProcess: vi.fn(async (pid) => ({
        pid,
        creationTimeMs: 1_700_000_050_000,
        executablePath: NODE_EXE,
        commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}"`,
        cwd: projectDirRealpath
      })),
      findLoopbackPortOwner: vi.fn(async (port) => ({ host: '127.0.0.1', port, pid: 51001 })),
      probeHttpIdentity: vi.fn(async () => ({
        isHyperframes: true,
        pid: 51001,
        projectName: 'proj-1',
        projectDir: projectDirRealpath,
        version: '0.9.94'
      })),
      terminateProcessTree: vi.fn().mockResolvedValue(true)
    }

    const manager = new VideoStudioPreviewManager(profileDir, { osControl })
    const deps = makeDummyDeps()

    const p1 = manager.startPreview({ projectId: 'proj-1', projectDir, adapter, deps })
    const p2 = manager.startPreview({ projectId: 'proj-1', projectDir, adapter, deps })
    releaseFirstStart()

    const [h1, h2] = await Promise.all([p1, p2])
    expect(adapter.startPreview).toHaveBeenCalledTimes(1)
    expect(h1.sessionId).toBe(h2.sessionId)
    expect(h1.state).toEqual(h2.state)
  })

  it('rejects and avoids persisting when child exits during inspectProcess await', async () => {
    let resolveInspect!: (val: null) => void
    const inspectGate = new Promise<null>((resolve) => {
      resolveInspect = resolve
    })
    let triggerExit!: () => void

    const adapter: VideoRenderEngineAdapter = {
      ...makeAdapter(),
      startPreview: vi.fn(async (_dir, _deps, onExit) => {
        triggerExit = onExit
        return {
          state: { active: true, url: 'http://127.0.0.1:43001/#project/proj-1', port: 43001 },
          pid: 51001,
          projectName: 'proj-1',
          executablePath: NODE_EXE,
          stop: vi.fn().mockResolvedValue(undefined)
        }
      })
    }

    const osControl: PreviewOsControl = {
      inspectProcess: vi.fn(() => inspectGate),
      findLoopbackPortOwner: vi.fn().mockResolvedValue(null),
      probeHttpIdentity: vi.fn().mockResolvedValue(null),
      terminateProcessTree: vi.fn().mockResolvedValue(true)
    }

    const onExit = vi.fn()
    const manager = new VideoStudioPreviewManager(profileDir, { osControl })
    const startPromise = manager.startPreview({
      projectId: 'proj-1',
      projectDir,
      adapter,
      deps: makeDummyDeps(),
      onExit
    })

    await vi.waitFor(() => expect(triggerExit).toBeDefined())
    triggerExit()
    resolveInspect(null)

    await expect(startPromise).rejects.toThrow('video_studio_preview_exited')
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(manager.getPreviewState('proj-1')).toEqual({ active: false })
    expect(await manager.listStoredSessions()).toEqual({})
  })

  it('never fabricates Date.now() for creationTimeMs when inspectProcess returns null creationTimeMs', async () => {
    const rawStop = vi.fn().mockResolvedValue(undefined)
    const adapter: VideoRenderEngineAdapter = {
      ...makeAdapter(),
      startPreview: vi.fn(async () => ({
        state: { active: true, url: 'http://127.0.0.1:43001/#project/proj-1', port: 43001 },
        pid: 51001,
        projectName: 'proj-1',
        executablePath: NODE_EXE,
        stop: rawStop
      }))
    }
    const osControl: PreviewOsControl = {
      inspectProcess: vi.fn(async (pid) => ({
        pid,
        creationTimeMs: null,
        executablePath: NODE_EXE,
        commandLine: `"${NODE_EXE}" "hyperframes.mjs" preview "${projectDirRealpath}"`,
        cwd: projectDirRealpath
      })),
      findLoopbackPortOwner: vi.fn().mockResolvedValue(null),
      probeHttpIdentity: vi.fn().mockResolvedValue(null),
      terminateProcessTree: vi.fn().mockResolvedValue(true)
    }

    const manager = new VideoStudioPreviewManager(profileDir, { osControl })
    const handle = await manager.startPreview({
      projectId: 'proj-1',
      projectDir,
      adapter,
      deps: makeDummyDeps()
    })
    expect(handle.state.active).toBe(true)
    expect(await manager.listStoredSessions()).toEqual({})

    await handle.stop()
    expect(rawStop).toHaveBeenCalledTimes(1)
  })

  it('skips full-table CIM scan and sets UTF-8 encoding in single-PID Windows CIM query when native start time is unavailable', async () => {
    const readTableFresh = vi.fn()
    const querySinglePid = vi.fn().mockResolvedValue({
      pid: 44100,
      creationTimeMs: 1_700_000_000_000,
      executablePath: NODE_EXE,
      commandLine: `"${NODE_EXE}" preview`
    })

    const observed = await inspectWindowsProcessWith(44100, {
      isStartTimeAvailable: () => false,
      readProcessTableFresh: readTableFresh,
      readProcessCreationTime: vi.fn(),
      querySingleProcessCim: querySinglePid
    })

    expect(readTableFresh).not.toHaveBeenCalled()
    expect(querySinglePid).toHaveBeenCalledWith(44100)
    expect(observed?.creationTimeMs).toBe(1_700_000_000_000)

    const script = buildWindowsSingleProcessCimScript(44100)
    expect(script).toContain('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;')
    expect(script).toContain('ProcessId=44100')
  })
})
