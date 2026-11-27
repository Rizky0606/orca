import { access, constants, stat } from 'node:fs/promises'
import { resolveCommandOnLocalPath } from '../../ipc/command-path/command-path-resolver'
import {
  collectStandardInstallDirs,
  deduplicateDirs,
  getEnvValue,
  getPathModule
} from './video-tool-standard-dirs'

export type ResolveVideoToolOptions = {
  program: string
  hostEnv?: NodeJS.ProcessEnv
  engineEnv?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  fallbackDirs?: readonly string[]
}

export type EnrichVideoEngineEnvOptions = {
  platform?: NodeJS.Platform
  fallbackDirs?: readonly string[]
}

const DEFAULT_WINDOWS_PATHEXT = ['.COM', '.EXE', '.BAT', '.CMD']

const OVERRIDE_KEYS_BY_TOOL: Readonly<Record<string, readonly string[]>> = {
  ffmpeg: ['ORCA_FFMPEG_BIN', 'HYPERFRAMES_FFMPEG_PATH', 'FFMPEG_PATH'],
  ffprobe: ['ORCA_FFPROBE_BIN', 'HYPERFRAMES_FFPROBE_PATH', 'FFPROBE_PATH'],
  hyperframes: ['ORCA_HYPERFRAMES_BIN', 'HYPERFRAMES_BIN']
}

const COMPANION_TOOL: Readonly<Record<string, string>> = {
  ffmpeg: 'ffprobe',
  ffprobe: 'ffmpeg'
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function getLogicalToolKey(program: string, platform: NodeJS.Platform): string {
  const trimmed = stripOuterQuotes(program)
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) {
    return ''
  }
  const lower = trimmed.toLowerCase()
  return platform === 'win32' ? lower.replace(/\.(exe|cmd|bat|com)$/i, '') : lower
}

function parseWindowsPathext(envA?: NodeJS.ProcessEnv, envB?: NodeJS.ProcessEnv): string[] {
  const raw = getEnvValue(envA, 'PATHEXT') ?? getEnvValue(envB, 'PATHEXT')
  if (!raw) {
    return DEFAULT_WINDOWS_PATHEXT
  }
  const parsed = raw
    .split(';')
    .map((ext) => ext.trim())
    .filter((ext) => ext.length > 0)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
  return parsed.length > 0 ? parsed : DEFAULT_WINDOWS_PATHEXT
}

async function isRunnableFile(filePath: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return false
    }
    if (platform !== 'win32') {
      await access(filePath, constants.X_OK)
    }
    return true
  } catch {
    return false
  }
}

async function findExecutableInDir(
  dir: string,
  commandName: string,
  platform: NodeJS.Platform,
  pathext: readonly string[]
): Promise<string | null> {
  const pathMod = getPathModule(platform)
  const trimmed = stripOuterQuotes(commandName)
  if (!trimmed) {
    return null
  }

  const candidates =
    platform === 'win32'
      ? pathext.some((ext) => trimmed.toLowerCase().endsWith(ext.toLowerCase()))
        ? [trimmed]
        : pathext.map((ext) => `${trimmed}${ext.toLowerCase()}`)
      : [trimmed]

  for (const candidate of candidates) {
    const fullPath = pathMod.join(dir, candidate)
    if (await isRunnableFile(fullPath, platform)) {
      return fullPath
    }
  }
  return null
}

async function resolveExplicitOverride(
  toolKey: string,
  hostEnv: NodeJS.ProcessEnv,
  engineEnv: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  pathext: readonly string[]
): Promise<string | null> {
  const keys = OVERRIDE_KEYS_BY_TOOL[toolKey]
  if (!keys || keys.length === 0) {
    return null
  }
  const pathMod = getPathModule(platform)

  for (const key of keys) {
    const raw =
      key === 'HYPERFRAMES_FFMPEG_PATH' || key === 'HYPERFRAMES_FFPROBE_PATH'
        ? (getEnvValue(engineEnv, key) ?? getEnvValue(hostEnv, key))
        : (getEnvValue(hostEnv, key) ?? getEnvValue(engineEnv, key))
    if (!raw) {
      continue
    }
    const candidate = stripOuterQuotes(raw)
    if (!candidate) {
      continue
    }

    try {
      const info = await stat(candidate)
      if (info.isFile() && (await isRunnableFile(candidate, platform))) {
        return pathMod.normalize(candidate)
      }
      if (info.isDirectory()) {
        const inDir = await findExecutableInDir(candidate, toolKey, platform, pathext)
        if (inDir) {
          return inDir
        }
      }
    } catch {
      // Fall through to Win32 extension permutation or lower-priority discovery paths.
    }

    if (platform === 'win32' && (candidate.includes('/') || candidate.includes('\\'))) {
      const inDir = await findExecutableInDir(
        pathMod.dirname(candidate),
        pathMod.basename(candidate),
        platform,
        pathext
      )
      if (inDir) {
        return inDir
      }
    }
  }

  return null
}

