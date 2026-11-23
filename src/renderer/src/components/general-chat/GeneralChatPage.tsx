import { useId, useState, type ReactNode } from 'react'
import { connectRuntimeHostAndReloadProjects } from '@/components/status-bar/host-connections/runtime-environment-explicit-connect'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import {
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GeneralChatAvailable } from './GeneralChatAvailable'
import { GeneralChatEmptyState } from './GeneralChatEmptyState'
import { useGeneralChatController } from './use-general-chat-controller'
import { useGeneralChatHosts, type GeneralChatHost } from './use-general-chat-hosts'

function openChatSettings(pane: 'servers' | 'agents', hostScope?: RuntimeClientTarget): void {
  const { openSettingsTarget, openSettingsPage } = useAppStore.getState()
  openSettingsTarget({ pane, repoId: null, hostScope })
  openSettingsPage()
}

export function GeneralChatPageFrame({
  hosts,
  selectedHost,
  onSelectHost,
  children
}: {
  hosts: readonly GeneralChatHost[]
  selectedHost: GeneralChatHost | null
  onSelectHost: (hostId: ExecutionHostId) => void
  children: ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  const titleId = useId()
  const hostFieldId = useId()
  const hostFieldLabel = t('generalChat.hostLabel', 'Computer')
  const selectedHostMissing = selectedHost && !hosts.some(({ id }) => id === selectedHost.id)
  const options = selectedHostMissing ? [selectedHost, ...hosts] : hosts
  return (
    <section
      aria-labelledby={titleId}
      className="@container flex min-h-0 flex-1 flex-col bg-background"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <h1 id={titleId} className="text-sm font-semibold">
          {t('generalChat.title', 'General Chat')}
        </h1>
        {options.length > 1 || (!selectedHost && options.length > 0) ? (
          <div className="flex min-w-0 items-center gap-2">
            <Label htmlFor={hostFieldId} className="text-xs text-muted-foreground">
              {hostFieldLabel}
            </Label>
            <Select
              value={selectedHost?.id ?? ''}
              onValueChange={(value) => {
                const host = options.find(({ id }) => id === value)
                if (host) {
                  onSelectHost(host.id)
                }
              }}
            >
              <SelectTrigger
                id={hostFieldId}
                size="sm"
                className="max-w-48 motion-reduce:transition-none"
              >
                <SelectValue placeholder={t('generalChat.selectHost', 'Select a computer')} />
              </SelectTrigger>
              <SelectContent position="popper" className="motion-reduce:animate-none">
                {options.map(({ id, label }) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : selectedHost ? (
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            <span className="sr-only">{hostFieldLabel} </span>
            {selectedHost.label}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function GeneralChatOnHost({
  hostId,
  target
}: {
  hostId: ExecutionHostId
  target: RuntimeClientTarget
}) {
  const controller = useGeneralChatController(hostId, target)
  return (
    <GeneralChatAvailable
      controller={controller}
      target={target}
      onOpenAgentSettings={() => openChatSettings('agents', target)}
    />
  )
}

export function GeneralChatHostUnavailable({
  host,
  environmentId
}: {
  host: GeneralChatHost
  environmentId?: string
}) {
  const t = useTranslate()
  const [reconnecting, setReconnecting] = useState(false)
  const ssh = parseExecutionHostId(host.id)?.kind === 'ssh'
  return (
    <GeneralChatEmptyState
      state={reconnecting ? 'working' : 'error'}
      title={
        reconnecting
          ? t('generalChat.reconnecting', 'Connecting to {{host}}…', { host: host.label })
          : t('generalChat.hostUnavailable', '{{host}} is unavailable', { host: host.label })
      }
      description={
        !reconnecting
          ? ssh
            ? t(
                'generalChat.sshUnsupported',
                'General Chat requires a paired Orca server on this computer.'
              )
            : t('generalChat.hostUnavailableDescription', 'Reconnect or choose another computer.')
          : undefined
      }
      action={
        environmentId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reconnecting}
            className="motion-reduce:transition-none"
            onClick={() => {
              setReconnecting(true)
              void connectRuntimeHostAndReloadProjects(environmentId).finally(() =>
                setReconnecting(false)
              )
            }}
          >
            {t('generalChat.reconnect', 'Reconnect')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="motion-reduce:transition-none"
            onClick={() => openChatSettings('servers')}
          >
            {t('generalChat.manageComputers', 'Manage computers')}
          </Button>
        )
      }
    />
  )
}

export default function GeneralChatPage(): React.JSX.Element {
  const t = useTranslate()
  const { hosts, selectedHost, selectHost, availability, target, pairingRevision, catalogPending } =
    useGeneralChatHosts()
  let content: ReactNode
  if (catalogPending) {
    content = (
      <GeneralChatEmptyState
        state="working"
        title={t('generalChat.loadingComputers', 'Loading computers…')}
      />
    )
  } else if (!selectedHost) {
    content = (
      <GeneralChatEmptyState
        title={t('generalChat.chooseHost', 'Choose where to chat')}
        description={
          hosts.length > 0
            ? t(
                'generalChat.selectHostInstructions',
                'Select the computer that will run the chat provider.'
              )
            : t('generalChat.noHost', 'Connect a computer to start a chat.')
        }
        action={
          hosts.length === 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="motion-reduce:transition-none"
              onClick={() => openChatSettings('servers')}
            >
              {t('generalChat.manageComputers', 'Manage computers')}
            </Button>
          ) : undefined
        }
      />
    )
  } else if (availability === 'host-connecting') {
    content = (
      <GeneralChatEmptyState
        state="working"
        title={t('generalChat.reconnecting', 'Connecting to {{host}}…', {
          host: selectedHost.label
        })}
      />
    )
  } else if (availability !== 'available' || !target) {
    content = (
      <GeneralChatHostUnavailable
        key={selectedHost.id}
        host={selectedHost}
        environmentId={target?.kind === 'environment' ? target.environmentId : undefined}
      />
    )
  } else {
    content = (
      <GeneralChatOnHost
        key={`${selectedHost.id}:${pairingRevision ?? ''}`}
        hostId={selectedHost.id}
        target={target}
      />
    )
  }
  return (
    <GeneralChatPageFrame hosts={hosts} selectedHost={selectedHost} onSelectHost={selectHost}>
      {content}
    </GeneralChatPageFrame>
  )
}
