import { useCallback, useEffect, useMemo, useState } from 'react'
import { sendStructuredAgentSessionMessage } from '@/components/native-chat/session/structured/delivery/structured-agent-session-message-sender'
import type { NativeChatStructuredPrepareTurn } from '@/components/native-chat/native-chat-view-types'
import { useVideoStudioSelection } from '@/components/video-studio/video-studio-selection'
import {
  cancelGeneralChatDeepResearchForTarget,
  clearGeneralChatSourcesForTarget,
  deleteGeneralChatSourceForTarget,
  getGeneralChatDeepResearchForTarget,
  handoffGeneralChatToVideoStudioForTarget,
  listGeneralChatDeepResearchForTarget,
  listGeneralChatSourcesForTarget,
  pauseGeneralChatDeepResearchForTarget,
  resumeGeneralChatDeepResearchForTarget,
  searchGeneralChatWebForTarget,
  startGeneralChatDeepResearchForTarget,
  subscribeGeneralChatDeepResearchForTarget
} from '@/runtime/general-chat/general-chat-client'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import {
  formatWebSearchContextPrompt,
  isActiveDeepResearchStatus,
  type DeepResearchJob,
  type GeneralChatMode,
  type GeneralChatSource
} from '../../../../shared/general-chat/general-chat-contract'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'

export type GeneralChatResearchController = {
  mode: GeneralChatMode
  setMode: (mode: GeneralChatMode) => void
  openPanel: 'sources' | 'research' | null
  togglePanel: (panel: 'sources' | 'research') => void
  sources: GeneralChatSource[]
  jobs: DeepResearchJob[]
  selectedJob: DeepResearchJob | null
  selectedCitations: GeneralChatSource[]
  searching: boolean
  busyAction: string | null
  error: string | null
  selectJob: (jobId: string) => void
  searchWeb: (query: string) => Promise<void>
  deleteSource: (sourceId: string) => Promise<void>
  clearSources: () => Promise<void>
  startResearch: (topic: string) => Promise<void>
  pauseJob: (jobId: string) => Promise<void>
  resumeJob: (jobId: string) => Promise<void>
  cancelJob: (jobId: string) => Promise<void>
  sendReportToChat: (job: DeepResearchJob) => Promise<void>
  handoffToVideoStudio: (job?: DeepResearchJob) => Promise<void>
  prepareTurn: NativeChatStructuredPrepareTurn | undefined
}

