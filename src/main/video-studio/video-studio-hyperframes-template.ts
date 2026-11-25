import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { VideoStudioProject } from '../../shared/video-studio/video-studio-project'
import { videoStudioDimensionsForAspectRatio } from '../../shared/video-studio/video-studio-project'

const GITKEEP = ''

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHyperFramesConfig(project: VideoStudioProject): string {
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  return JSON.stringify(
    {
      id: project.id,
      width,
      height,
      fps: project.fps,
      durationSeconds: project.durationSeconds
    },
    null,
    2
  )
}

function buildIndexHtml(project: VideoStudioProject): string {
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  const safeTitle = escapeHtml(project.title)
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, sans-serif;
        color: #fff;
      }
      h1 { font-size: clamp(2rem, 5vw, 5rem); text-align: center; padding: 2rem; }
    </style>
  </head>
  <body data-duration="${project.durationSeconds}s" data-fps="${project.fps}">
    <!-- Scene 01 -->
    <div
      class="clip"
      data-in="0s"
      data-out="${project.durationSeconds}s"
      style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"
    >
      <h1>${safeTitle}</h1>
    </div>
  </body>
</html>
`
}

/** Result of a scaffold call. */
export type ScaffoldResult = {
  projectDir: string
  filesWritten: number
}

/**
 * Writes the HyperFrames project skeleton to disk.
 * - `index.html` is only written when it does not already exist (idempotent).
 * - `hyperframes.json` is always (re-)written so metadata stays in sync.
 * - `scenes/`, `assets/`, `renders/` are created silently if missing.
 *
 * Returns the number of files actually written (0 when already complete).
 */
export async function scaffoldHyperFramesComposition(
  projectDir: string,
  project: VideoStudioProject
): Promise<ScaffoldResult> {
  await mkdir(projectDir, { recursive: true })
  await Promise.all([
    mkdir(join(projectDir, 'scenes'), { recursive: true }),
    mkdir(join(projectDir, 'assets'), { recursive: true }),
    mkdir(join(projectDir, 'renders'), { recursive: true })
  ])

  let filesWritten = 0

  // Always write hyperframes.json (keeps fps/dimensions in sync)
  await writeFile(join(projectDir, 'hyperframes.json'), buildHyperFramesConfig(project), 'utf8')
  filesWritten++

  // Write project.json (simple metadata snapshot for tooling)
  const projectJsonPath = join(projectDir, 'project.json')
  const projectMeta = {
    id: project.id,
    title: project.title,
    aspectRatio: project.aspectRatio,
    durationSeconds: project.durationSeconds,
    fps: project.fps,
    engine: project.engine
  }
  await writeFile(projectJsonPath, JSON.stringify(projectMeta, null, 2), 'utf8')
  filesWritten++

  // Only scaffold index.html if not yet present
  const indexPath = join(projectDir, 'index.html')
  const hasIndex = await readFile(indexPath, 'utf8')
    .then(() => true)
    .catch(() => false)
  if (!hasIndex) {
    await writeFile(indexPath, buildIndexHtml(project), 'utf8')
    filesWritten++
  }

  // .gitkeep files so empty dirs are committed if the user pushes to git
  for (const sub of ['scenes', 'assets', 'renders']) {
    const keepPath = join(projectDir, sub, '.gitkeep')
    const hasKeep = await readFile(keepPath, 'utf8')
      .then(() => true)
      .catch(() => false)
    if (!hasKeep) {
      await writeFile(keepPath, GITKEEP, 'utf8')
    }
  }

  return { projectDir, filesWritten }
}
