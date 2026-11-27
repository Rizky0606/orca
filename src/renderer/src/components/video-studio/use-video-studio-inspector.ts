import { useEffect, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { subscribeVideoStudioJobsForTarget } from '@/runtime/video-studio/video-studio-client'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  createInspectorRunner,
  fetchVideoStudioInspectorBundle,
  type InspectorBundleSnapshot
} from './video-studio-inspector-actions'
import { createVideoStudioInspectorMethods } from './video-studio-inspector-methods'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

const EMPTY_BUNDLE: InspectorBundleSnapshot = {
  documents: null,
  styleState: null,
  styleDiff: null,
  libraryStyles: [],
  motionPresets: [],
  projectAssets: null,
  libraryAssets: []
}

export function useVideoStudioInspector(params: {
  target: RuntimeClientTarget
  pairingRevision: number | undefined
  projectId: string | undefined
}): VideoStudioInspectorController {
  const { target, pairingRevision, projectId } = params
  const t = useTranslate()
  const [bundle, setBundle] = useState<InspectorBundleSnapshot>(EMPTY_BUNDLE)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [externalChangedPaths, setExternalChangedPaths] = useState<string[]>([])
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let active = true
    void fetchVideoStudioInspectorBundle(target, pairingRevision, projectId).then((next) => {
      if (active) {
        setBundle(next)
      }
    })
    return () => {
      active = false
    }
  }, [target, pairingRevision, projectId, reloadTick])

  useEffect(() => {
    if (!projectId) {
      return
    }
    let cancelled = false
    let subscription: { unsubscribe: () => void } | undefined
    void subscribeVideoStudioJobsForTarget(
      target,
      { projectId },
      {
        onEvent: () => {},
        onFilesChanged: (event) => {
          if (!cancelled && event.externalEdit && event.projectId === projectId) {
            setExternalChangedPaths(event.changedPaths)
            setReloadTick((n) => n + 1)
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

  const reload = () => setReloadTick((n) => n + 1)
  const run = createInspectorRunner({
    t,
    isMounted: () => true,
    setBusy: setBusyAction,
    setError,
    reload
  })

  return {
    ...bundle,
    busyAction,
    error,
    externalChangedPaths,
    dismissExternalChanges: () => setExternalChangedPaths([]),
    reloadAll: reload,
    ...createVideoStudioInspectorMethods({ target, pairingRevision, projectId, bundle, run })
  }
}
