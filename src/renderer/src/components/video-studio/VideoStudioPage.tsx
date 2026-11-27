import { useEffect, useId, useState, type ReactNode } from 'react'
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
import {
  useConfiguredFeatureHosts,
  type ConfiguredFeatureHost
} from '@/runtime/hosts/catalog/use-configured-feature-hosts'
import { useAppStore } from '@/store'
import {
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { VideoStudioProjects } from './VideoStudioProjects'
import { useVideoStudioController } from './use-video-studio-controller'
import { useVideoStudioInspector } from './use-video-studio-inspector'
import { useVideoStudioEngineProbe, useVideoStudioProduction } from './use-video-studio-production'
import { useVideoStudioSelection } from './video-studio-selection'

function openServers() {
  const { openSettingsTarget, openSettingsPage } = useAppStore.getState()
  openSettingsTarget({ pane: 'servers', repoId: null })
  openSettingsPage()
}

export function VideoStudioPageFrame({
  hosts,
  selectedHost,
  selectHost,
  children
}: {
  hosts: readonly ConfiguredFeatureHost[]
  selectedHost: ConfiguredFeatureHost | null
  selectHost: (id: ExecutionHostId) => void
  children: ReactNode
}) {
  const t = useTranslate()
  const titleId = useId()
  const hostFieldId = useId()
  const options =
    selectedHost && !hosts.some(({ id }) => id === selectedHost.id)
      ? [selectedHost, ...hosts]
      : hosts
  return (
    <section
      aria-labelledby={titleId}
      className="@container flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <h1 id={titleId} className="text-sm font-semibold">
          {t('videoStudio.title', 'Video Studio')}
        </h1>
        {options.length > 1 || (!selectedHost && options.length > 0) ? (
          <div className="flex min-w-0 items-center gap-2">
            <Label htmlFor={hostFieldId} variant="settings">
              {t('videoStudio.computer', 'Computer')}
            </Label>
            <Select
              value={selectedHost?.id ?? ''}
              onValueChange={(value) => {
                const option = options.find(({ id }) => id === value)
                if (option) {
                  selectHost(option.id)
                }
              }}
            >
              <SelectTrigger id={hostFieldId} size="sm" className="min-h-11 max-w-48 @lg:min-h-8">
                <SelectValue placeholder={t('videoStudio.selectComputer', 'Select a computer')} />
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map(({ id, label }) => (
                  <SelectItem key={id} value={id} className="min-h-11 sm:min-h-8">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : selectedHost ? (
          <p className="min-w-0 truncate text-xs text-muted-foreground">{selectedHost.label}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

export function VideoStudioNotice({
  title,
  description,
  state,
  action
}: {
  title: string
  description?: string
  state?: 'status' | 'alert'
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div role={state} className="grid max-w-sm gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground wrap-anywhere">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function VideoStudioHostUnavailable({
  host,
  environmentId
}: {
  host: ConfiguredFeatureHost
  environmentId?: string
}) {
  const t = useTranslate()
  const [busy, setBusy] = useState(false)
  const ssh = parseExecutionHostId(host.id)?.kind === 'ssh'
  return (
    <VideoStudioNotice
      state={busy ? 'status' : 'alert'}
      title={
        busy
          ? t('videoStudio.connecting', 'Connecting to {{host}}…', { host: host.label })
          : t('videoStudio.hostUnavailable', '{{host}} is unavailable', { host: host.label })
      }
      description={
        ssh
          ? t(
              'videoStudio.sshUnavailable',
              'Video Studio requires a paired Orca server on this computer.'
            )
          : t('videoStudio.reconnectHint', 'Reconnect or choose another computer.')
      }
      action={
        environmentId ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 @lg:min-h-9"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void connectRuntimeHostAndReloadProjects(environmentId)
                .catch(() => {})
                .finally(() => setBusy(false))
            }}
          >
            {t('videoStudio.reconnect', 'Reconnect')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 @lg:min-h-9"
            onClick={openServers}
          >
            {t('videoStudio.manageComputers', 'Manage computers')}
          </Button>
        )
      }
    />
  )
}

function VideoStudioProjectWorkspace({
  hostId,
  target,
  pairingRevision,
  controller,
  selectedProject,
  engineProbe
}: {
  hostId: ExecutionHostId
  target: RuntimeClientTarget
  pairingRevision?: number
  controller: ReturnType<typeof useVideoStudioController>
  selectedProject: ReturnType<typeof useVideoStudioController>['snapshot'] extends
    | { projects: infer P }
    | null
    | undefined
    ? P extends readonly (infer Item)[]
      ? Item | undefined
      : never
    : never
  engineProbe: ReturnType<typeof useVideoStudioEngineProbe>
}) {
  const production = useVideoStudioProduction({
    hostId,
    target,
    pairingRevision,
    project: selectedProject,
    onReloadProjects: controller.refresh,
    engineProbe
  })
  const inspector = useVideoStudioInspector({
    target,
    pairingRevision,
    projectId: selectedProject?.id
  })
  return (
    <VideoStudioProjects controller={controller} production={production} inspector={inspector} />
  )
}

function VideoStudioOnHost({
  hostId,
  target,
  pairingRevision
}: {
  hostId: ExecutionHostId
  target: RuntimeClientTarget
  pairingRevision?: number
}) {
  const controller = useVideoStudioController(hostId, target, pairingRevision)
  const engineProbe = useVideoStudioEngineProbe(target, pairingRevision)
  const selectedProject = controller.snapshot?.projects.find(
    ({ id }) => id === controller.projectId
  )
  return (
    <VideoStudioProjectWorkspace
      key={selectedProject?.id ?? 'none'}
      hostId={hostId}
      target={target}
      pairingRevision={pairingRevision}
      controller={controller}
      selectedProject={selectedProject}
      engineProbe={engineProbe}
    />
  )
}

export default function VideoStudioPage(): React.JSX.Element {
  const t = useTranslate()
  const savedHostId = useVideoStudioSelection((state) => state.hostId)
  const selectHost = useVideoStudioSelection((state) => state.selectHost)
  const { hosts, selectedHost, catalogPending, target, availability, pairingRevision } =
    useConfiguredFeatureHosts(savedHostId)
  const hostId = selectedHost?.id
  useEffect(() => {
    if (hostId && useVideoStudioSelection.getState().hostId === null) {
      selectHost(hostId)
    }
  }, [hostId, selectHost])

  let content: ReactNode
  if (catalogPending) {
    content = (
      <VideoStudioNotice
        state="status"
        title={t('videoStudio.loadingComputers', 'Loading computers…')}
      />
    )
  } else if (!selectedHost) {
    content = (
      <VideoStudioNotice
        title={t('videoStudio.chooseComputer', 'Choose where to store projects')}
        description={
          hosts.length > 0
            ? undefined
            : t('videoStudio.connectComputer', 'Connect a computer to use Video Studio.')
        }
        action={
          hosts.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 @lg:min-h-9"
              onClick={openServers}
            >
              {t('videoStudio.manageComputers', 'Manage computers')}
            </Button>
          ) : undefined
        }
      />
    )
  } else if (availability === 'host-connecting') {
    content = (
      <VideoStudioNotice
        state="status"
        title={t('videoStudio.connecting', 'Connecting to {{host}}…', { host: selectedHost.label })}
      />
    )
  } else if (
    !target ||
    availability !== 'available' ||
    (target.kind === 'environment' && pairingRevision === undefined)
  ) {
    content = (
      <VideoStudioHostUnavailable
        host={selectedHost}
        key={selectedHost.id}
        environmentId={target?.kind === 'environment' ? target.environmentId : undefined}
      />
    )
  } else {
    content = (
      <VideoStudioOnHost
        key={`${selectedHost.id}:${pairingRevision ?? ''}`}
        hostId={selectedHost.id}
        target={target}
        pairingRevision={pairingRevision}
      />
    )
  }

  return (
    <VideoStudioPageFrame hosts={hosts} selectedHost={selectedHost} selectHost={selectHost}>
      {content}
    </VideoStudioPageFrame>
  )
}