export function useGeneralChatResearch({
  sessionId,
  agent,
  target,
  hostId,
  pairingRevision,
  enabled = true
}: {
  sessionId?: string
  agent?: string
  target: RuntimeClientTarget
  hostId?: ExecutionHostId
  pairingRevision?: number
  enabled?: boolean
}): GeneralChatResearchController {
  const [mode, setMode] = useState<GeneralChatMode>('normal')
  const [openPanel, setOpenPanel] = useState<'sources' | 'research' | null>(null)
  const [sources, setSources] = useState<GeneralChatSource[]>([])
  const [jobs, setJobs] = useState<DeepResearchJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedCitations, setSelectedCitations] = useState<GeneralChatSource[]>([])
  const [searching, setSearching] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshSources = useCallback(async () => {
    if (!sessionId) {
      setSources([])
      return
    }
    const res = await listGeneralChatSourcesForTarget(target, sessionId).catch(() => null)
    if (res) {
      setSources(res.sources)
    }
  }, [sessionId, target])

  useEffect(() => {
    setError(null)
    setSelectedCitations([])
    if (!enabled || !sessionId) {
      setSources([])
      setJobs([])
      setSelectedJobId(null)
      return
    }
    let active = true
    void refreshSources()
    void listGeneralChatDeepResearchForTarget(target, sessionId)
      .then((res) => {
        if (!active) {
          return
        }
        setJobs(res.jobs)
        setSelectedJobId((prev) => prev ?? res.jobs[0]?.id ?? null)
      })
      .catch(() => undefined)
    let subscription: { unsubscribe: () => void } | undefined
    void subscribeGeneralChatDeepResearchForTarget(
      target,
      { sessionId },
      {
        onEvent: (event) => {
          if (!active) {
            return
          }
          setJobs(event.jobs)
          setSelectedJobId((prev) =>
            prev && event.jobs.some((entry) => entry.id === prev)
              ? prev
              : (event.jobs[0]?.id ?? null)
          )
          void refreshSources()
        }
      }
    )
      .then((sub) => {
        if (!active) {
          sub.unsubscribe()
        } else {
          subscription = sub
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [enabled, refreshSources, sessionId, target])

  const selectedJob = useMemo(
    () => jobs.find((entry) => entry.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  )

  useEffect(() => {
    if (!enabled || !selectedJob) {
      setSelectedCitations([])
      return
    }
    let active = true
    void getGeneralChatDeepResearchForTarget(target, selectedJob.id)
      .then((detail) => {
        if (active) {
          setSelectedCitations(detail.citations)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [enabled, selectedJob, selectedJob?.updatedAt, target])

  const togglePanel = useCallback((panel: 'sources' | 'research') => {
    setOpenPanel((prev) => (prev === panel ? null : panel))
  }, [])

  const searchWeb = useCallback(
    async (query: string) => {
      if (!sessionId) {
        return
      }
      setSearching(true)
      setError(null)
      await searchGeneralChatWebForTarget(target, {
        sessionId,
        query,
        maxResults: 5,
        fetchTopPages: 3
      })
        .then((result) => {
          setSources(result.allSessionSources)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Web search failed')
        })
      setSearching(false)
    },
    [sessionId, target]
  )

  const deleteSource = useCallback(
    async (sourceId: string) => {
      if (!sessionId) {
        return
      }
      setBusyAction('delete-source')
      await deleteGeneralChatSourceForTarget(target, sessionId, sourceId)
        .then((res) => setSources(res.sources))
        .catch(() => undefined)
      setBusyAction(null)
    },
    [sessionId, target]
  )

  const clearSources = useCallback(async () => {
    if (!sessionId) {
      return
    }
    setBusyAction('clear-sources')
    await clearGeneralChatSourcesForTarget(target, sessionId)
      .then((res) => setSources(res.sources))
      .catch(() => undefined)
    setBusyAction(null)
  }, [sessionId, target])

  const startResearch = useCallback(
    async (topic: string) => {
      setBusyAction('start-research')
      setError(null)
      await startGeneralChatDeepResearchForTarget(target, {
        sessionId,
        agent,
        topic
      })
        .then((res) => {
          setOpenPanel('research')
          setSelectedJobId(res.job.id)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Could not start Deep Research')
        })
      setBusyAction(null)
    },
    [agent, sessionId, target]
  )

  const pauseJob = useCallback(
    async (jobId: string) => {
      setBusyAction('pause-research')
      await pauseGeneralChatDeepResearchForTarget(target, jobId).catch(() => undefined)
      setBusyAction(null)
    },
    [target]
  )

  const resumeJob = useCallback(
    async (jobId: string) => {
      setBusyAction('resume-research')
      await resumeGeneralChatDeepResearchForTarget(target, jobId).catch(() => undefined)
      setBusyAction(null)
    },
    [target]
  )

  const cancelJob = useCallback(
    async (jobId: string) => {
      setBusyAction('cancel-research')
      await cancelGeneralChatDeepResearchForTarget(target, jobId).catch(() => undefined)
      setBusyAction(null)
    },
    [target]
  )

  const sendReportToChat = useCallback(
    async (job: DeepResearchJob) => {
      if (!sessionId || !job.reportMarkdown) {
        return
      }
      setBusyAction('send-report')
      sendStructuredAgentSessionMessage({
        sessionId,
        target,
        text: `Summarize and build on this verified Deep Research brief:\n\n${job.reportMarkdown}`
      })
      setBusyAction(null)
    },
    [sessionId, target]
  )

  const handoffToVideoStudio = useCallback(
    async (job?: DeepResearchJob) => {
      setBusyAction('handoff-video')
      setError(null)
      await handoffGeneralChatToVideoStudioForTarget(target, {
        jobId: job?.id,
        sessionId,
        aspectRatio: '16:9',
        durationSeconds: 45,
        engine: 'hyperframes'
      })
        .then(({ projectId }) => {
          const targetHostId =
            hostId ?? (target.kind === 'local' ? 'local' : `runtime:${target.environmentId}`)
          const selection = useVideoStudioSelection.getState()
          selection.selectHost(targetHostId)
          selection.selectProject(targetHostId, { id: projectId, pairingRevision })
          useAppStore.getState().openVideoStudioPage()
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Could not create Video Studio project')
        })
      setBusyAction(null)
    },
    [hostId, pairingRevision, sessionId, target]
  )

  const prepareTurn = useMemo<NativeChatStructuredPrepareTurn | undefined>(() => {
    if (mode === 'normal' || !sessionId) {
      return undefined
    }
    return async ({ text }, isCurrent) => {
      if (mode === 'deep-research') {
        await startResearch(text)
        return { intercepted: true }
      }
      setSearching(true)
      const res = await searchGeneralChatWebForTarget(target, {
        sessionId,
        query: text,
        maxResults: 5,
        fetchTopPages: 3
      }).catch((err) => {
        setSearching(false)
        throw err
      })
      setSearching(false)
      if (!isCurrent()) {
        return { text }
      }
      setSources(res.allSessionSources)
      if (res.sources.length > 0) {
        setOpenPanel('sources')
      }
      return { text: formatWebSearchContextPrompt(text, res.sources) }
    }
  }, [mode, sessionId, startResearch, target])

  return {
    mode,
    setMode: (nextMode) => {
      setMode(nextMode)
      if (nextMode === 'web-search') {
        setOpenPanel('sources')
      } else if (nextMode === 'deep-research') {
        setOpenPanel('research')
      }
    },
    openPanel,
    togglePanel,
    sources,
    jobs,
    selectedJob:
      selectedJob ?? jobs.find((entry) => isActiveDeepResearchStatus(entry.status)) ?? null,
    selectedCitations,
    searching,
    busyAction,
    error,
    selectJob: setSelectedJobId,
    searchWeb,
    deleteSource,
    clearSources,
    startResearch,
    pauseJob,
    resumeJob,
    cancelJob,
    sendReportToChat,
    handoffToVideoStudio,
    prepareTurn
  }
}
