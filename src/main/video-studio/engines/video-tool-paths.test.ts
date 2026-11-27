import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHostVideoEngineDeps } from './host-video-engine-deps'
import { buildSanitizedVideoEngineEnv } from './video-engine-env-allowlist'
import { enrichVideoEngineEnv, resolveVideoToolCommand } from './video-tool-paths'

const tempRoots: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-video-tool-paths-'))
  tempRoots.push(dir)
  return dir
}

async function touchDummyExecutable(filePath: string): Promise<string> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, 'dummy-binary\n', 'utf8')
  if (process.platform !== 'win32') {
    await chmod(filePath, 0o755)
  }
  return filePath
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('video-tool-paths', () => {
  it('discovers ffmpeg and sibling ffprobe from standard package dirs even with empty PATH', async () => {
    const root = await createTempDir()
    const isWin = process.platform === 'win32'
    const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg'
    const probeName = isWin ? 'ffprobe.exe' : 'ffprobe'
    const binDir = isWin
      ? join(
          root,
          'AppData',
          'Local',
          'Microsoft',
          'WinGet',
          'Packages',
          'Gyan.FFmpeg_test',
          'ffmpeg-7.1',
          'bin'
        )
      : join(root, 'home', '.local', 'bin')
    const ffmpegBin = await touchDummyExecutable(join(binDir, exeName))
    const ffprobeBin = await touchDummyExecutable(join(binDir, probeName))

    const hostEnv: NodeJS.ProcessEnv = isWin
      ? { LOCALAPPDATA: join(root, 'AppData', 'Local'), PATH: '' }
      : { HOME: join(root, 'home'), PATH: '' }
    const engineEnv = buildSanitizedVideoEngineEnv(hostEnv)

    const resolvedFfmpeg = await resolveVideoToolCommand({
      program: 'ffmpeg',
      hostEnv,
      engineEnv
    })
    const resolvedFfprobe = await resolveVideoToolCommand({
      program: 'ffprobe',
      hostEnv,
      engineEnv
    })

    expect(resolvedFfmpeg).toBe(ffmpegBin)
    expect(resolvedFfprobe).toBe(ffprobeBin)
  })

  it('resolves explicit ORCA_FFMPEG_BIN and discovers sibling ffprobe while stripping ORCA secrets', async () => {
    const root = await createTempDir()
    const binDir = join(root, 'custom-ffmpeg', 'bin')
    const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const probeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    const ffmpegBin = await touchDummyExecutable(join(binDir, exeName))
    const ffprobeBin = await touchDummyExecutable(join(binDir, probeName))

    const hostEnv: NodeJS.ProcessEnv = {
      PATH: '',
      ORCA_FFMPEG_BIN: ffmpegBin,
      ORCA_AUTH_TOKEN: 'secret-orca-token',
      OPENAI_API_KEY: 'secret-openai-key'
    }
    const engineEnv = buildSanitizedVideoEngineEnv(hostEnv)
    await enrichVideoEngineEnv(hostEnv, engineEnv)

    expect(engineEnv.ORCA_FFMPEG_BIN).toBeUndefined()
    expect(engineEnv.ORCA_AUTH_TOKEN).toBeUndefined()
    expect(engineEnv.OPENAI_API_KEY).toBeUndefined()
    expect(engineEnv.HYPERFRAMES_FFMPEG_PATH).toBe(ffmpegBin)
    expect(engineEnv.HYPERFRAMES_FFPROBE_PATH).toBe(ffprobeBin)
    expect(engineEnv.PATH).toContain(binDir)
  })

  it('falls back cleanly to PATH or standard dirs when override points to a missing path', async () => {
    const root = await createTempDir()
    const fallbackBinDir = join(root, 'ffmpeg-fallback', 'bin')
    const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const validFfmpeg = await touchDummyExecutable(join(fallbackBinDir, exeName))

    const hostEnv: NodeJS.ProcessEnv = {
      PATH: '',
      ORCA_FFMPEG_BIN: join(root, 'does-not-exist', exeName),
      FFMPEG_PATH: join(root, 'also-missing', exeName)
    }
    const engineEnv = buildSanitizedVideoEngineEnv({
      ...hostEnv,
      HYPERFRAMES_FFMPEG_PATH: join(root, 'broken-hf', exeName)
    })

    await enrichVideoEngineEnv(hostEnv, engineEnv, { fallbackDirs: [fallbackBinDir] })

    expect(engineEnv.HYPERFRAMES_FFMPEG_PATH).toBe(validFfmpeg)
    expect(engineEnv.PATH).toContain(fallbackBinDir)
  })

  it('wires ORCA_FFMPEG_BIN and FFMPEG_PATH into createHostVideoEngineDeps resolveCommand', async () => {
    const root = await createTempDir()
    const binDir = join(root, 'live-override-bin')
    const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const probeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    const ffmpegBin = await touchDummyExecutable(join(binDir, exeName))
    const ffprobeBin = await touchDummyExecutable(join(binDir, probeName))

    vi.stubEnv('ORCA_FFMPEG_BIN', ffmpegBin)
    const deps = createHostVideoEngineDeps()
    await deps.hydrateShellPath(true)

    expect(await deps.resolveCommand('ffmpeg')).toBe(ffmpegBin)
    expect(await deps.resolveCommand('ffprobe')).toBe(ffprobeBin)
  })
})
