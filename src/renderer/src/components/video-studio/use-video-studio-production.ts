import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import {
  cancelVideoStudioRenderForTarget,
  checkVideoStudioCompositionForTarget,
  getVideoStudioCompositionStateForTarget,
  probeVideoStudioEnginesForTarget,
  scaffoldVideoStudioCompositionForTarget,
  startVideoStudioPreviewForTarget,
  startVideoStudioRenderForTarget,
  stopVideoStudioPreviewForTarget,
  subscribeVideoStudioJobsForTarget
} from '@/runtime/video-studio/video-studio-client'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { VideoStudioProject } from '../../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioCompositionState,
  VideoStudioEngineStatus,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot
} from '../../../../shared/video-studio/video-studio-rpc-contract'
import {
  fetchRenderBlobUrl,
  mapProductionRpcError,
  openVideoStudioWorkspaceInApp,
  releaseVideoObjectUrl,
  runWithProductionBusy,
  triggerVideoDownload,
  type VideoStudioProductionController
} from './video-studio-production-actions'

export type { VideoStudioProductionController }

export function useVideoStudioProduction(params: {
  hostId: ExecutionHostId
  target: RuntimeClientTarget
  pairingRevision: number | undefined
  project: VideoStudioProject | undefined
  onReloadProjects: () => void
}): VideoStudioProductionController {
  const { hostId, target, pairingRevision, project, onReloadProjects } = params
  const t = useTranslate()
  const mounted = useRef(true)
  const videoUrlRef = useRef<string | null>(null)
  const lastJobStatusRef = useRef<string | undefined>(undefined)

  const [engines, setEngines] = useState<VideoStudioEngineStatus[] | null>(null)
  const [probingEngines, setProbingEngines] = useState(true)
  const [composition, setComposition] = useState<VideoStudioCompositionState | null>(null)
  const [checkResult, setCheckResult] = useState<VideoStudioCheckResult | null>(null)
  const [job, setJob] = useState<VideoStudioRenderJobSnapshot | null>(null)
  const [preview, setPreview] = useState<VideoStudioPreviewState>({ active: false })
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRenderId, setSelectedRenderId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [loadingVideo, setLoadingVideo] = useState(false)
  const [probeTrigger, setProbeTrigger] = useState(0)

  const projectId = project?.id
  const handleCompletedRender = useEffectEvent(onReloadProjects)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      releaseVideoObjectUrl(videoUrlRef)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setProbingEngines(true)
    void probeVideoStudioEnginesForTarget(target, pairingRevision)
      .then((res) => {
        if (!cancelled) {
          setEngines(res.engines)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setProbingEngines(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [target, pairingRevision, probeTrigger])

  useEffect(() => {
    setCheckResult(null)
    setError(null)
    setSelectedRenderId(null)
    releaseVideoObjectUrl(videoUrlRef)
    setVideoUrl(null)
    lastJobStatusRef.current = undefined
    if (!projectId) {
      setComposition(null)
      setJob(null)
      setPreview({ active: false })
      return
    }
    let cancelled = false
    void getVideoStudioCompositionStateForTarget(target, { projectId }, pairingRevision)
      .then((state) => {
        if (!cancelled) {
          setComposition(state)
          setPreview({ active: state.previewActive, url: state.previewUrl })
        }
      })
      .catch(() => {})

    let subscription: { unsubscribe: () => void } | undefined
    void subscribeVideoStudioJobsForTarget(
      target,
      { projectId },
      {
        onEvent: (event) => {
          if (cancelled) {
            return
          }
          if (event.engines) {
            setEngines(event.engines)
          }
          const nextJob = event.jobs.find((item) => item.projectId === projectId) ?? null
          setJob(nextJob)
          setPreview(event.previews[projectId] ?? { active: false })
          const prevStatus = lastJobStatusRef.current
          lastJobStatusRef.current = nextJob?.status
          if (nextJob?.status === 'completed' && prevStatus === 'rendering') {
            handleCompletedRender()
            if (nextJob.record) {
              setSelectedRenderId(nextJob.record.id)
            }
          }
        }
      }
    ).then((sub) => {
      if (cancelled) {
        sub.unsubscribe()
      } else {
        subscription = sub
      }
    })

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [target, pairingRevision, projectId])

  const loadRender = (renderId: string, downloadName?: string) => {
    if (!projectId) {
      return
    }
    setSelectedRenderId(renderId)
    setError(null)
    setLoadingVideo(true)
    void runWithProductionBusy(
      setBusyAction,
      () => mounted.current,
      'loadVideo',
      async () => {
        const nextUrl = await fetchRenderBlobUrl(target, pairingRevision, projectId, renderId)
        if (!mounted.current) {
          URL.revokeObjectURL(nextUrl)
          return
        }
        releaseVideoObjectUrl(videoUrlRef)
        videoUrlRef.current = nextUrl
        setVideoUrl(nextUrl)
        setLoadingVideo(false)
        if (downloadName) {
          triggerVideoDownload(nextUrl, downloadName)
        }
      }
    ).catch((reason: unknown) => {
      if (mounted.current) {
        setLoadingVideo(false)
        setError(mapProductionRpcError(t, reason))
      }
    })
  }

  const runAction = (action: string, work: (id: string) => Promise<void>, reportError = true) => {
    if (!projectId) {
      return
    }
    if (reportError) {
      setError(null)
    }
    void runWithProductionBusy(
      setBusyAction,
      () => mounted.current,
      action,
      () => work(projectId)
    ).catch((reason: unknown) => {
      if (reportError && mounted.current) {
        setError(mapProductionRpcError(t, reason))
      }
    })
  }

  return {
    engines,
    probingEngines,
    composition,
    checkResult,
    job,
    preview,
    busyAction,
    error,
    selectedRenderId,
    videoUrl,
    loadingVideo,
    recheckEngines: () => setProbeTrigger((n) => n + 1),
    scaffoldComposition: (overwrite = false) =>
      runAction('scaffold', async (id) => {
        const next = await scaffoldVideoStudioCompositionForTarget(
          target,
          { projectId: id, overwrite },
          pairingRevision
        )
        if (mounted.current) {
          setComposition(next)
        }
      }),
    openInWorkspace: () =>
      runAction('openWorkspace', (id) =>
        openVideoStudioWorkspaceInApp({ target, pairingRevision, hostId, projectId: id })
      ),
    runCheck: () =>
      runAction('check', async (id) => {
        const result = await checkVideoStudioCompositionForTarget(
          target,
          { projectId: id },
          pairingRevision
        )
        if (mounted.current) {
          setCheckResult(result)
        }
      }),
    startPreview: () =>
      runAction('preview', async (id) => {
        const nextPreview = await startVideoStudioPreviewForTarget(
          target,
          { projectId: id },
          pairingRevision
        )
        if (mounted.current) {
          setPreview(nextPreview)
        }
      }),
    stopPreview: () =>
      runAction(
        'stopPreview',
        async (id) => {
          const nextPreview = await stopVideoStudioPreviewForTarget(
            target,
            { projectId: id },
            pairingRevision
          )
          if (mounted.current) {
            setPreview(nextPreview)
          }
        },
        false
      ),
    startRender: (quality) =>
      runAction('render', async (id) => {
        const { job: started } = await startVideoStudioRenderForTarget(
          target,
          { projectId: id, quality },
          pairingRevision
        )
        if (mounted.current) {
          setJob(started)
        }
      }),
    cancelRender: () => {
      if (projectId) {
        void cancelVideoStudioRenderForTarget(target, { projectId }, pairingRevision).catch(
          () => {}
        )
      }
    },
    selectRender: (renderId) => loadRender(renderId),
    saveRender: (renderId) => {
      const record = project?.renders.find((r) => r.id === renderId)
      if (!record) {
        return
      }
      if (selectedRenderId === renderId && videoUrlRef.current) {
        triggerVideoDownload(videoUrlRef.current, record.fileName)
        return
      }
      loadRender(renderId, record.fileName)
    }
  }
}
