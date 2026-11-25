import * as z from 'zod'
import type {
  DeepResearchPlanStep,
  GeneralChatSource
} from '../../../shared/general-chat/general-chat-research-contract'

export type ResearchTextGenerator = (prompt: string) => Promise<string | null>

const PlanOutputSchema = z.array(
  z.object({
    title: z.string().trim().min(1).max(240),
    query: z.string().trim().min(1).max(500)
  })
)

function buildDeterministicSteps(topic: string, maxSteps: number): DeepResearchPlanStep[] {
  const cleanTopic = topic.trim()
  const templates: { title: string; query: string }[] = [
    { title: 'Core overview and current state', query: `${cleanTopic} overview key facts` },
    {
      title: 'Technical architecture and implementation',
      query: `${cleanTopic} architecture details documentation`
    },
    {
      title: 'Comparisons, trade-offs, and benchmarks',
      query: `${cleanTopic} comparisons trade-offs benchmarks`
    },
    {
      title: 'Recent updates and ecosystem adoption',
      query: `${cleanTopic} latest updates 2026`
    },
    {
      title: 'Limitations and open risks',
      query: `${cleanTopic} limitations caveats risks`
    }
  ]

  return templates.slice(0, maxSteps).map((entry, index) => ({
    id: `step-${index + 1}`,
    title: entry.title,
    query: entry.query,
    status: 'pending',
    sourceIds: []
  }))
}

export async function planResearchSteps(input: {
  topic: string
  maxSteps: number
  generateText?: ResearchTextGenerator
}): Promise<DeepResearchPlanStep[]> {
  if (input.generateText) {
    const prompt = [
      `Create a focused research plan of ${input.maxSteps} web search sub-questions for:`,
      input.topic,
      'Return ONLY a JSON array of objects with keys "title" and "query".'
    ].join('\n')
    try {
      const raw = await input.generateText(prompt)
      const jsonMatch = raw?.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = PlanOutputSchema.safeParse(JSON.parse(jsonMatch[0]))
        if (parsed.success && parsed.data.length > 0) {
          return parsed.data.slice(0, input.maxSteps).map((entry, index) => ({
            id: `step-${index + 1}`,
            title: entry.title,
            query: entry.query,
            status: 'pending',
            sourceIds: []
          }))
        }
      }
    } catch {
      // Fall back to deterministic decomposition when host text generation fails.
    }
  }
  return buildDeterministicSteps(input.topic, input.maxSteps)
}

function buildDeterministicReport(input: {
  topic: string
  steps: readonly DeepResearchPlanStep[]
  sources: readonly GeneralChatSource[]
}): string {
  const lines: string[] = [`# Deep Research: ${input.topic}`, '']
  const citationIndexById = new Map<string, number>()
  input.sources.forEach((source, index) => {
    citationIndexById.set(source.id, index + 1)
  })

  lines.push('## Summary')
  if (input.sources.length === 0) {
    lines.push(
      `Executed ${input.steps.length} research angle(s) for "${input.topic}", but no public web sources matched the queries.`
    )
  } else {
    const leadFacts = input.sources.slice(0, 3).map((source) => {
      const idx = citationIndexById.get(source.id) ?? 1
      const snippet = (source.extractedText ?? source.snippet).replace(/\s+/g, ' ').trim()
      const clean = snippet.length > 220 ? `${snippet.slice(0, 217)}...` : snippet
      return `- **${source.title}** [${idx}]: ${clean || source.url}`
    })
    lines.push(
      `Synthesized findings across ${input.sources.length} verified source(s) covering ${input.steps.length} research angles.`,
      '',
      ...leadFacts
    )
  }

  lines.push('', '## Research Angles & Evidence')
  for (const step of input.steps) {
    lines.push(`### ${step.title}`)
    const stepSources = step.sourceIds
      .map((id) => input.sources.find((s) => s.id === id))
      .filter((entry): entry is GeneralChatSource => Boolean(entry))
    if (stepSources.length === 0) {
      lines.push(step.note ? `- ${step.note}` : '- No public sources recorded for this step.')
    } else {
      for (const source of stepSources.slice(0, 4)) {
        const idx = citationIndexById.get(source.id)
        const excerpt = (source.extractedText ?? source.snippet).replace(/\s+/g, ' ').trim()
        const trimmed = excerpt.length > 320 ? `${excerpt.slice(0, 317)}...` : excerpt
        lines.push(`- ${trimmed || source.title} ([${idx}] ${source.domain})`)
      }
    }
    lines.push('')
  }

  lines.push('## Sources')
  if (input.sources.length === 0) {
    lines.push('_No verified external sources collected._')
  } else {
    input.sources.forEach((source, index) => {
      lines.push(`[${index + 1}] [${source.title}](${source.url}) — \`${source.domain}\``)
    })
  }
  return lines.join('\n').trim()
}

export async function synthesizeResearchReport(input: {
  topic: string
  steps: readonly DeepResearchPlanStep[]
  sources: readonly GeneralChatSource[]
  generateText?: ResearchTextGenerator
}): Promise<string> {
  if (input.generateText && input.sources.length > 0) {
    const formattedSources = input.sources
      .slice(0, 12)
      .map((source, index) => {
        const text = (source.extractedText ?? source.snippet).replace(/\s+/g, ' ').trim()
        return `[${index + 1}] ${source.title} | ${source.url}\n${text.slice(0, 750)}`
      })
      .join('\n\n')
    const prompt = [
      `Write a concise, evidence-grounded Markdown report for the topic: "${input.topic}".`,
      'Cite facts ONLY using inline numeric brackets like [1], [2] matching the Sources list below.',
      'Do NOT invent URLs or claims not supported by the sources.',
      'Include headings: ## Summary, ## Key Findings, ## Sources.',
      '',
      'SOURCES:',
      formattedSources
    ].join('\n')
    try {
      const output = await input.generateText(prompt)
      if (output && output.trim().length > 120) {
        return output.trim().slice(0, 110_000)
      }
    } catch {
      // Fall back to deterministic citation report when LLM synthesis is unavailable.
    }
  }
  return buildDeterministicReport(input)
}
