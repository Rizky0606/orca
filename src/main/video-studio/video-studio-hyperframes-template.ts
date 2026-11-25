import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  videoStudioDimensionsForAspectRatio,
  type VideoStudioProject
} from '../../shared/video-studio/video-studio-project'
import type { VideoStudioCompositionState } from '../../shared/video-studio/video-studio-rpc-contract'
import { inspectVideoStudioCompositionState } from './video-studio-composition-paths'

const COMPOSITION_ID = 'video-studio-main'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  )
}

function buildHyperFramesConfig(project: VideoStudioProject): string {
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  return `${JSON.stringify(
    {
      id: COMPOSITION_ID,
      width,
      height,
      fps: project.fps,
      durationSeconds: project.durationSeconds
    },
    null,
    2
  )}\n`
}

function buildProjectJson(project: VideoStudioProject): string {
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  return `${JSON.stringify(
    {
      id: project.id,
      title: project.title,
      prompt: project.prompt,
      aspectRatio: project.aspectRatio,
      width,
      height,
      durationSeconds: project.durationSeconds,
      fps: project.fps,
      engine: project.engine
    },
    null,
    2
  )}\n`
}

function buildIndexHtml(project: VideoStudioProject): string {
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  const safeTitle = escapeHtml(project.title)
  const safePrompt = escapeHtml(
    project.prompt.trim() || 'Add your scenes inside scenes/ and index.html.'
  )
  const duration = project.durationSeconds
  const exitAt = Math.max(1.2, duration - 0.8)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${safeTitle}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        box-sizing: border-box;
      }
      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: #0b0f14;
        color: #f8fafc;
        font-family: Inter, system-ui, sans-serif;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      .clip {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 8%;
        gap: 24px;
        text-align: center;
      }
      .kicker {
        margin: 0;
        font-size: 24px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .headline {
        margin: 0;
        max-width: 18ch;
        font-size: clamp(48px, 6vw, 96px);
        line-height: 1.08;
        font-weight: 700;
        color: #f8fafc;
      }
      .summary {
        margin: 0;
        max-width: 52ch;
        font-size: clamp(22px, 2.2vw, 32px);
        line-height: 1.45;
        color: #cbd5e1;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="${COMPOSITION_ID}"
      data-start="0"
      data-width="${width}"
      data-height="${height}"
      data-fps="${project.fps}"
      data-duration="${duration}"
    >
      <section id="scene-opening" class="clip" data-start="0" data-duration="${duration}">
        <p id="scene-kicker" class="kicker">Orca Video Studio</p>
        <h1 id="scene-title" class="headline">${safeTitle}</h1>
        <p id="scene-prompt" class="summary">${safePrompt}</p>
      </section>
    </div>
    <script>
      if (typeof gsap !== 'undefined') {
        const tl = gsap.timeline({ paused: true })
        tl.fromTo('#scene-kicker', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.1)
        tl.fromTo('#scene-title', { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out' }, 0.25)
        tl.fromTo('#scene-prompt', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power2.out' }, 0.5)
        tl.to('#scene-title', { y: -6, duration: ${Math.max(0.5, exitAt - 1.2).toFixed(2)}, ease: 'none' }, 1.2)
        window.__timelines = window.__timelines || {}
        window.__timelines['${COMPOSITION_ID}'] = tl
      }
    </script>
  </body>
</html>
`
}

/**
 * Scaffolds a valid HyperFrames composition directory (`project.json`, `hyperframes.json`,
 * `index.html`, `scenes/`, `assets/`, `renders/`). Preserves existing `index.html` edits
 * unless `options.overwrite` is explicitly true.
 */
export async function scaffoldHyperFramesComposition(
  projectDir: string,
  project: VideoStudioProject,
  options: { overwrite?: boolean } = {}
): Promise<VideoStudioCompositionState> {
  await mkdir(projectDir, { recursive: true })
  await Promise.all([
    mkdir(join(projectDir, 'scenes'), { recursive: true }),
    mkdir(join(projectDir, 'assets'), { recursive: true }),
    mkdir(join(projectDir, 'renders'), { recursive: true })
  ])

  await Promise.all([
    writeFile(join(projectDir, 'project.json'), buildProjectJson(project), 'utf8'),
    writeFile(join(projectDir, 'hyperframes.json'), buildHyperFramesConfig(project), 'utf8')
  ])

  const indexPath = join(projectDir, 'index.html')
  if (options.overwrite || !(await fileExists(indexPath))) {
    await writeFile(indexPath, buildIndexHtml(project), 'utf8')
  }

  return inspectVideoStudioCompositionState(projectDir)
}
