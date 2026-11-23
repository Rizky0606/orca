import { useState, type ReactNode } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { stubBots } from '../../component-fixtures/fixture-bots'
import { stubStructuredSessionReader } from '../../component-fixtures/session-prompt-stubs'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../../shared/agent-session/view/live-read/structured-agent-session-reducer'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GeneralChatAvailable } from './GeneralChatAvailable'
import { GeneralChatHostUnavailable, GeneralChatPageFrame } from './GeneralChatPage'
import type {
  GeneralChatConversation,
  useGeneralChatController
} from './use-general-chat-controller'
import type { GeneralChatHost } from './use-general-chat-hosts'

const local: GeneralChatHost = { id: 'local', label: 'This computer' }
const remote: GeneralChatHost = { id: 'runtime:studio', label: 'Studio server' }
const target: RuntimeClientTarget = { kind: 'local' }
const worktreeId = 'folder:general-chat-fixture'
const conversations: GeneralChatConversation[] = [
  {
    sessionId: 'fixture-general-chat-summary',
    tabId: 'agent-session:fixture-general-chat-summary',
    worktreeId,
    title: 'Summarize the workshop notes',
    agent: 'codex'
  },
  {
    sessionId: 'fixture-general-chat-newsletter',
    tabId: 'agent-session:fixture-general-chat-newsletter',
    worktreeId,
    title: 'Newsletter outline',
    agent: 'claude'
  },
  {
    sessionId: 'fixture-general-chat-books',
    tabId: 'agent-session:fixture-general-chat-books',
    worktreeId,
    title: 'Books to read next',
    agent: 'codex'
  }
]

const baseController: ReturnType<typeof useGeneralChatController> = {
  home: { kind: 'ready', worktreeId },
  launch: { kind: 'idle' },
  busy: false,
  conversations: [],
  conversation: null,
  selectConversation: () => {},
  providers: ['codex', 'claude'],
  provider: 'codex',
  providerReady: true,
  providersLoading: false,
  providerUnavailableReason: null,
  setProvider: () => {},
  newChat: async () => {},
  retryHome: () => {}
}

const observedAt = Date.parse('2026-11-23T10:00:00Z')
const transcript: AgentJournalRenderItem[] = [
  {
    itemId: 'workshop-request',
    revision: 1,
    sequence: 1,
    observedAt,
    body: {
      kind: 'message',
      role: 'user',
      blocks: [
        { type: 'text', text: 'Turn my workshop notes into a short follow-up for the team.' }
      ]
    }
  },
  {
    itemId: 'workshop-summary',
    revision: 1,
    sequence: 2,
    observedAt: observedAt + 2_000,
    body: {
      kind: 'message',
      role: 'assistant',
      blocks: [
        {
          type: 'text',
          text: 'Thanks for joining today’s workshop. We agreed to simplify the onboarding checklist, pair new starters with a buddy, and collect feedback after the first week. Share any additions before Friday so we can send the updated checklist on Monday.'
        }
      ]
    }
  }
]

function PageFixture({
  selectedHost = local,
  children
}: {
  selectedHost?: GeneralChatHost
  children: ReactNode
}) {
  return (
    <div className="flex h-144 overflow-hidden rounded-md border border-border">
      <GeneralChatPageFrame
        hosts={[local, remote]}
        selectedHost={selectedHost}
        onSelectHost={() => {}}
      >
        {children}
      </GeneralChatPageFrame>
    </div>
  )
}

function ActiveFixture() {
  const [sessionId, setSessionId] = useState<string | null>(conversations[0].sessionId)
  return (
    <PageFixture>
      <GeneralChatAvailable
        controller={{
          ...baseController,
          conversations,
          conversation: conversations.find((entry) => entry.sessionId === sessionId) ?? null,
          selectConversation: setSessionId
        }}
        target={target}
        onOpenAgentSettings={() => {}}
      />
    </PageFixture>
  )
}

function setupTranscript(): void {
  stubBots([])
  for (const { sessionId } of conversations) {
    stubStructuredSessionReader(sessionId, {
      ...EMPTY_STRUCTURED_AGENT_SESSION,
      status: 'ready',
      fence: 1,
      epoch: 'general-chat-fixture',
      items: transcript
    })
  }
}

export const empty = defineFixture({
  width: 960,
  render: () => (
    <PageFixture>
      <GeneralChatAvailable
        controller={baseController}
        target={target}
        onOpenAgentSettings={() => {}}
      />
    </PageFixture>
  )
})

export const unavailable = defineFixture({
  width: 960,
  render: () => (
    <PageFixture selectedHost={remote}>
      <GeneralChatHostUnavailable host={remote} environmentId="studio" />
    </PageFixture>
  )
})

export const active = defineFixture({
  width: 960,
  setup: setupTranscript,
  render: () => <ActiveFixture />
})

export const narrow = defineFixture({
  width: 390,
  setup: setupTranscript,
  render: () => <ActiveFixture />
})
