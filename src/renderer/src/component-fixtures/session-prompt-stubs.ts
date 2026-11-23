// Chats that wait on one approval or question, for fixtures: their readers answer from memory, with no host.
import { botHostTarget } from '@/lib/bot-hosts'
import {
  getOrCreateStructuredReadOwner,
  retireStructuredAgentSessionReadOwner,
  structuredReadOwnerKey
} from '@/components/native-chat/session/structured/read/structured-agent-session-read-owner-registry'
import type {
  StructuredAgentSessionReadOwner,
  StructuredAgentSessionReadSnapshot
} from '@/components/native-chat/session/structured/read/structured-agent-session-read-owner-contract'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
  type StructuredAgentSessionState
} from '../../../shared/agent-session/view/live-read/structured-agent-session-reducer'
import type { AgentJournalRenderItem } from '../../../shared/agent-session/journal/agent-session-journal-types'

export type FixturePrompt =
  | { kind: 'question'; question: string }
  | { kind: 'approval'; title: string; detail: string }

function promptItem(sessionId: string, prompt: FixturePrompt): AgentJournalRenderItem {
  const body =
    prompt.kind === 'question'
      ? {
          kind: 'question',
          question: prompt.question,
          options: [],
          resolution: { state: 'pending' }
        }
      : {
          kind: 'approval',
          title: prompt.title,
          detail: prompt.detail,
          options: [
            { id: 'allow', label: 'Allow' },
            { id: 'deny', label: 'Deny' }
          ],
          resolution: { state: 'pending' }
        }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Needs you reads only the prompt body.
  return {
    itemId: `${sessionId}:prompt`,
    revision: 1,
    sequence: 1,
    observedAt: 0,
    body
  } as unknown as AgentJournalRenderItem
}

export function stubStructuredSessionReader(
  sessionId: string,
  state: StructuredAgentSessionState
): (state: StructuredAgentSessionState) => void {
  let current: StructuredAgentSessionReadSnapshot = {
    state,
    loadingOlder: false,
    olderHistoryGeneration: 0,
    initialHistoryAutoLoad: false,
    current: true
  }
  const listeners = new Set<() => void>()
  const none = (): (() => void) => () => {}
  const owner: StructuredAgentSessionReadOwner = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribeCommandsChanged: none,
    activate: none,
    retain: none,
    retainHistory: none,
    trimHistory: () => {},
    dispose: () => {},
    loadOlder: async () => 'exhausted',
    admit: async () => {},
    trackSend: () => ({ issue: () => {}, settle: () => {} }),
    publishCreated: () => {}
  }
  const target = botHostTarget('local')
  retireStructuredAgentSessionReadOwner(sessionId, target)
  getOrCreateStructuredReadOwner(structuredReadOwnerKey(sessionId, target), () => owner)
  return (next) => {
    current = { ...current, state: next }
    for (const listener of listeners) {
      listener()
    }
  }
}

/** Registers a reader per chat. The returned call swaps its prompt like a host update. */
export function stubSessionPrompts(
  prompts: Record<string, FixturePrompt>
): (sessionId: string, prompt: FixturePrompt) => void {
  const swaps = new Map<string, (prompt: FixturePrompt) => void>()
  for (const [sessionId, first] of Object.entries(prompts)) {
    const state = (prompt: FixturePrompt): StructuredAgentSessionState => ({
      ...EMPTY_STRUCTURED_AGENT_SESSION,
      currentRequests: [promptItem(sessionId, prompt)]
    })
    const update = stubStructuredSessionReader(sessionId, state(first))
    swaps.set(sessionId, (prompt) => update(state(prompt)))
  }
  return (sessionId, prompt) => swaps.get(sessionId)?.(prompt)
}
