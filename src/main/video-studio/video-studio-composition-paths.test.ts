import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  inspectVideoStudioCompositionState,
  resolveHostVideoAssetsDir,
  resolveHostVideoSecurityDir,
  resolveHostVideoStylesDir,
  resolveVideoStudioProjectDir,
  resolveVideoStudioRenderOutputFile
} from './video-studio-composition-paths'
import { resolveContainedPath } from './video-studio-path-containment'
import { scaffoldHyperFramesComposition } from './video-studio-hyperframes-template'

const mockProject = {
  id: 'proj-abc',
  title: 'Test Video',
  prompt: 'Follow a flock.',
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

describe('video studio composition paths containment', () => {
  it('rejects project ids with traversal segments or separators', () => {
    for (const bad of ['../escape', 'foo/bar', 'foo\\bar', '.', '..', '']) {
      expect(() => resolveVideoStudioProjectDir(userDataPath, bad)).toThrow(
        'video_studio_invalid_project_id'
      )
    }
  })

  it('rejects render file names with traversal or nested paths', () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    for (const bad of ['../secret.mp4', 'sub/out.mp4', '..', '']) {
      expect(() => resolveVideoStudioRenderOutputFile(projectDir, bad)).toThrow(
        'video_studio_invalid_render_file'
      )
    }
    expect(resolveVideoStudioRenderOutputFile(projectDir, 'render-1.mp4')).toContain('render-1.mp4')
  })

  it('resolves host security, styles, and assets directories under profileDir/video-studio', () => {
    expect(resolveHostVideoSecurityDir(userDataPath)).toBe(
      join(userDataPath, 'video-studio', 'security')
    )
    expect(resolveHostVideoStylesDir(userDataPath)).toBe(
      join(userDataPath, 'video-studio', 'styles')
    )
    expect(resolveHostVideoAssetsDir(userDataPath)).toBe(
      join(userDataPath, 'video-studio', 'assets')
    )
  })

  it('rejects traversal, NUL, drive/UNC prefixes, and mixed separators in resolveContainedPath', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    await mkdir(projectDir, { recursive: true })

    for (const bad of [
      '',
      '../escape.html',
      'compositions/../../escape.html',
      'compositions/bad\0.html',
      'C:\\Windows\\System32\\cmd.exe',
      'C:relative.txt',
      '\\\\server\\share\\file.txt',
      '//server/share/file.txt',
      '/etc/passwd',
      'compositions\\..\\escape.html',
      'compositions/sub\\file.html'
    ]) {
      await expect(resolveContainedPath(projectDir, bad)).rejects.toThrow(
        'video_studio_invalid_path'
      )
    }

    const valid = await resolveContainedPath(projectDir, 'compositions/01-opening.html')
    expect(valid).toContain('01-opening.html')
  })
})

describe('scaffoldHyperFramesComposition', () => {
  it('creates HyperFrames composition structure and escapes HTML', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    const xssProject = {
      ...mockProject,
      title: '<script>alert(1)</script>',
      prompt: 'A & "B"'
    }
    const state = await scaffoldHyperFramesComposition(projectDir, xssProject)
    expect(state.initialized).toBe(true)
    expect(state.entryExists).toBe(true)
    expect(state.files).toEqual(['hyperframes.json', 'index.html', 'project.json'])

    const html = await readFile(join(projectDir, 'index.html'), 'utf8')
    expect(html).toContain('data-composition-id="video-studio-main"')
    expect(html).toContain('data-width="1920"')
    expect(html).toContain('data-height="1080"')
    expect(html).toContain('data-fps="30"')
    expect(html).toContain('data-duration="30"')
    expect(html).toContain("window.__timelines['video-studio-main']")
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('A &amp; &quot;B&quot;')

    for (const sub of ['scenes', 'assets', 'renders']) {
      expect((await stat(join(projectDir, sub))).isDirectory()).toBe(true)
    }
  })

  it('preserves user index.html edits unless overwrite is true', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    await scaffoldHyperFramesComposition(projectDir, mockProject)
    await writeFile(join(projectDir, 'index.html'), '<!-- custom user edit -->', 'utf8')

    await scaffoldHyperFramesComposition(projectDir, { ...mockProject, title: 'Updated Title' })
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe('<!-- custom user edit -->')
    expect(JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'))).toMatchObject({
      title: 'Updated Title'
    })

    await scaffoldHyperFramesComposition(
      projectDir,
      { ...mockProject, title: 'Overwritten Title' },
      { overwrite: true }
    )
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toContain('Overwritten Title')
  })

  it('reports empty state when composition folder does not exist yet', async () => {
    const missing = join(userDataPath, 'missing')
    await mkdir(userDataPath, { recursive: true })
    expect(await inspectVideoStudioCompositionState(missing)).toEqual({
      initialized: false,
      entryExists: false,
      files: [],
      previewActive: false
    })
  })
})
