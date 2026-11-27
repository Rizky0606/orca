import { readdir } from 'node:fs/promises'
import { posix, win32 } from 'node:path'

export function getPathModule(platform: NodeJS.Platform) {
  return platform === 'win32' ? win32 : posix
}

export function getEnvValue(env: NodeJS.ProcessEnv | undefined, key: string): string | undefined {
  if (!env) {
    return undefined
  }
  const direct = env[key]
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim()
  }
  const lowerKey = key.toLowerCase()
  for (const [entryKey, entryVal] of Object.entries(env)) {
    if (
      entryKey.toLowerCase() === lowerKey &&
      typeof entryVal === 'string' &&
      entryVal.trim().length > 0
    ) {
      return entryVal.trim()
    }
  }
  return undefined
}

export function deduplicateDirs(dirs: readonly string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const dir of dirs) {
    const cleaned = dir.trim()
    if (!cleaned) {
      continue
    }
    const key = platform === 'win32' ? cleaned.toLowerCase() : cleaned
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(cleaned)
  }
  return result
}

async function discoverWinGetFfmpegBins(localAppData: string | undefined): Promise<string[]> {
  if (!localAppData) {
    return []
  }
  const linksDir = win32.join(localAppData, 'Microsoft', 'WinGet', 'Links')
  const packagesDir = win32.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  const dirs = [linksDir]

  try {
    const pkgEntries = await readdir(packagesDir, { withFileTypes: true })
    const matchingPkgs = pkgEntries
      .filter((entry) => entry.isDirectory() && /ffmpeg/i.test(entry.name))
      .slice(0, 16)
    const nestedLists = await Promise.all(
      matchingPkgs.map(async (pkgEntry) => {
        const pkgRoot = win32.join(packagesDir, pkgEntry.name)
        const found = [win32.join(pkgRoot, 'bin'), pkgRoot]
        try {
          const children = await readdir(pkgRoot, { withFileTypes: true })
          for (const child of children.slice(0, 12)) {
            if (!child.isDirectory()) {
              continue
            }
            const childRoot = win32.join(pkgRoot, child.name)
            found.push(win32.join(childRoot, 'bin'), childRoot)
          }
        } catch {
          // Ignore unreadable package subdirectories.
        }
        return found
      })
    )
    for (const group of nestedLists) {
      dirs.push(...group)
    }
  } catch {
    // WinGet packages folder absent; Links directory alone is harmless.
  }

  return dirs
}

function pushDefinedDirs(target: string[], candidates: readonly (string | undefined)[]): void {
  for (const candidate of candidates) {
    if (candidate) {
      target.push(candidate)
    }
  }
}

export async function collectStandardInstallDirs(
  hostEnv: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  extraFallbackDirs: readonly string[]
): Promise<string[]> {
  const dirs: string[] = [...extraFallbackDirs]

  if (platform === 'win32') {
    const localAppData = getEnvValue(hostEnv, 'LOCALAPPDATA')
    const appData = getEnvValue(hostEnv, 'APPDATA')
    const userProfile = getEnvValue(hostEnv, 'USERPROFILE')
    const programFiles = getEnvValue(hostEnv, 'ProgramFiles') ?? 'C:\\Program Files'
    const programFilesX86 = getEnvValue(hostEnv, 'ProgramFiles(x86)')
    const programData = getEnvValue(hostEnv, 'ProgramData') ?? 'C:\\ProgramData'
    const systemDrive = getEnvValue(hostEnv, 'SystemDrive') ?? 'C:'
    const scoopRoot =
      getEnvValue(hostEnv, 'SCOOP') ?? (userProfile ? win32.join(userProfile, 'scoop') : undefined)
    const chocoRoot =
      getEnvValue(hostEnv, 'ChocolateyInstall') ?? win32.join(programData, 'chocolatey')

    dirs.push(...(await discoverWinGetFfmpegBins(localAppData)))
    if (scoopRoot) {
      dirs.push(
        win32.join(scoopRoot, 'shims'),
        win32.join(scoopRoot, 'apps', 'ffmpeg', 'current', 'bin')
      )
    }
    dirs.push(
      win32.join(chocoRoot, 'bin'),
      win32.join(chocoRoot, 'lib', 'ffmpeg', 'tools', 'ffmpeg', 'bin'),
      win32.join(chocoRoot, 'lib', 'ffmpeg-full', 'tools', 'ffmpeg', 'bin'),
      `${systemDrive}\\ffmpeg\\bin`,
      `${systemDrive}\\ffmpeg`,
      `${systemDrive}\\tools\\ffmpeg\\bin`,
      win32.join(programFiles, 'ffmpeg', 'bin'),
      win32.join(programFiles, 'ffmpeg'),
      win32.join(programFiles, 'Gyan', 'FFmpeg', 'bin'),
      win32.join(programFiles, 'nodejs')
    )
    pushDefinedDirs(dirs, [
      programFilesX86 ? win32.join(programFilesX86, 'ffmpeg', 'bin') : undefined,
      localAppData ? win32.join(localAppData, 'Programs', 'ffmpeg', 'bin') : undefined,
      localAppData ? win32.join(localAppData, 'Programs', 'ffmpeg') : undefined,
      localAppData ? win32.join(localAppData, 'pnpm') : undefined,
      appData ? win32.join(appData, 'npm') : undefined,
      userProfile ? win32.join(userProfile, 'ffmpeg', 'bin') : undefined,
      userProfile ? win32.join(userProfile, '.local', 'bin') : undefined
    ])
    return deduplicateDirs(dirs, platform)
  }

  const home = getEnvValue(hostEnv, 'HOME')
  if (platform === 'darwin') {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin')
  } else {
    dirs.push('/home/linuxbrew/.linuxbrew/bin', '/usr/local/bin', '/snap/bin')
  }
  pushDefinedDirs(dirs, [
    home ? posix.join(home, '.local', 'bin') : undefined,
    home ? posix.join(home, '.npm-global', 'bin') : undefined,
    home ? posix.join(home, '.local', 'share', 'pnpm') : undefined
  ])
  dirs.push('/usr/bin', '/bin')
  return deduplicateDirs(dirs, platform)
}
