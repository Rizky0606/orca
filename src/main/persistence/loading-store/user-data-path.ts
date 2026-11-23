import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../../shared/file-access/cross-platform-path'
import { hardenExistingSecureFile } from '../../../shared/secure-storage/secure-file'
import { MOBILE_PAIRING_USERDATA_FILES } from '../../runtime/rpc/server/pairing/mobile-pairing-files'

// Capture after dev redirection but before app.setName changes path casing and loses case-sensitive data.
let _dataFile: string | null = null
let _userDataDir: string | null = null

export function initDataPath(): void {
  const userDataDir = getAppEnvironment().getPath('userData')
  _userDataDir = userDataDir
  _dataFile = join(userDataDir, 'orca-data.json')
}

export function getDataFile(): string {
  if (!_dataFile) {
    const userDataDir = getAppEnvironment().getPath('userData')
    _userDataDir = userDataDir
    _dataFile = join(userDataDir, 'orca-data.json')
  }
  return _dataFile
}

// Cache polls use a disposable sidecar to avoid full-profile rewrites; snapshots accelerate next-launch badges.
export function getGithubCacheFile(dataFile = getDataFile()): string {
  return join(dirname(dataFile), 'orca-github-cache.json')
}

/** Reuse the path captured before app.setName; late resolution can change casing and strand paired devices. */
export function getCanonicalUserDataPath(): string {
  if (!_userDataDir) {
    _userDataDir = getAppEnvironment().getPath('userData')
  }
  return _userDataDir
}

export type ApplicationHomePaths = {
  userData: string
  appData: string
  home: string
  xdgDataHome?: string
}

const MACHINE_DATA_ROOT = /^\.orca-[a-f0-9]{8}$/u

export function applicationHomeFolder(
  name: string,
  paths: ApplicationHomePaths = currentApplicationHomePaths()
): string {
  // app.setName can recase a default profile's path on case-insensitive disks.
  const comparable = (path: string) => normalizeRuntimePathForComparison(path).toLowerCase()
  const userData = comparable(paths.userData)
  const standardProfiles = [
    join(paths.appData, 'orca'),
    join(paths.appData, 'orca-dev'),
    join(paths.home, '.orca'),
    ...(paths.xdgDataHome ? [join(paths.xdgDataHome, 'Orca')] : [])
  ].map(comparable)
  const machineDataRoot =
    comparable(dirname(paths.userData)) === comparable(paths.home) &&
    MACHINE_DATA_ROOT.test(basename(userData))
  return standardProfiles.includes(userData) || machineDataRoot
    ? join(paths.home, '.orca', name)
    : join(paths.userData, name)
}

function currentApplicationHomePaths(): ApplicationHomePaths {
  return {
    userData: getCanonicalUserDataPath(),
    appData: getAppEnvironment().getPath('appData'),
    home: homedir(),
    xdgDataHome: process.env.XDG_DATA_HOME || undefined
  }
}

/** Copy registry/keypair together; retain originals for crash recovery and older builds. */
export function migrateMobilePairingDataToCanonicalUserDataPath(sourceUserDataDir: string): void {
  const targetUserDataDir = getCanonicalUserDataPath()
  if (resolve(sourceUserDataDir) === resolve(targetUserDataDir)) {
    return
  }

  const migrations = MOBILE_PAIRING_USERDATA_FILES.map((fileName) => ({
    sourcePath: join(sourceUserDataDir, fileName),
    targetPath: join(targetUserDataDir, fileName)
  }))
  if (migrations.some(({ sourcePath }) => !existsSync(sourcePath))) {
    return
  }
  if (migrations.some(({ targetPath }) => existsSync(targetPath))) {
    return
  }

  mkdirSync(targetUserDataDir, { recursive: true })
  const copied: string[] = []
  try {
    for (const { sourcePath, targetPath } of migrations) {
      copyFileSync(sourcePath, targetPath)
      copied.push(targetPath)
      // Reapply private permissions because copyFileSync does not preserve Windows ACLs.
      hardenExistingSecureFile(targetPath)
    }
  } catch (error) {
    // Remove partial copies or the target-exists guard would block recovery with a mismatched registry/keypair.
    for (const targetPath of copied) {
      try {
        rmSync(targetPath, { force: true })
      } catch {}
    }
    console.error('[persistence] Failed to migrate mobile pairing files forward:', error)
  }
}
