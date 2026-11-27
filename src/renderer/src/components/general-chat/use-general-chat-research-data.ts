import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import {
  getGeneralChatDeepResearchForTarget,
  listGeneralChatDeepResearchForTarget,
  listGeneralChatSourcesForTarget,
  subscribeGeneralChatDeepResearchForTarget
} from '@/runtime/general-chat/general-chat-client'
import type {
  DeepResearchJob,
  GeneralChatSource
} from '../../../../shared/general-chat/general-chat-contract'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'

type GeneralChatResearchData = {
  sources: GeneralChatSource[]
  setSources: Dispatch<SetStateAction<GeneralChatSource[]>>
  jobs: DeepResearchJob[]
  selectedJob: DeepResearchJob | null
  setSelectedJobId: Dispatch<SetStateAction<string | null>>
  selectedCitations: GeneralChatSource[]
}

export function useGeneralChatResearchData({
  enabled,
  sessionId,
  target
}: {
  enabled: boolean
  sessionId?: string
  target: RuntimeClientTarget
}): GeneralChatResearchData {
  const [sources, setSources] = useState<GeneralChatSource[]>([])
  const [jobs, setJobs] = useState<DeepResearchJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedCitations, setSelectedCitations] = useState<GeneralChatSource[]>([])
  const refreshSources = useCallback(async () => {
    if (!sessionId) {
      setSources([])
      return
    }
    const result = await listGeneralChatSourcesForTarget(target, sessionId).catch(() => null)
    if (result) {
      setSources(result.sources)
    }
  }, [sessionId, target])

  useEffect(() => {
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
      .then((result) => {
        if (active) {
          setJobs(result.jobs)
          setSelectedJobId((current) => current ?? result.jobs[0]?.id ?? null)
        }
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
          setSelectedJobId((current) =>
            current && event.jobs.some((entry) => entry.id === current)
              ? current
              : (event.jobs[0]?.id ?? null)
          )
          void refreshSources()
        }
      }
    )
      .then((nextSubscription) => {
        if (active) {
          subscription = nextSubscription
        } else {
          nextSubscription.unsubscribe()
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

  return { sources, setSources, jobs, selectedJob, setSelectedJobId, selectedCitations }
}
