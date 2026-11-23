import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'

type GeneralChatSelection = {
  hostId: ExecutionHostId | null
  sessionId: string | null
  selectHost: (hostId: ExecutionHostId) => void
  selectConversation: (hostId: ExecutionHostId, sessionId: string | null) => void
}

export const useGeneralChatSelection = create<GeneralChatSelection>()(
  persist(
    (set) => ({
      hostId: null,
      sessionId: null,
      selectHost: (hostId) =>
        set((state) => (state.hostId === hostId ? state : { hostId, sessionId: null })),
      selectConversation: (hostId, sessionId) =>
        set((state) => (state.hostId && state.hostId !== hostId ? state : { hostId, sessionId }))
    }),
    {
      name: 'orca-general-chat-selection',
      partialize: ({ hostId, sessionId }) => ({ hostId, sessionId })
    }
  )
)
