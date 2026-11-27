import { useCallback, useRef } from 'react'
import { motionSafeScrollBehavior } from '@/hooks/theme/usePrefersReducedMotion'
import { useAppStore } from '../../../store/index'

export function useBrowserSessionCookieScroll(): {
  setBrowserPaneRootNode: (node: HTMLDivElement | null) => void
  scrollToSessionCookies: () => void
} {
  const pendingFrameIds = useRef<number[]>([])
  const cancelPendingFrames = useCallback(() => {
    for (const frameId of pendingFrameIds.current) {
      cancelAnimationFrame(frameId)
    }
    pendingFrameIds.current = []
  }, [])
  const requestScrollFrame = useCallback((callback: FrameRequestCallback) => {
    let completed = false
    let frameId: number | undefined
    frameId = requestAnimationFrame((timestamp) => {
      completed = true
      if (frameId !== undefined) {
        pendingFrameIds.current = pendingFrameIds.current.filter(
          (pendingFrameId) => pendingFrameId !== frameId
        )
      }
      callback(timestamp)
    })
    if (!completed) {
      pendingFrameIds.current.push(frameId)
    }
  }, [])
  const setBrowserPaneRootNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (node === null) {
        cancelPendingFrames()
      }
    },
    [cancelPendingFrames]
  )
  const scrollToSessionCookies = useCallback(() => {
    cancelPendingFrames()
    useAppStore.getState().setSettingsSearchQuery('')
    requestScrollFrame(() => {
      requestScrollFrame(() => {
        document.getElementById('browser-session-cookies')?.scrollIntoView({
          behavior: motionSafeScrollBehavior(),
          block: 'start'
        })
      })
    })
  }, [cancelPendingFrames, requestScrollFrame])

  return { setBrowserPaneRootNode, scrollToSessionCookies }
}
