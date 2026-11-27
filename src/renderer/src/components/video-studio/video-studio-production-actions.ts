import type { Translate } from '@/i18n/use-translate'
import { activateAndRevealFolderWorkspaceWithOutcome } from '@/lib/workspace/activation/worktree-activation'
import { RuntimeRpcCallError } from '@/runtime/rpc/calls/runtime-rpc-result'
import {
  openVideoStudioCompositionWorkspaceForTarget,
  readVideoStudioRenderOutputChunkForTarget,
  subscribeVideoStudioJobsForTarget
} from '@/runtime/video-studio/video-studio-client'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { VideoStudioRenderQuality } from '../../../../shared/video-studio/video-studio-project'
import type {
  VideoStudioCheckResult,
  VideoStudioCompositionState,
  VideoStudioEngineStatus,
  VideoStudioPreviewState,
  VideoStudioRenderJobSnapshot
} from '../../../../shared/video-studio/video-studio-rpc-contract'

export type VideoStudioProductionController = {
  engines: VideoStudioEngineStatus[] | null
  probingEngines: boolean
  composition: VideoStudioCompositionState | null
  checkResult: VideoStudioCheckResult | null
  job: VideoStudioRenderJobSnapshot | null
  preview: VideoStudioPreviewState
  busyAction: string | null
  error: string | null
  selectedRenderId: string | null
  videoUrl: string | null
  loadingVideo: boolean
  externalChangedPaths?: string[]
  dismissExternalChanges?: () => void
  recheckEngines: () => void
  scaffoldComposition: (overwrite?: boolean) => void
  openInWorkspace: () => void
  runCheck: () => void
  startPreview: () => void
  stopPreview: () => void
  startRender: (quality: VideoStudioRenderQuality) => void
  cancelRender: () => void
  selectRender: (renderId: string) => void
  saveRender: (renderId: string) => void
}

export async function runWithProductionBusy(
  setBusy: (action: string | null) => void,
  isMounted: () => boolean,
  action: string,
  work: () => Promise<void>
): Promise<void> {
  setBusy(action)
  try {
    await work()
  } finally {
    if (isMounted()) {
      setBusy(null)
    }
  }
}

export async function fetchRenderBlobUrl(
  target: RuntimeClientTarget,
  pairingRevision: number | undefined,
  projectId: string,
  renderId: string
): Promise<string> {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  let eof = false
  while (!eof) {
    const prevOffset = offset
    const res = await readVideoStudioRenderOutputChunkForTarget(
      target,
      { projectId, renderId, offset, maxBytes: 256 * 1024 },
      pairingRevision
    )
    const raw = atob(res.dataBase64)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i)
    }
    chunks.push(bytes)
    offset = res.nextOffset
    eof = res.eof || (res.nextOffset <= prevOffset && res.dataBase64.length === 0)
  }
  return URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }))
}

export function triggerVideoDownload(url: string, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
}

