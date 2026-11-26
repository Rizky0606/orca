import { readFile, readdir, readlink } from 'node:fs/promises'
import { runProcess } from '@orca/process-host'
import { windowsSystem32Binary } from '@orca/process-host/windows-system-binary'
import { isEligibleLocalCertificateHost } from '../../shared/browser/navigation/browser-url'
import { LSOF_NONBLOCKING_ARGS } from '../../shared/process-observation/lsof-nonblocking-args'
import { psLocaleEnvironment } from '../../shared/process-observation/tables/ps-locale-environment'
import { parseProcNetTcp } from '../ports/linux-proc-net-listeners'
import {
  parseLsofListeningOutput,
  parseNetstatListeningOutput
} from '../ports/local-workspace-platform-port-scanner'

export type LoopbackPortOwner = {
  host: string
  port: number
  pid: number
}

async function findLinuxLoopbackPortOwner(port: number): Promise<LoopbackPortOwner | null> {
  const ownUid = process.getuid?.()
  const [tcp4, tcp6] = await Promise.all([
    readFile('/proc/net/tcp', 'utf8')
      .then((c) => parseProcNetTcp(c, ownUid))
      .catch(() => []),
    readFile('/proc/net/tcp6', 'utf8')
      .then((c) => parseProcNetTcp(c, ownUid))
      .catch(() => [])
  ])
  const listeners = [...tcp4, ...tcp6].filter(
    (item) => item.port === port && isEligibleLocalCertificateHost(item.host)
  )
  if (listeners.length === 0) {
    return null
  }
  const targetInodes = new Set(listeners.map((item) => item.inode))
  const procEntries = await readdir('/proc').catch(() => [])
  for (const pidText of procEntries) {
    if (!/^\d+$/.test(pidText)) {
      continue
    }
    const fds = await readdir(`/proc/${pidText}/fd`).catch(() => [])
    for (const fd of fds) {
      const match = /^socket:\[(\d+)\]$/.exec(
        await readlink(`/proc/${pidText}/fd/${fd}`).catch(() => '')
      )
      const inode = match ? Number.parseInt(match[1], 10) : Number.NaN
      const matched = targetInodes.has(inode) ? listeners.find((l) => l.inode === inode) : undefined
      if (matched) {
        return { host: matched.host, port, pid: Number.parseInt(pidText, 10) }
      }
    }
  }
  return null
}

export async function findHostLoopbackPortOwner(port: number): Promise<LoopbackPortOwner | null> {
  if (process.platform === 'win32') {
    const res = await runProcess({
      program: windowsSystem32Binary('netstat.exe'),
      args: ['-ano', '-p', 'tcp'],
      timeoutMs: 3_000
    }).catch(() => null)
    const found =
      res?.code === 0
        ? parseNetstatListeningOutput(res.stdout).find(
            (e) => e.port === port && e.pid && isEligibleLocalCertificateHost(e.host)
          )
        : undefined
    return found?.pid ? { host: found.host, port, pid: found.pid } : null
  }
  if (process.platform === 'darwin') {
    const res = await runProcess({
      program: '/usr/sbin/lsof',
      args: ['-O', ...LSOF_NONBLOCKING_ARGS, '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'pcnd'],
      env: psLocaleEnvironment(),
      timeoutMs: 3_000
    }).catch(() => null)
    const found =
      res?.code === 0
        ? parseLsofListeningOutput(res.stdout).find(
            (e) => e.port === port && e.pid && isEligibleLocalCertificateHost(e.host)
          )
        : undefined
    return found?.pid ? { host: found.host, port, pid: found.pid } : null
  }
  return process.platform === 'linux' ? findLinuxLoopbackPortOwner(port) : null
}
