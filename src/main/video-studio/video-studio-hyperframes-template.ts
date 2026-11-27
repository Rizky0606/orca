import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  videoStudioDimensionsForAspectRatio,
  type VideoStudioProject
} from '../../shared/video-studio/video-studio-project'
import type { VideoStudioCompositionState } from '../../shared/video-studio/video-studio-rpc-contract'
import { HYPERFRAMES_PINNED_VERSION } from './engines/hyperframes-doctor-parser'
import { inspectVideoStudioCompositionState } from './video-studio-composition-paths'
import { buildDefaultStyleProfile } from './video-studio-default-styles'
import { buildDocumentSeeds } from './video-studio-document-seeds'
import {
  buildIndexHtml,
  buildOpeningCompositionHtml,
  OPENING_COMPOSITION_ID
} from './video-studio-html-templates'

const ASSET_SUBDIRS = [
  'objects',
  'characters',
  'environments',
  'graphics',
  'models',
  'audio',
  'video'
] as const
const LEGACY_HYPERFRAMES_KEYS = ['durationSeconds', 'fps', 'height', 'id', 'width'] as const

function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  )
}

async function writeIfMissingOrOverwrite(
  filePath: string,
  content: string,
  overwrite: boolean
): Promise<void> {
  if (overwrite || !(await fileExists(filePath))) {
    await writeFile(filePath, content, 'utf8')
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Checks whether `raw` matches the exact legacy Stage 2 5-key `hyperframes.json` object. */
export function isExactLegacyHyperFramesConfig(raw: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  if (!isPlainRecord(parsed)) {
    return false
  }
  const keys = Object.keys(parsed).sort()
  if (
    keys.length !== LEGACY_HYPERFRAMES_KEYS.length ||
    keys.some((key, index) => key !== LEGACY_HYPERFRAMES_KEYS[index])
  ) {
    return false
  }
  return (
    typeof parsed.id === 'string' &&
    typeof parsed.width === 'number' &&
    Number.isFinite(parsed.width) &&
    typeof parsed.height === 'number' &&
    Number.isFinite(parsed.height) &&
    typeof parsed.fps === 'number' &&
    Number.isFinite(parsed.fps) &&
    typeof parsed.durationSeconds === 'number' &&
    Number.isFinite(parsed.durationSeconds)
  )
}

function buildHyperFramesConfig(): string {
  return `${JSON.stringify(
    {
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
    },
    null,
    2
  )}\n`
}

function buildMetaJson(project: VideoStudioProject): string {
  return `${JSON.stringify(
    {
      id: project.id,
      name: project.title,
      createdAt: new Date(project.createdAt).toISOString()
    },
    null,
    2
  )}\n`
}

function buildPackageJson(project: VideoStudioProject): string {
  const slug =
    project.id
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[._-]+|[._-]+$/g, '') || 'orca-video-project'
  const cli = `npx --yes hyperframes@${HYPERFRAMES_PINNED_VERSION}`
  return `${JSON.stringify(
    {
      name: slug,
      private: true,
      type: 'module',
      scripts: {
        dev: `${cli} preview`,
        check: `${cli} check`,
        render: `${cli} render`,
        publish: `${cli} publish`
      },
      engines: {
        hyperframes: HYPERFRAMES_PINNED_VERSION
      }
    },
    null,
    2
  )}\n`
}

function buildGitignore(): string {
  return '.orca/project-state.json\n.orca/tx.log\n.orca/.staging/\nrenders/\n'
}

function buildSchemaVersionJson(): string {
  return `${JSON.stringify(
    {
      schemaVersion: 2,
      engine: 'hyperframes',
      engineVersion: HYPERFRAMES_PINNED_VERSION,
      migratedAt: Date.now()
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

/**
 * Scaffolds a modular HyperFrames 0.9.94 project layout and performs non-destructive
 * Stage 1/2 upgrades (`overwrite: false` preserves `scenes/`, custom `index.html`, and
 * non-legacy `hyperframes.json`).
 */
export async function scaffoldHyperFramesComposition(
  projectDir: string,
  project: VideoStudioProject,
  options: { overwrite?: boolean; styleProfileId?: string } = {}
): Promise<VideoStudioCompositionState> {
  const overwrite = options.overwrite === true
  const styleProfile = buildDefaultStyleProfile(project, options.styleProfileId)

  await mkdir(projectDir, { recursive: true })
  await Promise.all([
    mkdir(join(projectDir, 'compositions', 'components'), { recursive: true }),
    mkdir(join(projectDir, 'styles'), { recursive: true }),
    mkdir(join(projectDir, 'references'), { recursive: true }),
    mkdir(join(projectDir, 'renders'), { recursive: true }),
    mkdir(join(projectDir, '.orca'), { recursive: true }),
    ...ASSET_SUBDIRS.map((sub) => mkdir(join(projectDir, 'assets', sub), { recursive: true }))
  ])

  await writeFile(join(projectDir, 'project.json'), buildProjectJson(project), 'utf8')

  const hyperframesPath = join(projectDir, 'hyperframes.json')
  const existingConfigRaw = await readFile(hyperframesPath, 'utf8').catch(() => null)
  if (
    overwrite ||
    existingConfigRaw === null ||
    isExactLegacyHyperFramesConfig(existingConfigRaw)
  ) {
    await writeFile(hyperframesPath, buildHyperFramesConfig(), 'utf8')
  }

  const indexPath = join(projectDir, 'index.html')
  const existingIndexHtml = await readFile(indexPath, 'utf8').catch(() => null)
  const shouldWriteIndex = overwrite || existingIndexHtml === null
  if (shouldWriteIndex) {
    await writeFile(indexPath, buildIndexHtml(project, styleProfile), 'utf8')
  }

  const shouldWriteOpening =
    shouldWriteIndex || existingIndexHtml.includes(`${OPENING_COMPOSITION_ID}.html`)
  if (shouldWriteOpening) {
    await writeIfMissingOrOverwrite(
      join(projectDir, 'compositions', `${OPENING_COMPOSITION_ID}.html`),
      buildOpeningCompositionHtml(project, styleProfile),
      overwrite
    )
  }

  const documentSeeds = buildDocumentSeeds(project, styleProfile)
  await Promise.all([
    writeIfMissingOrOverwrite(join(projectDir, 'meta.json'), buildMetaJson(project), overwrite),
    writeIfMissingOrOverwrite(
      join(projectDir, 'package.json'),
      buildPackageJson(project),
      overwrite
    ),
    writeIfMissingOrOverwrite(join(projectDir, '.gitignore'), buildGitignore(), overwrite),
    writeIfMissingOrOverwrite(
      join(projectDir, '.orca', 'schema-version.json'),
      buildSchemaVersionJson(),
      overwrite
    ),
    ...Object.entries(documentSeeds).map(([relPath, content]) =>
      writeIfMissingOrOverwrite(join(projectDir, relPath), content, overwrite)
    )
  ])

  return inspectVideoStudioCompositionState(projectDir)
}
