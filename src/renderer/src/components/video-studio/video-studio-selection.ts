import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'

type ProjectSelection = { id: string; pairingRevision: number | undefined }

type VideoStudioSelection = {
  hostId: ExecutionHostId | null
  project: ProjectSelection | null
  selectHost: (hostId: ExecutionHostId) => void
  selectProject: (hostId: ExecutionHostId, project: ProjectSelection | null) => void
}

export const useVideoStudioSelection = create<VideoStudioSelection>()(
  persist(
    (set) => ({
      hostId: null,
      project: null,
      selectHost: (hostId) =>
        set((state) => (state.hostId === hostId ? state : { hostId, project: null })),
      selectProject: (hostId, project) =>
        set((state) => (state.hostId === hostId ? { project } : state))
    }),
    {
      name: 'orca-video-studio-selection',
      partialize: ({ hostId, project }) => ({ hostId, project })
    }
  )
)
