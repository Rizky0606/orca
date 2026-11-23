import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAgentMenuObservation } from '@/components/agent/launch-menu/use-new-tab-agent-menu-rows'
import { getStructuredAgentSessionTabsInWorkspace } from '@/components/native-chat/session/status/structured-agent-session-tabs'
import { useMountedRef } from '@/hooks/useMountedRef'
import { startStructuredAgentLaunch } from '@/lib/agent-session/launch/structured-agent-session-launch'
import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import { readIpcErrorDetail } from '@/runtime/errors/ipc-error'
import { ensureGeneralChatHomeForTarget } from '@/runtime/general-chat/general-chat-client'
import { useWorktreeStructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-name-observation'
import { projectedStructuredChatTabName } from '@/runtime/native-chat/naming/structured-chat-tab-name'
import { RuntimeRpcCallError } from '@/runtime/rpc/calls/runtime-rpc-result'
import { useAppStore } from '@/store'
import { agentMenuRowSupportsChat } from '../../../../shared/agent-launch/picker/agent-launch-picker-rows'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import { structuredAgentSessionTabId } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { createNonSecureContextUuid } from '../../../../shared/identifiers/non-secure-context-uuid'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { useGeneralChatSelection } from './general-chat-selection-store'

export type GeneralChatConversation = {
  sessionId: string
  tabId: string
  worktreeId: string
  title: string
  agent: AgentType
}

type Failure = { detail?: string; unsupported: boolean }

type HomeState =
  | { kind: 'ensuring' }
  | { kind: 'ready'; worktreeId: string }
  | ({ kind: 'failed' } & Failure)

type LaunchState =
  | { kind: 'idle' | 'ensuring' | 'launching' }
  | ({ kind: 'ensure-failed' | 'launch-failed' } & Failure)

function failure(error: unknown): Failure {
  return {
    detail: readIpcErrorDetail(error),
    unsupported: error instanceof RuntimeRpcCallError && error.code === 'method_not_found'
  }
}

export function useGeneralChatController(hostId: ExecutionHostId, target: RuntimeClientTarget) {
  const sessionId = useGeneralChatSelection((state) =>
    state.hostId === hostId ? state.sessionId : null
  )
  const selectConversation = (id: string | null): void =>
    useGeneralChatSelection.getState().selectConversation(hostId, id)
  const [home, setHome] = useState<HomeState>({ kind: 'ensuring' })
  const [homeRetry, setHomeRetry] = useState(0)
  const [launch, setLaunch] = useState<LaunchState>({ kind: 'idle' })
  const [opening, setOpening] = useState<GeneralChatConversation | null>(null)
  const [pickedAgent, setPickedAgent] = useState<TuiAgent | null>(null)
  const mounted = useMountedRef()
  const launchInFlight = useRef(false)
  const navigationRevision = useRef(0)

  useEffect(() => {
    let current = true
    void ensureGeneralChatHomeForTarget(target).then(
      ({ worktreeId }) => {
        if (current) {
          setHome({ kind: 'ready', worktreeId })
        }
      },
      (error: unknown) => {
        if (current) {
          setHome({ kind: 'failed', ...failure(error) })
        }
      }
    )
    return () => {
      current = false
    }
  }, [target, homeRetry])

  const worktreeId = home.kind === 'ready' ? home.worktreeId : null
  const tabs = useAppStore(
    useShallow((state) =>
      worktreeId
        ? getStructuredAgentSessionTabsInWorkspace(state.unifiedTabsByWorktree, worktreeId).filter(
            (tab) => tab.executionHostId === hostId
          )
        : []
    )
  )
  const names = useWorktreeStructuredChatTabNames(
    worktreeId ? { id: worktreeId, hostId } : null,
    tabs,
    true
  )
  const conversations = tabs
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .flatMap((tab): GeneralChatConversation[] =>
      tab.agentSessionAgent
        ? [
            {
              sessionId: tab.entityId,
              tabId: tab.id,
              worktreeId: tab.worktreeId,
              title: projectedStructuredChatTabName(tab, names),
              agent: tab.agentSessionAgent
            }
          ]
        : []
    )
  const openingPublished =
    opening !== null && tabs.some((tab) => tab.entityId === opening.sessionId)
  if (openingPublished) {
    setOpening(null)
  }
  const conversation =
    conversations.find((entry) => entry.sessionId === sessionId) ??
    (opening?.sessionId === sessionId && !openingPublished ? opening : null)

  // The picker observes the host even before its hidden workspace is known to this window.
  const pickerTarget = useMemo(
    () => ({ workspace: { kind: 'folder' as const, executionHostId: hostId } }),
    [hostId]
  )
  const detectionTarget = useMemo(
    () =>
      target.kind === 'local'
        ? target
        : { kind: 'runtime' as const, environmentId: target.environmentId },
    [target]
  )
  const { model } = useAgentMenuObservation(pickerTarget, true, detectionTarget)
  const providers =
    model.state === 'settled'
      ? model.rows.filter(agentMenuRowSupportsChat).map((row) => row.agent)
      : []
  const provider = pickedAgent ?? providers[0] ?? null
  const providerReady = provider !== null && providers.includes(provider)
  const unavailableProvider =
    model.state === 'settled'
      ? model.rows.find(
          (row) => row.kind === 'chat-unavailable' && (provider === null || row.agent === provider)
        )
      : undefined
  const providersLoading = model.state === 'loading'
  const busy = launch.kind === 'ensuring' || launch.kind === 'launching'

  const newChat = async (): Promise<void> => {
    if (!provider || !providerReady || home.kind !== 'ready' || launchInFlight.current) {
      return
    }
    launchInFlight.current = true
    const startingNavigationRevision = navigationRevision.current
    const selectionUnchanged = () => navigationRevision.current === startingNavigationRevision
    setPickedAgent(provider)
    setLaunch({ kind: 'ensuring' })
    let phase: 'ensure-failed' | 'launch-failed' = 'ensure-failed'
    let started: ReturnType<typeof startStructuredAgentLaunch> | undefined
    try {
      const currentHome = await ensureGeneralChatHomeForTarget(target)
      if (!mounted.current) {
        return
      }
      setHome({ kind: 'ready', worktreeId: currentHome.worktreeId })
      phase = 'launch-failed'
      setLaunch({ kind: 'launching' })
      started = startStructuredAgentLaunch(currentHome.worktreeId, provider, {
        requestId: createNonSecureContextUuid(),
        executionHostId: currentHome.executionHostId,
        activate: false,
        promptDelivery: 'draft'
      })
      setOpening({
        sessionId: started.sessionId,
        tabId: structuredAgentSessionTabId(started.sessionId),
        worktreeId: currentHome.worktreeId,
        title: structuredAgentLabel(provider),
        agent: provider
      })
      if (selectionUnchanged()) {
        selectConversation(started.sessionId)
      }
      await started.launchResult
      if (mounted.current) {
        setLaunch({ kind: 'idle' })
      }
    } catch (error) {
      if (mounted.current) {
        if (started?.isVisibilityUnknown()) {
          // Native chat retains the original launch and can recover its outcome.
          setLaunch({ kind: 'idle' })
          return
        }
        if (started) {
          setOpening(null)
          if (
            selectionUnchanged() &&
            useGeneralChatSelection.getState().sessionId === started.sessionId
          ) {
            selectConversation(sessionId)
          }
        }
        setLaunch({ kind: phase, ...failure(error) })
      }
    } finally {
      launchInFlight.current = false
    }
  }

  return {
    home,
    launch,
    busy,
    conversations,
    conversation,
    selectConversation: (id: string | null) => {
      navigationRevision.current += 1
      selectConversation(id)
    },
    providers,
    provider,
    providerReady,
    providersLoading,
    providerUnavailableReason:
      unavailableProvider?.kind === 'chat-unavailable' ? unavailableProvider.reason : null,
    setProvider: setPickedAgent,
    newChat,
    retryHome: () => {
      setHome({ kind: 'ensuring' })
      setHomeRetry((count) => count + 1)
    }
  }
}
