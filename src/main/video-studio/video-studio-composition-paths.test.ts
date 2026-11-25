import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  inspectVideoStudioCompositionState,
  resolveVideoStudioProjectDir,
  resolveVideoStudioProjectsRoot,
  resolveVideoStudioRenderOutputFile
} from './video-studio-composition-paths'
import { scaffoldHyperFramesComposition } from './video-studio-hyperframes-template'

const mockProject = {
  id: 'proj-abc',
  title: 'Test Video',
  prompt: 'A test',
  aspectRatio: '16:9' as const,
  durationSeconds: 30,
  workflowStage: 'production' as const,
  engine: 'hyperframes' as const,
  fps: 30,
  renders: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000
}

let userDataPath: string

beforeEach(async () => {
  userDataPath = await mkdtemp(join(tmpdir(), 'orca-paths-'))
})

afterEach(async () => {
  await rm(userDataPath, { recursive: true, force: true })
})

describe('resolveVideoStudioProjectDir', () => {
  it('resolves valid project ids', () => {
    const dir = resolveVideoStudioProjectDir(userDataPath, 'my-project')
    expect(dir).toContain('my-project')
    expect(dir.startsWith(resolveVideoStudioProjectsRoot(userDataPath))).toBe(true)
  })

  it('rejects ids with path traversal sequences', () => {
    for (const bad of ['../etc', '..', 'a/b', 'a\\b', '']) {
      expect(() => resolveVideoStudioProjectDir(userDataPath, bad)).toThrow(
        'video_studio_invalid_project_id'
      )
    }
  })
})

describe('resolveVideoStudioRenderOutputFile', () => {
  it('builds a path ending in <renderId>.mp4', () => {
    const path = resolveVideoStudioRenderOutputFile(userDataPath, 'proj-1', 'render-1')
    expect(path.endsWith(`${sep}render-1.mp4`) || path.endsWith('/render-1.mp4')).toBe(true)
  })

  it('rejects traversal in renderId', () => {
    expect(() => resolveVideoStudioRenderOutputFile(userDataPath, 'proj-1', '../bad')).toThrow(
      'video_studio_invalid_render_id'
    )
  })
})

describe('inspectVideoStudioCompositionState', () => {
  it('returns exists:false for a non-existent directory', async () => {
    const state = await inspectVideoStudioCompositionState(join(userDataPath, 'missing'))
    expect(state).toEqual({ exists: false, hasIndexHtml: false, hasConfigFile: false })
  })
})

describe('scaffoldHyperFramesComposition', () => {
  it('creates all expected files and directories', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    const result = await scaffoldHyperFramesComposition(projectDir, mockProject)
    expect(result.filesWritten).toBeGreaterThan(0)

    const indexHtml = await readFile(join(projectDir, 'index.html'), 'utf8')
    expect(indexHtml).toContain('data-duration="30s"')
    expect(indexHtml).toContain('Test Video')

    const config = JSON.parse(await readFile(join(projectDir, 'hyperframes.json'), 'utf8'))
    expect(config).toMatchObject({ id: 'proj-abc', width: 1920, height: 1080, fps: 30 })

    const state = await inspectVideoStudioCompositionState(projectDir)
    expect(state).toEqual({ exists: true, hasIndexHtml: true, hasConfigFile: true })
  })

  it('is idempotent — does not overwrite existing index.html on second call', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    const first = await scaffoldHyperFramesComposition(projectDir, mockProject)
    const second = await scaffoldHyperFramesComposition(projectDir, mockProject)
    // index.html written count decreases on second run
    expect(second.filesWritten).toBeLessThan(first.filesWritten)
  })

  it('HTML-escapes the project title to prevent XSS', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, 'xss-test')
    const xssProject = { ...mockProject, id: 'xss-test', title: '<script>alert(1)</script>' }
    await scaffoldHyperFramesComposition(projectDir, xssProject)
    const html = await readFile(join(projectDir, 'index.html'), 'utf8')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('9:16 scaffold uses 1080x1920 dimensions', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, 'portrait')
    const portraitProject = { ...mockProject, id: 'portrait', aspectRatio: '9:16' as const }
    await scaffoldHyperFramesComposition(projectDir, portraitProject)
    const config = JSON.parse(await readFile(join(projectDir, 'hyperframes.json'), 'utf8'))
    expect(config).toMatchObject({ width: 1080, height: 1920 })
  })
})
