import { runProcess } from '@orca/process-host'
import { windowsPowerShellPath } from '@orca/process-host/windows-system-binary'
import {
  readWindowsProcessTableFresh,
  type WindowsProcessRow
} from '../windows/windows-process-table'

export type ObservedPreviewProcess = {
  pid: number
  creationTimeMs: number | null
  executablePath: string | null
  commandLine: string
  cwd?: string
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

export function buildWindowsSingleProcessCimScript(pid: number): string {
  return (
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
    `Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=${pid}" | ` +
    'Select-Object CreationDate,ExecutablePath,CommandLine | ConvertTo-Json -Compress'
  )
}

function parseWindowsCimObject(raw: unknown): {
  CreationDate?: unknown
  ExecutablePath?: unknown
  CommandLine?: unknown
} | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null
  }
  return {
    CreationDate: 'CreationDate' in raw ? raw.CreationDate : undefined,
    ExecutablePath: 'ExecutablePath' in raw ? raw.ExecutablePath : undefined,
    CommandLine: 'CommandLine' in raw ? raw.CommandLine : undefined
  }
}

export async function inspectWindowsProcessWith(
  pid: number,
  deps: {
    isStartTimeAvailable?: () => boolean
    readProcessTableFresh: () => Promise<WindowsProcessRow[]>
    readProcessCreationTime?: (targetPid: number) => number | null
    querySingleProcessCim: (targetPid: number) => Promise<ObservedPreviewProcess | null>
    extractExecutable: (commandLine: string) => string | null
    resolveRealpath: (targetPath: string) => Promise<string>
  }
): Promise<ObservedPreviewProcess | null> {
  if (deps.isStartTimeAvailable && !deps.isStartTimeAvailable()) {
    return deps.querySingleProcessCim(pid)
  }
  const rows = await deps.readProcessTableFresh().catch(() => null)
  const row = rows?.find((candidate) => candidate.pid === pid)
  if (rows && !row) {
    return null
  }
  const nativeCreation = row?.creationTimeMs ?? deps.readProcessCreationTime?.(pid)
  if (row && typeof nativeCreation === 'number') {
    const rawExe = deps.extractExecutable(row.command)
    return {
      pid,
      creationTimeMs: nativeCreation,
      executablePath: rawExe ? await deps.resolveRealpath(rawExe) : null,
      commandLine: row.command
    }
  }
  return deps.querySingleProcessCim(pid)
}

export async function inspectWindowsProcess(
  pid: number,
  helpers: {
    extractExecutable: (commandLine: string) => string | null
    resolveRealpath: (targetPath: string) => Promise<string>
  }
): Promise<ObservedPreviewProcess | null> {
  const querySingleProcessCim = async (
    targetPid: number
  ): Promise<ObservedPreviewProcess | null> => {
    const res = await runProcess({
      program: windowsPowerShellPath(),
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        buildWindowsSingleProcessCimScript(targetPid)
      ],
      timeoutMs: 3_000
    }).catch(() => null)
    if (!res || res.code !== 0 || !res.stdout.trim()) {
      return null
    }
    try {
      const raw = parseWindowsCimObject(JSON.parse(res.stdout.trim()))
      if (!raw) {
        return null
      }
      const commandLine = typeof raw.CommandLine === 'string' ? raw.CommandLine : ''
      const rawExe =
        typeof raw.ExecutablePath === 'string' && raw.ExecutablePath.trim()
          ? raw.ExecutablePath.trim()
          : helpers.extractExecutable(commandLine)
      return {
        pid: targetPid,
        creationTimeMs: parseWindowsCimDateMs(raw.CreationDate),
        executablePath: rawExe ? await helpers.resolveRealpath(rawExe) : null,
        commandLine
      }
    } catch {
      return null
    }
  }

  return inspectWindowsProcessWith(pid, {
    readProcessTableFresh: readWindowsProcessTableFresh,
    querySingleProcessCim,
    extractExecutable: helpers.extractExecutable,
    resolveRealpath: helpers.resolveRealpath
  })
}