async function resolveWithoutCompanion(
  program: string,
  hostEnv: NodeJS.ProcessEnv,
  engineEnv: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  fallbackDirs: readonly string[]
): Promise<string | null> {
  const pathMod = getPathModule(platform)
  const pathext = parseWindowsPathext(engineEnv, hostEnv)
  const toolKey = getLogicalToolKey(program, platform)

  if (toolKey) {
    const overrideHit = await resolveExplicitOverride(
      toolKey,
      hostEnv,
      engineEnv,
      platform,
      pathext
    )
    if (overrideHit) {
      return overrideHit
    }
  }

  const pathHit = await resolveCommandOnLocalPath(program, { env: engineEnv, platform })
  if (pathHit && (await isRunnableFile(pathHit, platform))) {
    return pathMod.normalize(pathHit)
  }

  if (!program.includes('/') && !program.includes('\\')) {
    const candidateDirs = await collectStandardInstallDirs(hostEnv, platform, fallbackDirs)
    const searchName = toolKey || program
    for (const dir of candidateDirs) {
      const hit = await findExecutableInDir(dir, searchName, platform, pathext)
      if (hit) {
        return hit
      }
    }
  }

  return null
}

export async function resolveVideoToolCommand(
  options: ResolveVideoToolOptions
): Promise<string | null> {
  const platform = options.platform ?? process.platform
  const hostEnv = options.hostEnv ?? process.env
  const engineEnv = options.engineEnv ?? hostEnv
  const fallbackDirs = options.fallbackDirs ?? []

  const direct = await resolveWithoutCompanion(
    options.program,
    hostEnv,
    engineEnv,
    platform,
    fallbackDirs
  )
  if (direct) {
    return direct
  }

  const toolKey = getLogicalToolKey(options.program, platform)
  const companionKey = toolKey ? COMPANION_TOOL[toolKey] : undefined
  if (!companionKey) {
    return null
  }

  const companionPath = await resolveWithoutCompanion(
    companionKey,
    hostEnv,
    engineEnv,
    platform,
    fallbackDirs
  )
  if (!companionPath) {
    return null
  }

  const pathMod = getPathModule(platform)
  const pathext = parseWindowsPathext(engineEnv, hostEnv)
  return findExecutableInDir(pathMod.dirname(companionPath), toolKey, platform, pathext)
}

function appendMissingPathDirs(
  existingPath: string | undefined,
  extraDirs: readonly string[],
  platform: NodeJS.Platform
): string {
  const pathMod = getPathModule(platform)
  const existingParts = existingPath
    ? existingPath.split(pathMod.delimiter).filter((part) => part.trim().length > 0)
    : []
  return deduplicateDirs([...existingParts, ...extraDirs], platform).join(pathMod.delimiter)
}

export async function enrichVideoEngineEnv(
  hostEnv: NodeJS.ProcessEnv,
  engineEnv: Record<string, string>,
  options?: EnrichVideoEngineEnvOptions
): Promise<Record<string, string>> {
  const platform = options?.platform ?? process.platform
  const fallbackDirs = options?.fallbackDirs ?? []
  const pathMod = getPathModule(platform)

  const [ffmpegPath, ffprobePath, hyperframesPath] = await Promise.all([
    resolveVideoToolCommand({ program: 'ffmpeg', hostEnv, engineEnv, platform, fallbackDirs }),
    resolveVideoToolCommand({ program: 'ffprobe', hostEnv, engineEnv, platform, fallbackDirs }),
    resolveVideoToolCommand({ program: 'hyperframes', hostEnv, engineEnv, platform, fallbackDirs })
  ])

  const discoveredDirs: string[] = []
  if (ffmpegPath) {
    engineEnv.HYPERFRAMES_FFMPEG_PATH = ffmpegPath
    discoveredDirs.push(pathMod.dirname(ffmpegPath))
  }
  if (ffprobePath) {
    engineEnv.HYPERFRAMES_FFPROBE_PATH = ffprobePath
    discoveredDirs.push(pathMod.dirname(ffprobePath))
  }
  if (hyperframesPath) {
    discoveredDirs.push(pathMod.dirname(hyperframesPath))
  }

  if (discoveredDirs.length > 0) {
    const mergedPath = appendMissingPathDirs(engineEnv.PATH, discoveredDirs, platform)
    if (mergedPath) {
      engineEnv.PATH = mergedPath
    }
  }

  return engineEnv
}
