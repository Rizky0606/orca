import { join } from 'node:path'
import type { VideoStudioEngine } from '../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioEngineStatus,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot,
  VideoStudioStartRenderParams
} from '../../../shared/video-studio/video-studio-rpc-contract'
import type { VideoEngineProcessDeps, VideoRenderEngineAdapter } from './video-render-engine'

const ENGINE: VideoStudioEngine = 'hyperframes'

// ─── Progress parsing ─────────────────────────────────────────────────────────

function parseProgressPercent(line: string): number | undefined {
  // HyperFrames emits: {"progress": 0.42} or "progress: 42%"
  try {
    const obj = JSON.parse(line)
    if (typeof obj === 'object' && obj !== null && typeof obj.progress === 'number') {
      return Math.round(obj.progress * 100)
    }
  } catch {
    // not JSON
  }
  const pct = /progress:\s*(\d+(?:\.\d+)?)%/i.exec(line)
  if (pct) {
    return Math.round(Number(pct[1]))
  }
  return undefined
}

function parsePort(line: string): number | undefined {
  // "Local: http://localhost:3344" or "Listening on port 3344"
  const m = /(?:localhost|port)[:\s]+(\d{4,5})/i.exec(line)
  return m ? Number(m[1]) : undefined
}

// ─── Doctor result parsing ────────────────────────────────────────────────────

type DoctorJson = {
  hyperframes?: { installed: boolean; version?: string; path?: string }
  ffmpeg?: { installed: boolean }
}

function parseDoctorJson(stdout: string): DoctorJson | null {
  try {
    return JSON.parse(stdout) as DoctorJson
  } catch {
    return null
  }
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const hyperFramesEngineAdapter: VideoRenderEngineAdapter = {
  engine: ENGINE,

  async probeEnvironment(deps: VideoEngineProcessDeps): Promise<VideoStudioEngineStatus> {
    await deps.hydrateShellPath()
    const hfBin = await deps.resolveCommand('hyperframes')
    if (!hfBin) {
      return {
        engine: ENGINE,
        available: false,
        status: 'not_installed',
        details:
          'hyperframes CLI not found on PATH. Run: npm install -g @hyperframes/cli (Node.js required)'
      }
    }
    // Run `hyperframes doctor --json` to get detailed status
    const result = await deps
      .runProcess({ program: hfBin, args: ['doctor', '--json'], timeoutMs: 15_000 })
      .catch(() => null)

    const doctor = result ? parseDoctorJson(result.stdout) : null
    const hf = doctor?.hyperframes
    const version = hf?.version

    if (!hf?.installed) {
      return { engine: ENGINE, available: false, status: 'not_installed', version }
    }
    const ffmpegOk = doctor?.ffmpeg?.installed ?? false
    if (!ffmpegOk) {
      return {
        engine: ENGINE,
        available: false,
        status: 'missing_dependency',
        details: 'ffmpeg not found. Install ffmpeg and ensure it is on PATH.',
        version
      }
    }
    return { engine: ENGINE, available: true, status: 'ready', version }
  },

  async checkComposition(
    projectDir: string,
    deps: VideoEngineProcessDeps,
    signal?: AbortSignal
  ): Promise<VideoStudioCheckResult> {
    await deps.hydrateShellPath()
    const hfBin = await deps.resolveCommand('hyperframes')
    if (!hfBin) {
      return {
        passed: false,
        issues: [{ severity: 'error', message: 'hyperframes CLI not found' }]
      }
    }
    const start = Date.now()
    const result = await deps.runProcess({
      program: hfBin,
      args: ['check', '--json'],
      cwd: projectDir,
      timeoutMs: 60_000,
      signal
    })
    const durationMs = Date.now() - start

    // Try to parse structured JSON output
    try {
      const parsed = JSON.parse(result.stdout)
      if (Array.isArray(parsed?.issues)) {
        return {
          passed: (result.code ?? 1) === 0,
          issues: parsed.issues,
          durationMs
        }
      }
    } catch {
      // fall through to raw text
    }

    const passed = (result.code ?? 1) === 0
    const lines = (result.stdout + result.stderr)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    return {
      passed,
      issues: passed
        ? []
        : lines.map((message) => ({ severity: 'error' as const, message })).slice(0, 20),
      durationMs
    }
  },

  async startPreview(
    projectDir: string,
    deps: VideoEngineProcessDeps,
    signal?: AbortSignal
  ): Promise<VideoStudioPreviewState> {
    await deps.hydrateShellPath()
    const hfBin = await deps.resolveCommand('hyperframes')
    if (!hfBin) {
      throw new Error('video_studio_engine_unavailable')
    }

    return new Promise<VideoStudioPreviewState>((resolve, reject) => {
      let resolved = false
      let handle: { kill(): void; exited: Promise<void> } | null = null

      deps
        .spawnStream({
          program: hfBin,
          args: ['preview', '--port', '0'],
          cwd: projectDir,
          signal,
          onLine: (line) => {
            if (resolved) {
              return
            }
            const port = parsePort(line)
            if (port) {
              resolved = true
              resolve({ running: true, port, url: `http://localhost:${port}` })
            }
          }
        })
        .then((h) => {
          handle = h
          if (!resolved) {
            h.exited.then(() => {
              if (!resolved) {
                resolved = true
                reject(new Error('video_studio_preview_exited_before_ready'))
              }
            })
          }
        })
        .catch((err) => {
          if (!resolved) {
            resolved = true
            reject(err)
          }
        })
      void handle
    })
  },

  async renderProject(
    projectDir: string,
    outputPath: string,
    params: Pick<VideoStudioStartRenderParams, 'quality'>,
    deps: VideoEngineProcessDeps,
    onProgress: (snapshot: Partial<VideoStudioRenderJobSnapshot>) => void,
    signal?: AbortSignal
  ): Promise<void> {
    await deps.hydrateShellPath()
    const hfBin = await deps.resolveCommand('hyperframes')
    if (!hfBin) {
      throw new Error('video_studio_engine_unavailable')
    }

    const qualityArgs: Record<string, string[]> = {
      draft: ['--quality', 'draft'],
      standard: [],
      high: ['--quality', 'high']
    }
    const extraArgs = qualityArgs[params.quality] ?? []

    const outputDir = join(outputPath, '..').replace(/\\/g, '/')
    const fileName = outputPath.split(/[\\/]/).pop() ?? 'output.mp4'

    const result = await deps.runProcess({
      program: hfBin,
      args: ['render', '--output-dir', outputDir, '--filename', fileName, ...extraArgs],
      cwd: projectDir,
      timeoutMs: 3_600_000,
      signal
    })

    // Best-effort progress reporting from stdout lines
    const lines = result.stdout.split('\n')
    for (const line of lines) {
      const pct = parseProgressPercent(line)
      if (pct !== undefined) {
        onProgress({ progressPercent: pct, logLines: [line.trim()].filter(Boolean) })
      }
    }

    if ((result.code ?? 1) !== 0) {
      throw new Error(
        `video_studio_render_failed: exit ${result.code}\n${result.stderr || result.stdout}`
      )
    }
  }
}
