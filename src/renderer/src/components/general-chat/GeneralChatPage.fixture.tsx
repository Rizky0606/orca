import { useState, type ReactNode } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { stubBots } from '../../component-fixtures/fixture-bots'
import { stubStructuredSessionReader } from '../../component-fixtures/session-prompt-stubs'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../../shared/agent-session/view/live-read/structured-agent-session-reducer'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type {
  DeepResearchJob,
  GeneralChatSource
} from '../../../../shared/general-chat/general-chat-contract'
import { GeneralChatAvailable } from './GeneralChatAvailable'
import { GeneralChatHostUnavailable, GeneralChatPageFrame } from './GeneralChatPage'
import type {
  GeneralChatConversation,
  useGeneralChatController
} from './use-general-chat-controller'
import type { GeneralChatHost } from './use-general-chat-hosts'
import type { GeneralChatResearchController } from './use-general-chat-research'

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

const sampleSources: GeneralChatSource[] = [
  {
    id: 'src-1',
    sessionId: 'fixture-general-chat-summary',
    query: 'React Compiler 2026 production adoption',
    url: 'https://react.dev/learn/react-compiler',
    title: 'React Compiler Overview & Incremental Adoption Guide',
    domain: 'react.dev',
    snippet:
      'Automatic memoization reduces manual useMemo/useCallback boilerplate in production apps.',
    provider: 'duckduckgo',
    origin: 'web-search',
    fetchedAt: observedAt
  },
  {
    id: 'src-2',
    sessionId: 'fixture-general-chat-summary',
    query: 'React Compiler 2026 production adoption',
    url: 'https://example.org/react-compiler-benchmarks',
    title: 'Production Rendering Benchmarks After Enabling Compiler',
    domain: 'example.org',
    snippet: 'Case studies report 12-28% fewer re-renders on dense data tables.',
    provider: 'tavily',
    origin: 'deep-research',
    fetchedAt: observedAt
  }
]

const runningResearchJob: DeepResearchJob = {
  id: 'job-running-1',
  sessionId: 'fixture-general-chat-summary',
  topic: 'Compare Electron IPC vs WebSockets for local AI studios',
  providerPreference: 'auto',
  status: 'searching',
  currentStepIndex: 1,
  queriesExecuted: 2,
  sourcesCollected: 2,
  pagesRead: 1,
  citationIds: ['src-1', 'src-2'],
  steps: [
    {
      id: 'step-1',
      title: 'Throughput & serialization overhead benchmarks',
      query: 'Electron MessagePort IPC vs WebSocket latency benchmark',
      status: 'completed',
      sourceIds: ['src-1']
    },
    {
      id: 'step-2',
      title: 'Security boundaries & remote host portability',
      query: 'Electron RPC capability routing local remote hosts',
      status: 'running',
      sourceIds: []
    },
    {
      id: 'step-3',
      title: 'Synthesis and architectural recommendation',
      query: 'local-first Electron RPC architecture best practices',
      status: 'pending',
      sourceIds: []
    }
  ],
  createdAt: observedAt,
  updatedAt: observedAt + 5_000
}

const completedResearchJob: DeepResearchJob = {
  ...runningResearchJob,
  id: 'job-completed-1',
  status: 'completed',
  queriesExecuted: 3,
  sourcesCollected: 2,
  pagesRead: 2,
  steps: runningResearchJob.steps.map((step) => ({ ...step, status: 'completed' })),
  reportMarkdown:
    '# Deep Research: Electron IPC vs WebSockets\n\n## Summary\nStructured JSON-RPC over Electron IPC pairs zero-port local security with seamless WebSocket relay fallback for paired mobile & remote hosts [1][2].\n\n## Sources\n[1] react.dev — React Compiler Overview\n[2] example.org — Production Rendering Benchmarks',
  completedAt: observedAt + 12_000
}

const baseResearchController: GeneralChatResearchController = {
  mode: 'normal',
  setMode: () => {},
  openPanel: null,
  togglePanel: () => {},
  sources: sampleSources,
  jobs: [],
  selectedJob: null,
  selectedCitations: [],
  searching: false,
  busyAction: null,
  error: null,
  selectJob: () => {},
  searchWeb: async () => {},
  deleteSource: async () => {},
  clearSources: async () => {},
  startResearch: async () => {},
  pauseJob: async () => {},
  resumeJob: async () => {},
  cancelJob: async () => {},
  sendReportToChat: async () => {},
  handoffToVideoStudio: async () => {},
  prepareTurn: undefined
}

function ActiveFixture({
  researchOverride
}: {
  researchOverride?: GeneralChatResearchController
} = {}) {
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
        researchOverride={researchOverride}
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
  render: () => <ActiveFixture researchOverride={baseResearchController} />
})

export const narrow = defineFixture({
  width: 390,
  setup: setupTranscript,
  render: () => <ActiveFixture researchOverride={baseResearchController} />
})

export const webSearchSources = defineFixture({
  width: 960,
  setup: setupTranscript,
  render: () => (
    <ActiveFixture
      researchOverride={{
        ...baseResearchController,
        mode: 'web-search',
        openPanel: 'sources'
      }}
    />
  )
})

export const deepResearchRunning = defineFixture({
  width: 960,
  setup: setupTranscript,
  render: () => (
    <ActiveFixture
      researchOverride={{
        ...baseResearchController,
        mode: 'deep-research',
        openPanel: 'research',
        jobs: [runningResearchJob],
        selectedJob: runningResearchJob,
        selectedCitations: sampleSources
      }}
    />
  )
})

export const deepResearchCompleted = defineFixture({
  width: 960,
  setup: setupTranscript,
  render: () => (
    <ActiveFixture
      researchOverride={{
        ...baseResearchController,
        mode: 'deep-research',
        openPanel: 'research',
        jobs: [completedResearchJob],
        selectedJob: completedResearchJob,
        selectedCitations: sampleSources
      }}
    />
  )
})
