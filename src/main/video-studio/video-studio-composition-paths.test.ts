import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as z from 'zod'
import { MasterAssetRecordSchema } from '../../shared/video-studio/video-studio-asset-contract'
import { VideoStudioResearchSourceSchema } from '../../shared/video-studio/video-studio-storyboard-contract'
import { StyleProfileSchema } from '../../shared/video-studio/video-studio-style-contract'
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

const AssetRegistryDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.array(MasterAssetRecordSchema)
})

const ResearchSourcesDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.array(VideoStudioResearchSourceSchema)
})

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
  it('scaffolds modular 0.9.94 layout, valid StyleProfile/AssetRegistry, STORYBOARD Frame 1, and escapes XSS in HTML & Markdown', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    const xssProject = {
      ...mockProject,
      title: '<script>alert(1)</script>',
      prompt: 'A & "B" <img src=x onerror=alert(1)>'
    }
    const state = await scaffoldHyperFramesComposition(projectDir, xssProject)
    expect(state.initialized).toBe(true)
    expect(state.entryExists).toBe(true)
    expect(state.files).toEqual([
      'BRIEF.md',
      'DESIGN.md',
      'MOTION.md',
      'SCRIPT.md',
      'STORYBOARD.md',
      'assets/asset-registry.json',
      'compositions/01-opening.html',
      'frame.md',
      'hyperframes.json',
      'index.html',
      'meta.json',
      'package.json',
      'project.json',
      'references/research-notes.md',
      'references/sources.json',
      'styles/style-profile.json'
    ])

    for (const sub of [
      'compositions',
      'compositions/components',
      'styles',
      'assets',
      'assets/objects',
      'assets/characters',
      'assets/environments',
      'assets/graphics',
      'assets/models',
      'assets/audio',
      'assets/video',
      'references',
      'renders',
      '.orca'
    ]) {
      expect((await stat(join(projectDir, sub))).isDirectory()).toBe(true)
    }

    expect(JSON.parse(await readFile(join(projectDir, 'hyperframes.json'), 'utf8'))).toEqual({
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
      paths: {
        blocks: 'compositions',
        components: 'compositions/components',
        assets: 'assets'
      },
      media: {
        autoProxy: true
      }
    })

    expect(JSON.parse(await readFile(join(projectDir, 'meta.json'), 'utf8'))).toEqual({
      id: xssProject.id,
      name: xssProject.title,
      createdAt: new Date(xssProject.createdAt).toISOString()
    })

    expect(JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'))).toMatchObject({
      private: true,
      type: 'module',
      scripts: {
        dev: 'npx --yes hyperframes@0.9.94 preview',
        check: 'npx --yes hyperframes@0.9.94 check',
        render: 'npx --yes hyperframes@0.9.94 render',
        publish: 'npx --yes hyperframes@0.9.94 publish'
      },
      engines: {
        hyperframes: '0.9.94'
      }
    })

    const gitignore = await readFile(join(projectDir, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.orca/project-state.json')
    expect(gitignore).toContain('.orca/tx.log')
    expect(gitignore).toContain('.orca/.staging/')
    expect(gitignore).toContain('renders/')

    const schemaVersion = JSON.parse(
      await readFile(join(projectDir, '.orca', 'schema-version.json'), 'utf8')
    )
    expect(schemaVersion).toMatchObject({
      schemaVersion: 2,
      engine: 'hyperframes',
      engineVersion: '0.9.94'
    })
    expect(typeof schemaVersion.migratedAt).toBe('number')

    const styleProfile = StyleProfileSchema.parse(
      JSON.parse(await readFile(join(projectDir, 'styles', 'style-profile.json'), 'utf8'))
    )
    expect(styleProfile.id).toBe('technical-explainer-01')
    expect(styleProfile.tier).toBe('snapshot')
    expect(styleProfile.visual.palette.background).toBe('#F7F3E9')
    expect(styleProfile.visual.palette.surface).toBe('#EFE7D6')
    expect(styleProfile.visual.palette.primaryText).toBe('#1E242B')
    expect(styleProfile.visual.palette.accentPrimary).toBe('#2563EB')
    expect(styleProfile.visual.palette.accentSecondary).toBe('#EA580C')
    expect(styleProfile.visual.palette.highlight).toBe('#FACC15')
    expect(styleProfile.visual.renderingStyle).toBe('2.5d-semi-realistic')
    expect(styleProfile.camera.projection).toBe('orthographic')
    expect(styleProfile.subtitle.mode).toBe('word-highlight')

    const assetRegistry = AssetRegistryDocumentSchema.parse(
      JSON.parse(await readFile(join(projectDir, 'assets', 'asset-registry.json'), 'utf8'))
    )
    expect(assetRegistry).toEqual({ schemaVersion: 1, assets: [] })

    const sourcesDoc = ResearchSourcesDocumentSchema.parse(
      JSON.parse(await readFile(join(projectDir, 'references', 'sources.json'), 'utf8'))
    )
    expect(sourcesDoc).toEqual({ schemaVersion: 1, sources: [] })

    const storyboard = await readFile(join(projectDir, 'STORYBOARD.md'), 'utf8')
    expect(storyboard).toContain('## Frame 1 — Opening')
    expect(storyboard).toContain('- scene_id:')
    expect(storyboard).toContain('- status: outline')
    expect(storyboard).toContain('- duration: 30s')
    expect(storyboard).toContain('- transition_in: cut')
    expect(storyboard).toContain('- engine: hyperframes')
    expect(storyboard).toContain('- src: compositions/01-opening.html')
    expect(storyboard).toContain('- motion_presets: camera.smooth_zoom')
    expect(storyboard).toContain('- camera: orthographic')
    expect(storyboard).toContain('- narrative_role: hook')
    expect(storyboard).not.toContain('### Scene')

    const html = await readFile(join(projectDir, 'index.html'), 'utf8')
    expect(html).toContain('data-composition-id="video-studio-main"')
    expect(html).toContain('data-composition-id="01-opening"')
    expect(html).toContain('data-composition-src="./compositions/01-opening.html"')
    expect(html).toContain('data-width="1920"')
    expect(html).toContain('data-height="1080"')
    expect(html).toContain('data-fps="30"')
    expect(html).toContain('data-duration="30"')
    expect(html).toContain('window.__timelines = window.__timelines || {}')
    expect(html).toContain("window.__timelines['video-studio-main']")
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')

    const openingHtml = await readFile(join(projectDir, 'compositions', '01-opening.html'), 'utf8')
    expect(openingHtml).toContain('<template id="tpl-01-opening">')
    expect(openingHtml).toContain('data-composition-id="01-opening"')
    expect(openingHtml).toContain("window.__timelines['01-opening']")
    expect(openingHtml).not.toContain('<script>alert(1)</script>')
    expect(openingHtml).not.toContain('<img src=x')
    expect(openingHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(openingHtml).toContain('A &amp; &quot;B&quot; &lt;img src=x onerror=alert(1)&gt;')

    for (const mdRel of [
      'BRIEF.md',
      'frame.md',
      'DESIGN.md',
      'MOTION.md',
      'STORYBOARD.md',
      'SCRIPT.md',
      'references/research-notes.md'
    ]) {
      const mdContent = await readFile(join(projectDir, mdRel), 'utf8')
      expect(mdContent).not.toContain('<script>alert(1)</script>')
      expect(mdContent).not.toContain('<img src=x')
    }
  })

  it('performs Stage 2 non-destructive upgrade preserving scenes/, custom index.html, and custom hyperframes.json', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    await mkdir(join(projectDir, 'scenes'), { recursive: true })
    await writeFile(join(projectDir, 'scenes', '01-legacy.html'), '<div>Legacy Scene</div>', 'utf8')
    await writeFile(join(projectDir, 'index.html'), '<!-- custom user edit -->', 'utf8')
    await writeFile(
      join(projectDir, 'hyperframes.json'),
      JSON.stringify(
        {
          id: 'video-studio-main',
          width: 1920,
          height: 1080,
          fps: 30,
          durationSeconds: 30
        },
        null,
        2
      ),
      'utf8'
    )

    const upgraded = await scaffoldHyperFramesComposition(projectDir, {
      ...mockProject,
      title: 'Updated Title'
    })
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe('<!-- custom user edit -->')
    expect(await readFile(join(projectDir, 'scenes', '01-legacy.html'), 'utf8')).toBe(
      '<div>Legacy Scene</div>'
    )
    expect(upgraded.files).toContain('scenes/01-legacy.html')
    expect(upgraded.files).toContain('STORYBOARD.md')
    expect(upgraded.files).toContain('styles/style-profile.json')
    expect(upgraded.files).toContain('assets/asset-registry.json')
    expect(JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'))).toMatchObject({
      title: 'Updated Title'
    })
    expect(JSON.parse(await readFile(join(projectDir, 'hyperframes.json'), 'utf8'))).toMatchObject({
      paths: {
        blocks: 'compositions',
        components: 'compositions/components',
        assets: 'assets'
      }
    })

    // Custom hyperframes.json (non-exact-5-key) must NOT be overwritten when overwrite is false
    const customConfig = {
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      paths: { blocks: 'custom-blocks', components: 'custom-components', assets: 'assets' },
      customFlag: true
    }
    await writeFile(join(projectDir, 'hyperframes.json'), JSON.stringify(customConfig), 'utf8')
    await scaffoldHyperFramesComposition(projectDir, mockProject, { overwrite: false })
    expect(JSON.parse(await readFile(join(projectDir, 'hyperframes.json'), 'utf8'))).toEqual(
      customConfig
    )

    // Explicit overwrite: true replaces index.html and hyperframes.json
    await scaffoldHyperFramesComposition(
      projectDir,
      { ...mockProject, title: 'Overwritten Title' },
      { overwrite: true }
    )
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toContain('Overwritten Title')
    expect(await readFile(join(projectDir, 'scenes', '01-legacy.html'), 'utf8')).toBe(
      '<div>Legacy Scene</div>'
    )
  })

  it('scans both compositions/**/*.html and scenes/**/*.html while skipping dot-dirs and symlink escapes', async () => {
    const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
    const outsideDir = join(userDataPath, 'outside-secret')
    await mkdir(outsideDir, { recursive: true })
    await writeFile(join(outsideDir, 'secret.html'), '<div>secret</div>', 'utf8')

    await mkdir(join(projectDir, 'compositions', 'nested'), { recursive: true })
    await mkdir(join(projectDir, 'scenes', 'act1'), { recursive: true })
    await mkdir(join(projectDir, '.orca', '.staging'), { recursive: true })
    await writeFile(join(projectDir, 'index.html'), '<div />', 'utf8')
    await writeFile(join(projectDir, 'hyperframes.json'), '{}', 'utf8')
    await writeFile(join(projectDir, 'compositions', 'nested', 'intro.html'), '<div />', 'utf8')
    await writeFile(join(projectDir, 'scenes', 'act1', 'legacy.html'), '<div />', 'utf8')
    await writeFile(join(projectDir, '.orca', 'schema-version.json'), '{}', 'utf8')
    await writeFile(join(projectDir, '.orca', '.staging', 'tmp.html'), '<div />', 'utf8')
    await symlink(outsideDir, join(projectDir, 'escaped-link'), 'junction').catch(() => {})

    const state = await inspectVideoStudioCompositionState(projectDir)
    expect(state.files).toEqual([
      'compositions/nested/intro.html',
      'hyperframes.json',
      'index.html',
      'scenes/act1/legacy.html'
    ])
    expect(state.files.some((f) => f.startsWith('.orca/'))).toBe(false)
    expect(state.files.some((f) => f.includes('secret.html'))).toBe(false)
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