export function loadProductionRenderVideo(params: {
  t: Translate
  target: RuntimeClientTarget
  pairingRevision: number | undefined
  projectId: string
  renderId: string
  downloadName?: string
  videoUrlRef: { current: string | null }
  isMounted: () => boolean
  setBusy: (action: string | null) => void
  setSelectedRenderId: (id: string | null) => void
  setError: (error: string | null) => void
  setLoadingVideo: (loading: boolean) => void
  setVideoUrl: (url: string | null) => void
}): void {
  const {
    t,
    target,
    pairingRevision,
    projectId,
    renderId,
    downloadName,
    videoUrlRef,
    isMounted,
    setBusy,
    setSelectedRenderId,
    setError,
    setLoadingVideo,
    setVideoUrl
  } = params
  setSelectedRenderId(renderId)
  setError(null)
  setLoadingVideo(true)
  void runWithProductionBusy(setBusy, isMounted, 'loadVideo', async () => {
    const nextUrl = await fetchRenderBlobUrl(target, pairingRevision, projectId, renderId)
    if (!isMounted()) {
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
  }).catch((reason: unknown) => {
    if (isMounted()) {
      setLoadingVideo(false)
      setError(mapProductionRpcError(t, reason))
    }
  })
}

export function subscribeProductionProjectStream(params: {
  target: RuntimeClientTarget
  projectId: string
  lastJobStatusRef: { current: string | undefined }
  setEngines: (engines: VideoStudioEngineStatus[]) => void
  setJob: (job: VideoStudioRenderJobSnapshot | null) => void
  setCheckResult: (checkResult: VideoStudioCheckResult) => void
  setPreview: (preview: VideoStudioPreviewState) => void
  setSelectedRenderId: (renderId: string) => void
  onCompletedRender: () => void
  onExternalEdit: (changedPaths: string[]) => void
}): () => void {
  let cancelled = false
  let subscription: { unsubscribe: () => void } | undefined
  void subscribeVideoStudioJobsForTarget(
    params.target,
    { projectId: params.projectId },
    {
      onEvent: (event) => {
        if (cancelled) {
          return
        }
        if (event.engines) {
          params.setEngines(event.engines)
        }
        const nextJob = event.jobs.find((item) => item.projectId === params.projectId) ?? null
        params.setJob(nextJob)
        if (nextJob?.checkResult) {
          params.setCheckResult(nextJob.checkResult)
        }
        params.setPreview(event.previews[params.projectId] ?? { active: false })
        const prevStatus = params.lastJobStatusRef.current
        params.lastJobStatusRef.current = nextJob?.status
        if (nextJob?.status === 'completed' && prevStatus === 'rendering') {
          params.onCompletedRender()
          if (nextJob.record) {
            params.setSelectedRenderId(nextJob.record.id)
          }
        }
      },
      onFilesChanged: (event) => {
        if (!cancelled && event.externalEdit && event.projectId === params.projectId) {
          params.onExternalEdit(event.changedPaths)
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
}

export async function openVideoStudioWorkspaceInApp(params: {
  target: RuntimeClientTarget
  pairingRevision: number | undefined
  hostId: ExecutionHostId
  projectId: string
}): Promise<void> {
  const opened = await openVideoStudioCompositionWorkspaceForTarget(
    params.target,
    { projectId: params.projectId },
    params.pairingRevision
  )
  await useAppStore.getState().fetchReposForAllHosts()
  activateAndRevealFolderWorkspaceWithOutcome(opened.folderWorkspaceId, {
    executionHostId: params.hostId
  })
}

export function releaseVideoObjectUrl(ref: { current: string | null }): void {
  if (ref.current) {
    URL.revokeObjectURL(ref.current)
    ref.current = null
  }
}

export function mapProductionRpcError(t: Translate, reason: unknown): string {
  const code = reason instanceof RuntimeRpcCallError ? reason.code : undefined
  if (code === 'video_studio_engine_unavailable') {
    return t(
      'videoStudio.engineUnavailableError',
      'This render engine is unavailable on the host computer.'
    )
  }
  if (code === 'video_studio_job_already_running') {
    return t(
      'videoStudio.jobAlreadyRunningError',
      'A check or render job is already running for this project.'
    )
  }
  if (code === 'video_studio_render_not_found' || code === 'video_studio_render_file_missing') {
    return t('videoStudio.renderMissingError', 'The rendered video file could not be found.')
  }
  if (code === 'video_studio_execution_approval_required') {
    return t(
      'videoStudio.executionApprovalRequiredError',
      'Approve execution for this composition before running Chrome check, preview, or render.'
    )
  }
  if (code === 'video_studio_file_conflict') {
    return t(
      'videoStudio.fileConflictError',
      'Project files changed on disk. Reload the latest state and try again.'
    )
  }
  if (code === 'video_studio_style_readonly') {
    return t(
      'videoStudio.styleReadonlyError',
      'Built-in presets are read-only. Duplicate to your Host Library before saving changes.'
    )
  }
  if (code === 'video_studio_asset_in_use') {
    return t(
      'videoStudio.assetInUseError',
      'This asset is referenced by scenes or HTML/JS files. Use force removal to detach it.'
    )
  }
  if (code === 'video_studio_scene_not_found') {
    return t('videoStudio.sceneNotFoundError', 'This storyboard frame no longer exists on disk.')
  }
  if (code === 'video_studio_style_not_found') {
    return t('videoStudio.styleNotFoundError', 'The selected style profile could not be found.')
  }
  return t('videoStudio.productionActionFailed', 'The video engine could not complete this action.')
}
