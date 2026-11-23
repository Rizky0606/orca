import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import { useTranslate } from '@/i18n/use-translate'
import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { runtimeHostConnectionStateForEntry } from '@/runtime/hosts/connections/runtime-host-connection-state'
import { structuredAgentSessionTargetForHost } from '@/runtime/native-chat/session-ownership/structured-agent-session-owner'
import { useAppStore } from '@/store'
import { useRuntimeStatusByEnvironmentId } from '@/store/slices/runtime-status/views/use-runtime-status-view'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { buildExecutionHostRegistry } from '../../../../shared/execution-host/execution-host-registry'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { useGeneralChatSelection } from './general-chat-selection-store'

export type GeneralChatHost = { id: ExecutionHostId; label: string }

export function useGeneralChatHosts() {
  const t = useTranslate()
  const savedHostId = useGeneralChatSelection((state) => state.hostId)
  const selectHost = useGeneralChatSelection((state) => state.selectHost)
  const statuses = useRuntimeStatusByEnvironmentId()
  const web = isWebClientLocation()
  const catalogReady = useAppStore(
    (state) => state.runtimeEnvironmentCatalogHydrated && (web || state.sshTargetsHydrated)
  )
  const runtimeCatalogSettled = useAppStore((state) => state.runtimeEnvironmentCatalogSettled)
  const hosts = useAppStore(
    useShallow((state) => {
      const registry = buildExecutionHostRegistry({
        repos: [],
        settings: null,
        hostSource: 'configured-only',
        runtimeEnvironments: state.runtimeEnvironments,
        sshTargetLabels: state.sshTargetLabels
      })
      return new Map(
        registry
          .filter((host) => !host.mergedIntoHostId && (!web || host.kind !== 'local'))
          .map(({ id }) => [id, selectExecutionHostDisplayLabel(state, id, { t })])
      )
    })
  )
  const hostId = savedHostId ?? (catalogReady && hosts.size === 1 ? [...hosts.keys()][0] : null)
  useEffect(() => {
    if (hostId && useGeneralChatSelection.getState().hostId === null) {
      selectHost(hostId)
    }
  }, [hostId, selectHost])
  const hostLabel = useAppStore((state) =>
    hostId ? selectExecutionHostDisplayLabel(state, hostId, { t }) : null
  )
  const selectedHost = hostId && hostLabel ? { id: hostId, label: hostLabel } : null
  const known = hostId !== null && hosts.has(hostId)
  const target = useMemo<RuntimeClientTarget | null>(
    () => (known ? structuredAgentSessionTargetForHost(hostId) : null),
    [hostId, known]
  )
  const status = target?.kind === 'environment' ? statuses.get(target.environmentId) : undefined
  const connection = runtimeHostConnectionStateForEntry(status)
  const availability = !selectedHost
    ? 'no-host'
    : !target
      ? 'host-unavailable'
      : target.kind === 'local' ||
          connection === 'connected' ||
          connection === 'workspace-window-closed'
        ? 'available'
        : connection === 'checking'
          ? 'host-connecting'
          : 'host-unavailable'

  return {
    hosts: [...hosts].map(([id, label]): GeneralChatHost => ({ id, label })),
    selectedHost,
    selectHost,
    availability,
    catalogPending: !runtimeCatalogSettled && !known,
    target,
    pairingRevision: status?.snapshot?.pairingRevision
  } as const
}
