import type { Translate } from '@/i18n/use-translate'
import { activateAndRevealFolderWorkspaceWithOutcome } from '@/lib/workspace/activation/worktree-activation'
import { RuntimeRpcCallError } from '@/runtime/rpc/calls/runtime-rpc-result'
import {
  openVideoStudioCompositionWorkspaceForTarget,
  readVideoStudioRenderOutputChunkForTarget
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
  return t('videoStudio.productionActionFailed', 'The video engine could not complete this action.')
}
