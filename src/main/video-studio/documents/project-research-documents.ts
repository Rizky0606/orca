import { readFile } from 'node:fs/promises'
import * as z from 'zod'
import {
  VideoStudioResearchSourceSchema,
  type VideoStudioResearchSource
} from '../../../shared/video-studio/video-studio-storyboard-contract'
import { resolveContainedPath } from '../video-studio-path-containment'
import type { VideoStudioTransactionCoordinator } from '../video-studio-transactions'
import {
  readFileWithSha256,
  sha256Bytes,
  VIDEO_STUDIO_FILE_CONFLICT_ERROR
} from '../video-studio-tx-journal'
import { syncResearchNotesMarkdown, updateBriefMarkdown } from './video-studio-markdown-sync'

const SourcesDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.array(VideoStudioResearchSourceSchema)
})

export async function readContainedDisk(projectDir: string, relativePath: string) {
  const abs = await resolveContainedPath(projectDir, relativePath)
  return readFileWithSha256(abs)
}

export function assertExpectedRevision(actualSha: string | null, expectedRevision?: string): void {
  if (expectedRevision !== undefined && actualSha !== expectedRevision) {
    throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
  }
}

export function parseSourcesJson(raw: string | null): VideoStudioResearchSource[] {
  if (!raw) {
    return []
  }
  try {
    const parsed = SourcesDocumentSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.sources : []
  } catch {
    return []
  }
}

export async function commitBriefUpdate(
  tx: VideoStudioTransactionCoordinator,
  projectDir: string,
  projectId: string,
  params: {
    frontmatter?: Record<string, unknown>
    briefMarkdown?: string
    expectedRevision?: string
  }
): Promise<{ revision: string }> {
  const disk = await readContainedDisk(projectDir, 'BRIEF.md')
  assertExpectedRevision(disk.sha256, params.expectedRevision)
  const current = disk.bytes?.toString('utf8') ?? ''
  const next = updateBriefMarkdown(current, {
    frontmatter: params.frontmatter,
    briefMarkdown: params.briefMarkdown
  })
  const txRes = await tx.runProjectTransaction({
    projectDir,
    projectId,
    operations: [{ relativePath: 'BRIEF.md', content: next, expectedSha256: disk.sha256 }]
  })
  return { revision: txRes.revisions['BRIEF.md']! }
}

export async function commitScriptUpdate(
  tx: VideoStudioTransactionCoordinator,
  projectDir: string,
  projectId: string,
  params: { scriptMarkdown: string; expectedRevision?: string }
): Promise<{ revision: string }> {
  const disk = await readContainedDisk(projectDir, 'SCRIPT.md')
  assertExpectedRevision(disk.sha256, params.expectedRevision)
  const txRes = await tx.runProjectTransaction({
    projectDir,
    projectId,
    operations: [
      { relativePath: 'SCRIPT.md', content: params.scriptMarkdown, expectedSha256: disk.sha256 }
    ]
  })
  return { revision: txRes.revisions['SCRIPT.md']! }
}

export async function commitResearchSourceUpsert(
  tx: VideoStudioTransactionCoordinator,
  projectDir: string,
  projectId: string,
  sourceInput: {
    id?: string
    url: string
    title: string
    domain?: string
    snippet?: string
    accessedAt?: number
    origin: VideoStudioResearchSource['origin']
    verificationStatus: VideoStudioResearchSource['verificationStatus']
    claimIds: string[]
  },
  expectedRevision?: string
): Promise<{ source: VideoStudioResearchSource; revision: string }> {
  const [sourcesDisk, notesDisk] = await Promise.all([
    readContainedDisk(projectDir, 'references/sources.json'),
    readContainedDisk(projectDir, 'references/research-notes.md')
  ])
  assertExpectedRevision(sourcesDisk.sha256, expectedRevision)

  const sources = parseSourcesJson(sourcesDisk.bytes?.toString('utf8') ?? null)
  const resolvedId = sourceInput.id ?? `src_${sha256Bytes(sourceInput.url).slice(0, 12)}`
  const entry = VideoStudioResearchSourceSchema.parse({
    ...sourceInput,
    id: resolvedId,
    domain: sourceInput.domain ?? new URL(sourceInput.url).hostname,
    accessedAt: sourceInput.accessedAt ?? Date.now()
  })
  const existingIdx = sources.findIndex(
    (item) => item.id === entry.id || (!sourceInput.id && item.url === entry.url)
  )
  if (existingIdx !== -1) {
    sources[existingIdx] = entry
  } else {
    sources.push(entry)
  }

  const nextNotes = syncResearchNotesMarkdown(notesDisk.bytes?.toString('utf8') ?? '', sources)
  const txRes = await tx.runProjectTransaction({
    projectDir,
    projectId,
    operations: [
      {
        relativePath: 'references/sources.json',
        content: `${JSON.stringify({ schemaVersion: 1, sources }, null, 2)}\n`,
        expectedSha256: sourcesDisk.sha256
      },
      {
        relativePath: 'references/research-notes.md',
        content: nextNotes,
        expectedSha256: notesDisk.sha256
      }
    ]
  })
  return { source: entry, revision: txRes.revisions['references/sources.json']! }
}

export async function commitResearchSourceDelete(
  tx: VideoStudioTransactionCoordinator,
  projectDir: string,
  projectId: string,
  sourceId: string,
  expectedRevision?: string
): Promise<{ deleted: boolean; revision: string }> {
  const [sourcesDisk, notesDisk] = await Promise.all([
    readContainedDisk(projectDir, 'references/sources.json'),
    readContainedDisk(projectDir, 'references/research-notes.md')
  ])
  assertExpectedRevision(sourcesDisk.sha256, expectedRevision)

  const sources = parseSourcesJson(sourcesDisk.bytes?.toString('utf8') ?? null)
  const filtered = sources.filter((item) => item.id !== sourceId)
  if (filtered.length === sources.length) {
    return { deleted: false, revision: sourcesDisk.sha256 ?? sha256Bytes('') }
  }
  const nextNotes = syncResearchNotesMarkdown(notesDisk.bytes?.toString('utf8') ?? '', filtered)
  const txRes = await tx.runProjectTransaction({
    projectDir,
    projectId,
    operations: [
      {
        relativePath: 'references/sources.json',
        content: `${JSON.stringify({ schemaVersion: 1, sources: filtered }, null, 2)}\n`,
        expectedSha256: sourcesDisk.sha256
      },
      {
        relativePath: 'references/research-notes.md',
        content: nextNotes,
        expectedSha256: notesDisk.sha256
      }
    ]
  })
  return { deleted: true, revision: txRes.revisions['references/sources.json']! }
}

export async function readOptionalProjectText(
  projectDir: string,
  relativePath: string
): Promise<string | null> {
  const abs = await resolveContainedPath(projectDir, relativePath)
  return readFile(abs, 'utf8').catch(() => null)
}
