import { readFile, readlink, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runProcess } from '@orca/process-host'
import { windowsSystem32Binary } from '@orca/process-host/windows-system-binary'
import { LSOF_NONBLOCKING_ARGS } from '../../shared/process-observation/lsof-nonblocking-args'
import { psLocaleEnvironment } from '../../shared/process-observation/tables/ps-locale-environment'
import {
  inspectProcessLiveness,
  readLinuxProcessStartedAtMs
} from '../daemon/endpoint/identity/daemon-process-inspection'
import type { WindowsProcessRow } from '../windows/windows-process-table'
import { probeLoopbackHttpIdentity, type PreviewHttpIdentity } from './preview-http-identity'
import { findHostLoopbackPortOwner, type LoopbackPortOwner } from './preview-port-ownership'
import {
  buildWindowsSingleProcessCimScript,
  inspectWindowsProcess,
  inspectWindowsProcessWith as inspectWindowsProcessCore,
  type ObservedPreviewProcess
} from './preview-windows-process'

export { buildWindowsSingleProcessCimScript, type LoopbackPortOwner, type ObservedPreviewProcess }

export type PreviewOsControl = {
  inspectProcess: (pid: number) => Promise<ObservedPreviewProcess | null>
  findLoopbackPortOwner: (port: number) => Promise<LoopbackPortOwner | null>
  probeHttpIdentity: (host: string, port: number) => Promise<PreviewHttpIdentity | null>
  terminateProcessTree: (pid: number) => Promise<boolean>
  resolveRealpath?: (targetPath: string) => Promise<string>
}

export function tokenizeCommandLine(commandLine: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const ch of commandLine) {
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current.length > 0) {
    tokens.push(current)
  }
  return tokens
}

export function extractExecutableFromCommandLine(commandLine: string): string | null {
  const trimmed = commandLine.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return tokenizeCommandLine(trimmed)[0] ?? null
  }
  if (process.platform === 'win32') {
    const winExeMatch = /^(.+?\.(?:exe|cmd|bat|mjs))(?:\s|$)/i.exec(trimmed)
    if (winExeMatch?.[1]) {
      return winExeMatch[1].trim()
    }
  }
  return tokenizeCommandLine(trimmed)[0] ?? null
}

export async function resolveRealpathDefault(targetPath: string): Promise<string> {
  return realpath(targetPath).catch(() => resolve(targetPath))
}

export async function inspectWindowsProcessWith(
  pid: number,
  deps: {
    isStartTimeAvailable?: () => boolean
    readProcessTableFresh: () => Promise<WindowsProcessRow[]>
    readProcessCreationTime?: (targetPid: number) => number | null
    querySingleProcessCim: (targetPid: number) => Promise<ObservedPreviewProcess | null>
  }
): Promise<ObservedPreviewProcess | null> {
  return inspectWindowsProcessCore(pid, {
    ...deps,
    extractExecutable: extractExecutableFromCommandLine,
    resolveRealpath: resolveRealpathDefault
  })
}

async function inspectLinuxProcess(pid: number): Promise<ObservedPreviewProcess | null> {
  if (inspectProcessLiveness(pid).status !== 'live') {
    return null
  }
  const [creationTimeMs, rawCmdline, cwd, exe] = await Promise.all([
    readLinuxProcessStartedAtMs(pid),
    readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => ''),
    readlink(`/proc/${pid}/cwd`).catch(() => undefined),
    realpath(`/proc/${pid}/exe`).catch(() => null)
  ])
  const commandLine = rawCmdline.split('\u0000').filter(Boolean).join(' ').trim()
  return {
    pid,
    creationTimeMs,
    executablePath: exe ?? extractExecutableFromCommandLine(commandLine),
    commandLine,
    cwd
  }
}

async function inspectDarwinProcess(pid: number): Promise<ObservedPreviewProcess | null> {
  if (inspectProcessLiveness(pid).status !== 'live') {
    return null
  }
  const [psRes, cwdRes] = await Promise.all([
    runProcess({
      program: '/bin/ps',
      args: ['-p', String(pid), '-o', 'lstart=,command='],
      env: psLocaleEnvironment(),
      timeoutMs: 2_000
    }).catch(() => null),
    runProcess({
      program: '/usr/sbin/lsof',
      args: ['-O', ...LSOF_NONBLOCKING_ARGS, '-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
      env: psLocaleEnvironment(),
      timeoutMs: 2_000
    }).catch(() => null)
  ])
  if (!psRes || psRes.code !== 0 || !psRes.stdout.trim()) {
    return null
  }
  const line = psRes.stdout.trim()
  const match = /^(\S+\s+\S+\s+\d{1,2}\s+\S+\s+\d{4})\s+(.+)$/.exec(line)
  const parsedTime = match ? Date.parse(match[1]) : Number.NaN
  const commandLine = match ? match[2].trim() : line
  const rawExe = extractExecutableFromCommandLine(commandLine)
  const cwd =
    cwdRes?.code === 0
      ? cwdRes.stdout
          .split('\n')
          .find((l) => l.startsWith('n'))
          ?.slice(1)
          .trim() || undefined
      : undefined
  return {
    pid,
    creationTimeMs: Number.isFinite(parsedTime) ? parsedTime : null,
    executablePath: rawExe ? await resolveRealpathDefault(rawExe) : null,
    commandLine,
    cwd
  }
}

async function waitForPidExit(pid: number, maxWaitMs: number): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    if (inspectProcessLiveness(pid).status === 'exited') {
      return true
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  return inspectProcessLiveness(pid).status === 'exited'
}

async function terminateVerifiedPidTree(pid: number): Promise<boolean> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
    return false
  }
  if (process.platform === 'win32') {
    await runProcess({
      program: windowsSystem32Binary('taskkill.exe'),
      args: ['/pid', String(pid), '/t', '/f'],
      timeoutMs: 5_000
    }).catch(() => null)
    return waitForPidExit(pid, 1500)
  }
  const sendSignal = (sig: NodeJS.Signals): boolean => {
    try {
      process.kill(-pid, sig)
      return true
    } catch {
      try {
        process.kill(pid, sig)
        return true
      } catch {
        return false
      }
    }
  }
  if (!sendSignal('SIGTERM')) {
    return inspectProcessLiveness(pid).status === 'exited'
  }
  if (await waitForPidExit(pid, 1500)) {
    return true
  }
  sendSignal('SIGKILL')
  return waitForPidExit(pid, 500)
}

export function createDefaultPreviewOsControl(): PreviewOsControl {
  return {
    inspectProcess: (pid) => {
      if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
        return Promise.resolve(null)
      }
      if (process.platform === 'win32') {
        return inspectWindowsProcess(pid, {
          extractExecutable: extractExecutableFromCommandLine,
          resolveRealpath: resolveRealpathDefault
        })
      }
      if (process.platform === 'linux') {
        return inspectLinuxProcess(pid)
      }
      return process.platform === 'darwin' ? inspectDarwinProcess(pid) : Promise.resolve(null)
    },
    findLoopbackPortOwner: findHostLoopbackPortOwner,
    probeHttpIdentity: probeLoopbackHttpIdentity,
    terminateProcessTree: terminateVerifiedPidTree,
    resolveRealpath: resolveRealpathDefault
  }
}
