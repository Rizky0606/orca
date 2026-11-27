import type { VideoStudioProject } from '../../../shared/video-studio/video-studio-project'
import {
  VideoStudioResearchSourceSchema,
  type SceneSpec,
  type VideoStudioResearchSource
} from '../../../shared/video-studio/video-studio-storyboard-contract'
import type { StyleProfile } from '../../../shared/video-studio/video-studio-style-contract'
import type {
  DeepResearchJob,
  GeneralChatSource
} from '../../../shared/general-chat/general-chat-research-contract'

export type DraftBeat = { title: string; notes: string }

export function formatHandoffSourcesBlock(sources: readonly GeneralChatSource[]): string {
  if (sources.length === 0) {
    return ''
  }
  const items = sources
    .slice(0, 12)
    .map((source, index) => `[${index + 1}] ${source.title} — ${source.url}`)
  return ['', '## Verified Sources', ...items].join('\n')
}

export function mapResearchSources(
  sources: readonly GeneralChatSource[],
  job: DeepResearchJob | null
): VideoStudioResearchSource[] {
  const claimIdsBySource = new Map<string, string[]>()
  for (const step of job?.steps ?? []) {
    for (const sourceId of step.sourceIds) {
      const list = claimIdsBySource.get(sourceId) ?? []
      if (!list.includes(step.id)) {
        list.push(step.id)
      }
      claimIdsBySource.set(sourceId, list)
    }
  }

  const mapped: VideoStudioResearchSource[] = []
  for (const source of sources) {
    const origin =
      source.origin === 'web-search'
        ? 'general-chat-search'
        : source.origin === 'deep-research'
          ? 'deep-research'
          : 'manual'
    const candidate = VideoStudioResearchSourceSchema.safeParse({
      id: source.id,
      url: source.url,
      title: source.title,
      domain: source.domain,
      snippet: (source.extractedText ?? source.snippet).slice(0, 2000),
      accessedAt: source.fetchedAt,
      origin,
      verificationStatus: source.extractedText?.trim() ? 'verified' : 'unverified',
      claimIds: claimIdsBySource.get(source.id) ?? []
    })
    if (candidate.success) {
      mapped.push(candidate.data)
    }
  }
  return mapped
}

export function extractDraftBeats(
  title: string,
  briefBody: string,
  job: DeepResearchJob | null
): DraftBeat[] {
  const beats: DraftBeat[] = []
  const lines = briefBody.replace(/\r\n/g, '\n').split('\n')
  let currentTitle: string | null = null
  let buffer: string[] = []

  const flush = (): void => {
    if (!currentTitle) {
      return
    }
    const lower = currentTitle.toLowerCase()
    if (lower !== 'sources' && lower !== 'verified sources') {
      beats.push({
        title: currentTitle.replace(/[\r\n]+/g, ' ').trim(),
        notes: buffer.join('\n').trim() || currentTitle
      })
    }
    currentTitle = null
    buffer = []
  }

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match) {
      flush()
      currentTitle = match[1]
      continue
    }
    if (currentTitle) {
      buffer.push(line)
    }
  }
  flush()

  if (beats.length === 0 && job?.steps.length) {
    for (const step of job.steps.slice(0, 6)) {
      beats.push({ title: step.title, notes: step.note?.trim() || step.query })
    }
  }
  if (beats.length === 0) {
    beats.push({
      title: 'Opening',
      notes: briefBody.trim() || `Introduce ${title} and key findings.`
    })
  }
  return beats.slice(0, 8)
}

export function buildDraftStoryboardFrames(
  project: VideoStudioProject,
  beats: readonly DraftBeat[],
  styleProfile: StyleProfile
): SceneSpec[] {
  const count = beats.length
  const baseSeconds = Math.max(1, Math.floor(project.durationSeconds / count))
  let remainder = Math.max(0, project.durationSeconds - baseSeconds * count)

  return beats.map((beat, index) => {
    const frameNumber = index + 1
    const extraSecond = remainder > 0 ? 1 : 0
    if (remainder > 0) {
      remainder -= 1
    }
    const durationSec = Math.max(1, baseSeconds + extraSecond)
    const slug =
      beat.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || `scene-${frameNumber}`
    const prefix = String(frameNumber).padStart(2, '0')
    const isFirst = frameNumber === 1
    const isLast = frameNumber === count && count > 1
    return {
      sceneId: isFirst ? 'scene_opening_01' : `scene_handoff_${prefix}`,
      frameNumber,
      title: beat.title || `Frame ${frameNumber}`,
      status: 'outline',
      duration: `${durationSec}s`,
      transitionIn: isFirst ? 'cut' : 'fade',
      engine: project.engine,
      src: isFirst ? 'compositions/01-opening.html' : `compositions/${prefix}-${slug}.html`,
      assets: [],
      motionPresets: [
        isFirst ? 'camera.smooth_zoom' : isLast ? 'typography.counter_up' : 'diagram.flow_path'
      ],
      camera: styleProfile.camera.projection,
      narrativeRole: isFirst ? 'hook' : isLast ? 'conclusion' : 'mechanism',
      voiceover: '',
      notes: beat.notes,
      lockedSections: [],
      extra: {}
    }
  })
}
