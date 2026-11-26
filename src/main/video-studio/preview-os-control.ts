import { readFile, readlink, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runProcess } from '@orca/process-host'
import {
  windowsPowerShellPath,
  windowsSystem32Binary
} from '@orca/process-host/windows-system-binary'
import { LSOF_NONBLOCKING_ARGS } from '../../shared/process-observation/lsof-nonblocking-args'
import { psLocaleEnvironment } from '../../shared/process-observation/tables/ps-locale-environment'
import {
  inspectProcessLiveness,
  readLinuxProcessStartedAtMs
} from '../daemon/endpoint/identity/daemon-process-inspection'
import {
  readWindowsProcessCreationTime,
  readWindowsProcessTableFresh
} from '../windows/windows-process-table'
import { probeLoopbackHttpIdentity, type PreviewHttpIdentity } from './preview-http-identity'
import { findHostLoopbackPortOwner, type LoopbackPortOwner } from './preview-port-ownership'

export type { LoopbackPortOwner }

export type ObservedPreviewProcess = {
  pid: number
  creationTimeMs: number | null
  executablePath: string | null
  commandLine: string
  cwd?: string
}

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

function parseWindowsCimDateMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw !== 'string') {
    return null
  }
  const wmi = /\/Date\((\d+)\)\//.exec(raw)
  if (wmi?.[1]) {
    return Number(wmi[1])
  }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

async function queryWindowsSingleProcessCim(pid: number): Promise<ObservedPreviewProcess | null> {
  const script =
    `Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=${pid}" | ` +
    'Select-Object CreationDate,ExecutablePath,CommandLine | ConvertTo-Json -Compress'
  const res = await runProcess({
    program: windowsPowerShellPath(),
    args: ['-NoProfile', '-NonInteractive', '-Command', script],
    timeoutMs: 3_000
  }).catch(() => null)
  if (!res || res.code !== 0 || !res.stdout.trim()) {
    return null
  }
  try {
    const raw = JSON.parse(res.stdout.trim()) as {
      CreationDate?: unknown
      ExecutablePath?: unknown
      CommandLine?: unknown
    }
    const commandLine = typeof raw.CommandLine === 'string' ? raw.CommandLine : ''
    const rawExe =
      typeof raw.ExecutablePath === 'string' && raw.ExecutablePath.trim()
        ? raw.ExecutablePath.trim()
        : extractExecutableFromCommandLine(commandLine)
    return {
      pid,
      creationTimeMs: parseWindowsCimDateMs(raw.CreationDate),
      executablePath: rawExe ? await resolveRealpathDefault(rawExe) : null,
      commandLine
    }
  } catch {
    return null
  }
}

async function inspectWindowsProcess(pid: number): Promise<ObservedPreviewProcess | null> {
  const rows = await readWindowsProcessTableFresh().catch(() => null)
  const row = rows?.find((candidate) => candidate.pid === pid)
  if (rows && !row) {
    return null
  }
  const nativeCreation = row?.creationTimeMs ?? readWindowsProcessCreationTime(pid)
  if (row && typeof nativeCreation === 'number') {
    const rawExe = extractExecutableFromCommandLine(row.command)
    return {
      pid,
      creationTimeMs: nativeCreation,
      executablePath: rawExe ? await resolveRealpathDefault(rawExe) : null,
      commandLine: row.command
    }
  }
  return queryWindowsSingleProcessCim(pid)
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
        return inspectWindowsProcess(pid)
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
