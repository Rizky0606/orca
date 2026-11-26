import type { StoryboardDocument } from '../../../shared/video-studio/video-studio-storyboard-contract'
import { applyLineEnding, formatYamlFrontmatter } from './yaml-frontmatter'

function formatExtraScalar(value: unknown): string {
  if (typeof value === 'string') {
    return /[:#"'[\]{}]/.test(value) ? JSON.stringify(value) : value
  }
  return JSON.stringify(value)
}

/** Formats a `StoryboardDocument` back to HyperFrames-compatible Markdown while preserving metadata & EOL. */
export function formatStoryboardMarkdown(
  doc: StoryboardDocument,
  options: { eol?: '\n' | '\r\n' } = {}
): string {
  const eol = options.eol ?? '\n'
  const fmObj: Record<string, unknown> = {}
  const fm = doc.frontmatter
  if (fm.format !== undefined) {
    fmObj.format = fm.format
  }
  if (fm.duration !== undefined) {
    fmObj.duration = fm.duration
  }
  if (fm.message !== undefined) {
    fmObj.message = fm.message
  }
  if (fm.arc !== undefined) {
    fmObj.arc = fm.arc
  }
  if (fm.audience !== undefined) {
    fmObj.audience = fm.audience
  }
  if (fm.styleProfile !== undefined) {
    fmObj.style_profile = fm.styleProfile
  }
  if (fm.extra) {
    Object.assign(fmObj, fm.extra)
  }

  const sections: string[] = []
  const fmText = formatYamlFrontmatter(fmObj)
  if (fmText) {
    sections.push(fmText.trimEnd())
  }

  doc.frames.forEach((frame, index) => {
    const lines = [
      `## Frame ${index + 1} — ${frame.title}`,
      '',
      `- scene_id: ${frame.sceneId}`,
      `- status: ${frame.status}`,
      `- duration: ${frame.duration}`
    ]
    if (frame.transitionIn !== undefined) {
      lines.push(`- transition_in: ${frame.transitionIn}`)
    }
    lines.push(`- engine: ${frame.engine}`)
    if (frame.src !== undefined) {
      lines.push(`- src: ${frame.src}`)
    }
    lines.push(`- assets:${frame.assets.length > 0 ? ` ${frame.assets.join(', ')}` : ''}`)
    lines.push(
      `- motion_presets:${frame.motionPresets.length > 0 ? ` ${frame.motionPresets.join(', ')}` : ''}`
    )
    if (frame.camera !== undefined) {
      lines.push(`- camera: ${frame.camera}`)
    }
    if (frame.narrativeRole !== undefined) {
      lines.push(`- narrative_role: ${frame.narrativeRole}`)
    }
    if (frame.voiceover !== undefined) {
      lines.push(`- voiceover: ${JSON.stringify(frame.voiceover)}`)
    }
    if (frame.lockedSections.length > 0) {
      lines.push(`- locked_sections: ${frame.lockedSections.join(', ')}`)
    }
    for (const [key, value] of Object.entries(frame.extra)) {
      lines.push(`- ${key}: ${formatExtraScalar(value)}`)
    }
    if (frame.notes?.trim()) {
      lines.push('', frame.notes.trim())
    }
    sections.push(lines.join('\n'))
  })

  for (const locked of doc.lockedSections) {
    sections.push(`## ${locked.title}\n\n${locked.body.trimEnd()}`)
  }

  return applyLineEnding(`${sections.join('\n\n')}\n`, eol)
}
