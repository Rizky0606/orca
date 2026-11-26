import { parseHyperFramesPreviewJson, parsePreviewUrl } from './hyperframes-cli-parsers'
import type { HyperFramesInvocation } from './hyperframes-environment-probe'
import type {
  VideoEngineProcessDeps,
  VideoPreviewStartOptions,
  VideoStudioPreviewHandle
} from './video-render-engine'

export async function launchHyperFramesPreviewProcess(params: {
  projectDir: string
  invocation: HyperFramesInvocation
  deps: VideoEngineProcessDeps
  onExit: () => void
  options: VideoPreviewStartOptions
}): Promise<VideoStudioPreviewHandle> {
  const { projectDir, invocation, deps, onExit, options } = params
  const port = options.port ?? (await deps.allocateLoopbackPort())
  return new Promise<VideoStudioPreviewHandle>((resolve, reject) => {
    let settled = false
    let processHandle: ReturnType<typeof deps.spawnPreviewStream>
    const cleanupTimer = setTimeout(() => {
      if (!settled) {
        settled = true
        void processHandle?.stop()
        reject(new Error('video_studio_preview_timeout'))
      }
    }, 20_000)

    const onAbort = () => {
      if (!settled) {
        settled = true
        clearTimeout(cleanupTimer)
        void processHandle?.stop()
        reject(new Error('video_studio_preview_cancelled'))
      }
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    const args = [
      ...invocation.prefixArgs,
      'preview',
      projectDir,
      '--foreground',
      '--json',
      '--no-open',
      '--port',
      String(port),
      ...(options.forceNew ? ['--force-new'] : [])
    ]

    processHandle = deps.spawnPreviewStream({
      program: invocation.program,
      args,
      cwd: projectDir,
      onOutputLine: (line) => {
        if (settled) {
          return
        }
        const parsed = parseHyperFramesPreviewJson(line, port)
        if (parsed && !parsed.ok) {
          settled = true
          clearTimeout(cleanupTimer)
          options.signal?.removeEventListener('abort', onAbort)
          void processHandle?.stop()
          reject(new Error(parsed.errorCode))
          return
        }
        if (parsed?.ok && parsed.ready) {
          settled = true
          clearTimeout(cleanupTimer)
          options.signal?.removeEventListener('abort', onAbort)
          resolve({
            state: { active: true, url: parsed.url, port: parsed.port },
            pid: parsed.pid ?? processHandle.pid,
            projectName: parsed.projectName,
            executablePath: invocation.program,
            stop: () => processHandle.stop()
          })
          return
        }
        const fallbackUrl = parsePreviewUrl(line, port)
        if (fallbackUrl) {
          settled = true
          clearTimeout(cleanupTimer)
          options.signal?.removeEventListener('abort', onAbort)
          resolve({
            state: { active: true, url: fallbackUrl, port },
            pid: processHandle.pid,
            executablePath: invocation.program,
            stop: () => processHandle.stop()
          })
        }
      },
      onExit: (code) => {
        if (!settled) {
          settled = true
          clearTimeout(cleanupTimer)
          options.signal?.removeEventListener('abort', onAbort)
          reject(new Error(`video_studio_preview_exited:${code ?? 'unknown'}`))
        } else {
          onExit()
        }
      }
    })
  })
}
