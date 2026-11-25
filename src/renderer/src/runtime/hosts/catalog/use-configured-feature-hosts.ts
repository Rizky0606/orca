import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import { useTranslate } from '@/i18n/use-translate'
import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { runtimeHostConnectionStateForEntry } from '@/runtime/hosts/connections/runtime-host-connection-state'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/rpc/targets/runtime-client-target'
import { useAppStore } from '@/store'
import { useRuntimeStatusByEnvironmentId } from '@/store/slices/runtime-status/views/use-runtime-status-view'
import type { ExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { buildExecutionHostRegistry } from '../../../../../shared/execution-host/execution-host-registry'

export type ConfiguredFeatureHost = { id: ExecutionHostId; label: string }

export function useConfiguredFeatureHosts(savedHostId: ExecutionHostId | null) {
  const t = useTranslate()
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
  const hostLabel = useAppStore((state) =>
    hostId ? selectExecutionHostDisplayLabel(state, hostId, { t }) : null
  )
  const selectedHost = hostId && hostLabel ? { id: hostId, label: hostLabel } : null
  const known = hostId !== null && hosts.has(hostId)
  const target = useMemo(
    () => (known ? runtimeRpcTargetForAuthorityKey(hostId) : null),
    [hostId, known]
  )
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const status = environmentId ? statuses.get(environmentId) : undefined
  const pairingRevision = useAppStore((state) => {
    const environment = state.runtimeEnvironments.find(({ id }) => id === environmentId)
    return environment?.pairingRevision ?? environment?.createdAt
  })
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
    hosts: [...hosts].map(([id, label]): ConfiguredFeatureHost => ({ id, label })),
    selectedHost,
    availability,
    catalogPending: !runtimeCatalogSettled && !known,
    target,
    pairingRevision
  } as const
}
