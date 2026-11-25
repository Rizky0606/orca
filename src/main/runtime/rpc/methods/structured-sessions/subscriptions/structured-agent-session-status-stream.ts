// `agentSession.subscribeStatus` — every structured session's projected status on one stream.
//
// Session lists read turn state from here instead of replaying transcripts: one stream per client
// covers every session, and unlike a transcript subscription it retains none of them.

import { prepareStructuredTabsIfSupported } from '../../session-tabs/structured-session-tab-restore'
import { defineStreamingMethod } from '../../../core'
import { bindRpcSubscriptionStream } from '../../../core-subscription-stream'
import { requireStructuredHost as requireHost } from '../creation/structured-agent-session-gate'
import { structuredAgentSessionStatusSubscriptionId } from './structured-agent-session-subscription-id'
import { clientReadsStructuredSessionAgent } from '../structured-agent-session-policy'

export const bindStructuredAgentSessionStream = bindRpcSubscriptionStream

export const STRUCTURED_AGENT_SESSION_STATUS_METHODS = [
  defineStreamingMethod({
    name: 'agentSession.subscribeStatus',
    permission: 'workspace',
    params: null,
    handler: async (_params, ctx, emit) => {
      const restoration = prepareStructuredTabsIfSupported(ctx)
      if (restoration) {
        await restoration
      }
      const host = requireHost(ctx)
      const subscriptionId = structuredAgentSessionStatusSubscriptionId(ctx)
      let dispose = (): void => {}
      const stream = bindStructuredAgentSessionStream(ctx, subscriptionId, () => dispose())
      if (stream.isClosed()) {
        return
      }
      dispose = host.subscribeStatus({
        id: subscriptionId,
        emit: (event) => {
          if (event.type === 'snapshot') {
            emit({
              ...event,
              ...(event.conversationNames
                ? {
                    conversationNames: event.conversationNames.filter((note) => {
                      const record = host.deps.store.getConversation(note.sessionId)
                      return record && clientReadsStructuredSessionAgent(ctx, record.provider)
                    })
                  }
                : {}),
              ...(event.namingActiveSessionIds
                ? {
                    namingActiveSessionIds: event.namingActiveSessionIds.filter((sessionId) => {
                      const record = host.deps.store.getConversation(sessionId)
                      return record && clientReadsStructuredSessionAgent(ctx, record.provider)
                    })
                  }
                : {}),
              sessions: event.sessions.filter((session) =>
                clientReadsStructuredSessionAgent(ctx, session.agent)
              )
            })
          } else if (
            event.type !== 'status' ||
            clientReadsStructuredSessionAgent(ctx, event.session.agent)
          ) {
            emit(event)
          }
        }
      })
      if (stream.isClosed()) {
        dispose()
      }
    }
  })
]
