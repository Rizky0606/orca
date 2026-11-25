import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { RuntimeRpcCallError } from '@/runtime/rpc/calls/runtime-rpc-result'
import { getRuntimeEnvironmentRevision } from '@/runtime/rpc/environment-revisions/runtime-environment-revision'
import {
  createVideoStudioProjectForTarget,
  deleteVideoStudioProjectForTarget,
  listVideoStudioProjectsForTarget,
  updateVideoStudioProjectForTarget
} from '@/runtime/video-studio/video-studio-client'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type {
  VideoStudioCreateProjectParams,
  VideoStudioListProjectsResult
} from '../../../../shared/video-studio/video-studio-rpc-contract'
import { useVideoStudioSelection } from './video-studio-selection'

async function runWithMutationFlag(
  flag: { current: boolean },
  setSaving: (saving: boolean) => void,
  current: () => boolean,
  work: () => Promise<boolean>
): Promise<boolean> {
  try {
    return await work()
  } finally {
    flag.current = false
    if (current()) {
      setSaving(false)
    }
  }
}

export function useVideoStudioController(
  hostId: ExecutionHostId,
  target: RuntimeClientTarget,
  pairingRevision: number | undefined
) {
  const t = useTranslate()
  const [snapshot, setSnapshot] = useState<VideoStudioListProjectsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const active = useRef(false)
  const mutating = useRef(false)
  const projectId = useVideoStudioSelection((state) =>
    state.hostId === hostId && state.project?.pairingRevision === pairingRevision
      ? (state.project?.id ?? null)
      : null
  )
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const current = useCallback(() => {
    const savedHostId = useVideoStudioSelection.getState().hostId
    return (
      active.current &&
      (savedHostId === hostId || savedHostId === null) &&
      (target.kind === 'local' ||
        (pairingRevision !== undefined &&
          getRuntimeEnvironmentRevision(target.environmentId) === pairingRevision))
    )
  }, [hostId, pairingRevision, target])

  function applyControllerError(reason: unknown, isSave: boolean) {
    const code = reason instanceof RuntimeRpcCallError ? reason.code : undefined
    if (code === 'method_not_found' || code === 'runtime_unavailable' || code === 'forbidden') {
      setError(
        t('videoStudio.capabilityUnavailable', 'Video Studio is unavailable on this computer.')
      )
    } else if (code === 'video_studio_catalog_unreadable') {
      setError(
        t(
          'videoStudio.catalogUnreadable',
          'The project catalog could not be read. The catalog file was preserved.'
        )
      )
    } else if (code === 'video_studio_project_not_found') {
      setError(
        t(
          'videoStudio.projectNoLongerAvailable',
          'This project is no longer available. Reload the project list.'
        )
      )
    } else if (isSave) {
      setError(
        t(
          'videoStudio.mutationFailed',
          'The computer did not confirm this change. Reload to check the saved projects.'
        )
      )
    } else {
      setError(t('videoStudio.loadFailed', 'Could not load projects from this computer.'))
    }
  }

  const showLoadError = useEffectEvent((reason: unknown) => applyControllerError(reason, false))

  useEffect(() => {
    let ignore = false
    void listVideoStudioProjectsForTarget(target, pairingRevision)
      .then((result) => {
        if (!ignore && current()) {
          setSnapshot(result)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!ignore && current()) {
          showLoadError(reason)
        }
      })
      .finally(() => {
        if (!ignore && current()) {
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [attempt, current, target, pairingRevision])

  function selectProject(id: string | null) {
    useVideoStudioSelection.getState().selectProject(hostId, id ? { id, pairingRevision } : null)
  }

  async function mutate(
    work: () => Promise<VideoStudioListProjectsResult & { projectId?: string }>,
    clearSelection = false
  ): Promise<boolean> {
    if (!current() || mutating.current || loading) {
      return false
    }
    mutating.current = true
    setSaving(true)
    setError(null)
    return runWithMutationFlag(mutating, setSaving, current, async () => {
      try {
        const result = await work()
        if (!current()) {
          return false
        }
        setSnapshot({ projects: result.projects, invalidRecords: result.invalidRecords })
        if (result.projectId || clearSelection) {
          selectProject(result.projectId ?? null)
        }
        return true
      } catch (reason) {
        if (current()) {
          applyControllerError(reason, true)
        }
        return false
      }
    })
  }

  return {
    snapshot,
    loading,
    saving,
    error,
    projectId,
    selectProject,
    retry() {
      setLoading(true)
      setError(null)
      setAttempt((value) => value + 1)
    },
    refresh() {
      setAttempt((value) => value + 1)
    },
    saveProject(id: string | null, fields: VideoStudioCreateProjectParams) {
      return mutate(() =>
        id
          ? updateVideoStudioProjectForTarget(target, { id, changes: fields }, pairingRevision)
          : createVideoStudioProjectForTarget(target, fields, pairingRevision)
      )
    },
    deleteProject(id: string) {
      return mutate(() => deleteVideoStudioProjectForTarget(target, { id }, pairingRevision), true)
    }
  }
}
