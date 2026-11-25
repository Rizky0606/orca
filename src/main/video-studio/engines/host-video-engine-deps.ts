import { rm, stat } from 'node:fs/promises'
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
import { hydrateShellPathForAgentDetection } from '../../ipc/command-path/agent-detection-shell-path'
import { resolveCommandOnLocalPath } from '../../ipc/command-path/command-path-resolver'
import { buildLocalPreflightEnv } from '../../ipc/preflight/preflight-local-env'
import type { VideoEngineProcessDeps, VideoProcessResult } from './video-render-engine'

function getEnv(): NodeJS.ProcessEnv {
  return buildLocalPreflightEnv() ?? process.env
}

async function resolveExecutable(program: string): Promise<string> {
  if (process.platform === 'win32') {
    return (await resolveCommandOnLocalPath(program, { env: getEnv() })) ?? program
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
  return {
    hydrateShellPath: async (refresh = true) => {
      await hydrateShellPathForAgentDetection(undefined, refresh)
    },
    resolveCommand: (program) => resolveCommandOnLocalPath(program, { env: getEnv() }),
    allocateLoopbackPort: allocateFreeLoopbackPort,
    runProcess: async (spec) => {
      const program = await resolveExecutable(spec.program)
      const res = await runProcess(
        {
          program,
          args: spec.args,
          cwd: spec.cwd,
          env: getEnv(),
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
      const program = await resolveExecutable(spec.program)
      if (spec.signal?.aborted) {
        return { code: null, signal: null, stdout: '', stderr: '', timedOut: false }
      }
      const child = spawnProcess({
        program,
        args: spec.args,
        cwd: spec.cwd,
        env: getEnv(),
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
        env: getEnv(),
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
