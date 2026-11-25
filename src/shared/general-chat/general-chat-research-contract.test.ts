import { expect, it } from 'vitest'
import {
  canCancelDeepResearch,
  canPauseDeepResearch,
  canResumeDeepResearch,
  formatWebSearchContextPrompt,
  GeneralChatSearchWebParams,
  GeneralChatStartDeepResearchParams,
  type GeneralChatSource
} from './general-chat-research-contract'

it('rejects traversal characters in general chat session ids', () => {
  expect(() =>
    GeneralChatSearchWebParams.parse({
      sessionId: '../escape',
      query: 'orca'
    })
  ).toThrow()

  expect(() =>
    GeneralChatStartDeepResearchParams.parse({
      sessionId: 'dir/sub',
      topic: 'orca'
    })
  ).toThrow()
})

it('enforces pause, resume, and cancel state-machine transitions consistently', () => {
  expect(canPauseDeepResearch('searching')).toBe(true)
  expect(canPauseDeepResearch('paused')).toBe(false)
  expect(canPauseDeepResearch('completed')).toBe(false)

  expect(canResumeDeepResearch('paused')).toBe(true)
  expect(canResumeDeepResearch('failed')).toBe(true)
  expect(canResumeDeepResearch('searching')).toBe(false)
  expect(canResumeDeepResearch('cancelled')).toBe(false)

  expect(canCancelDeepResearch('queued')).toBe(true)
  expect(canCancelDeepResearch('paused')).toBe(true)
  expect(canCancelDeepResearch('completed')).toBe(false)
})

it('formats compact grounded web search context with bounded excerpts', () => {
  const sources: GeneralChatSource[] = [
    {
      id: 's1',
      sessionId: 'sess-1',
      query: 'orca architecture',
      url: 'https://example.com/a',
      title: 'Architecture Overview',
      domain: 'example.com',
      snippet: 'Short snippet',
      extractedText: 'x'.repeat(600),
      provider: 'duckduckgo',
      origin: 'web-search',
      fetchedAt: 100
    }
  ]

  const prompt = formatWebSearchContextPrompt('Explain Orca architecture', sources)
  expect(prompt).toContain('Explain Orca architecture')
  expect(prompt).toContain('[1] Architecture Overview (https://example.com/a)')
  expect(prompt).toContain('...')
})
