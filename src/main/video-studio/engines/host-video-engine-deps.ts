import { access, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { runProcess, spawnProcess } from '@orca/process-host'
import { createOutputSink } from '@orca/process-host/bounded-output-sink'
import { createChildTerminationReporter } from '@orca/process-host/child-termination-reporter'
import {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_PROCESS_TIMEOUT_MS
} from '@orca/process-host/process-spec'
import {
  forceTerminateProcessTree,
  signalProcessTree
} from '@orca/process-host/process-tree-termination'
import { ORCAD_WSL_HOST_ENV } from '../../../shared/remote-runtime/serve-supervisor/orcad-server-launch-env'
import { hydrateShellPathForAgentDetection } from '../../ipc/command-path/agent-detection-shell-path'
import { resolveCommandOnLocalPath } from '../../ipc/command-path/command-path-resolver'
import { mergePersistedWindowsPathAsync } from '../../pty/environment/windows-environment-path'
import {
  parseWindowsDriveMountPoints,
  withoutWindowsDriveMountDirs
} from '../../wsl/filesystem/wsl-guest-windows-drive-path'
import type { VideoEngineProcessDeps, VideoProcessResult } from './video-render-engine'

function copyDefinedProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

async function resolveExecutable(program: string, env: NodeJS.ProcessEnv): Promise<string> {
  if (process.platform === 'win32') {
    return (await resolveCommandOnLocalPath(program, { env })) ?? program
  }
  return program
}

async function allocateFreeLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr)
        } else {
          resolve(port)
        }
      })
    })
  })
}

async function stopChildTree(child: ReturnType<typeof spawnProcess>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  await signalProcessTree(child).catch(() => {})
  const settled = await Promise.race([
    new Promise<boolean>((resolve) => {
      child.once('close', () => resolve(true))
    }),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 3000)
    })
  ])
  if (!settled) {
    await forceTerminateProcessTree(child).catch(() => {})
  }
}

export function createHostVideoEngineDeps(): VideoEngineProcessDeps {
  let cachedWslMounts: readonly string[] | null = null
  let latestEnv: NodeJS.ProcessEnv | null = null

  const readWslMountsAsync = async (): Promise<readonly string[]> => {
    if (cachedWslMounts !== null) {
      return cachedWslMounts
    }
    if (process.platform !== 'linux' || process.env[ORCAD_WSL_HOST_ENV] !== '1') {
      cachedWslMounts = []
      return cachedWslMounts
    }
    const isWsl =
      Boolean(process.env.WSL_DISTRO_NAME?.trim() || process.env.WSL_INTEROP?.trim()) ||
      (await access('/proc/sys/fs/binfmt_misc/WSLInterop').then(
        () => true,
        () => false
      ))
    if (!isWsl) {
      cachedWslMounts = []
      return cachedWslMounts
    }
    try {
      cachedWslMounts = parseWindowsDriveMountPoints(await readFile('/proc/mounts', 'utf8'))
    } catch {
      cachedWslMounts = []
    }
    return cachedWslMounts
  }

  const getAsyncEnv = async (): Promise<NodeJS.ProcessEnv> => {
    const env = copyDefinedProcessEnv()
    if (process.platform === 'win32') {
      await mergePersistedWindowsPathAsync(env)
    } else {
      const mounts = await readWslMountsAsync()
      if (mounts.length > 0 && env.PATH) {
        env.PATH = withoutWindowsDriveMountDirs(env.PATH, mounts)
      }
    }
    latestEnv = env
    return env
  }

  return {
    hydrateShellPath: async (refresh = true) => {
      await hydrateShellPathForAgentDetection(undefined, refresh)
      await getAsyncEnv()
    },
    resolveCommand: async (program) => {
      const env = await getAsyncEnv()
      return resolveCommandOnLocalPath(program, { env })
    },
    allocateLoopbackPort: allocateFreeLoopbackPort,
    runProcess: async (spec) => {
      const env = await getAsyncEnv()
      const program = await resolveExecutable(spec.program, env)
      const res = await runProcess(
        {
          program,
          args: spec.args,
          cwd: spec.cwd,
          env,
          timeoutMs: spec.timeoutMs,
          signal: spec.signal,
          detached: process.platform !== 'win32'
        },
        'tail'
      )
      return {
        code: res.code,
        signal: res.signal,
        stdout: res.stdout,
        stderr: res.stderr,
        timedOut: res.timedOut
      }
    },
    runProcessStreaming: async (spec) => {
      const env = await getAsyncEnv()
      const program = await resolveExecutable(spec.program, env)
      if (spec.signal?.aborted) {
        return { code: null, signal: null, stdout: '', stderr: '', timedOut: false }
      }
      const child = spawnProcess({
        program,
        args: spec.args,
        cwd: spec.cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      })
      const stdoutSink = createOutputSink(DEFAULT_MAX_OUTPUT_BYTES, 'tail')
      const stderrSink = createOutputSink(DEFAULT_MAX_OUTPUT_BYTES, 'tail')
      const reporter = createChildTerminationReporter()
      let timedOut = false

      const emitLines = (stream: NodeJS.ReadableStream | null) => {
        if (!stream) {
          return
        }
        const rl = createInterface({ input: stream, crlfDelay: Infinity })
        rl.on('line', (line) => {
          const trimmed = line.trim()
          if (trimmed) {
            spec.onOutputLine?.(trimmed)
          }
        })
      }

      emitLines(child.stdout)
      emitLines(child.stderr)
      child.stdout?.on('data', (chunk: Buffer) => stdoutSink.write(chunk))
      child.stderr?.on('data', (chunk: Buffer) => stderrSink.write(chunk))

      const timeoutMs = spec.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true
              void stopChildTree(child)
            }, timeoutMs)
          : undefined

      const onAbort = () => {
        void stopChildTree(child)
      }
      spec.signal?.addEventListener('abort', onAbort, { once: true })

      return new Promise<VideoProcessResult>((resolve, reject) => {
        child.once('error', (err) => {
          if (timer) {
            clearTimeout(timer)
          }
          spec.signal?.removeEventListener('abort', onAbort)
          reporter.report()
          reject(err)
        })
        child.once('close', (code, signal) => {
          if (timer) {
            clearTimeout(timer)
          }
          spec.signal?.removeEventListener('abort', onAbort)
          reporter.report()
          resolve({
            code,
            signal,
            stdout: stdoutSink.text(),
            stderr: stderrSink.text(),
            timedOut
          })
        })
      })
    },
    spawnPreviewStream: (spec) => {
      const child = spawnProcess({
        program: spec.program,
        args: spec.args,
        cwd: spec.cwd,
        env: latestEnv ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      })
      const wireLines = (stream: NodeJS.ReadableStream | null) => {
        if (!stream) {
          return
        }
        const rl = createInterface({ input: stream, crlfDelay: Infinity })
        rl.on('line', (line) => {
          const trimmed = line.trim()
          if (trimmed) {
            spec.onOutputLine(trimmed)
          }
        })
      }
      wireLines(child.stdout)
      wireLines(child.stderr)
      const exited = new Promise<number | null>((resolve) => {
        child.once('error', () => {
          spec.onExit(null)
          resolve(null)
        })
        child.once('close', (code) => {
          spec.onExit(code)
          resolve(code)
        })
      })
      return {
        stop: () => stopChildTree(child),
        exited
      }
    },
    statFile: (path) =>
      stat(path).then(
        (s) => ({ size: s.size }),
        () => null
      ),
    removeFile: (path) => rm(path, { force: true })
  }
}
