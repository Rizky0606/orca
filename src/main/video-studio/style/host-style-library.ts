import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as z from 'zod'
import {
  StyleIdSchema,
  StyleProfileSchema,
  type StyleProfile
} from '../../../shared/video-studio/video-studio-style-contract'
import { resolveVideoStudioProjectDir } from '../video-studio-composition-paths'
import {
  canonicalRealpath,
  isWithinCanonicalRoot,
  resolveContainedPath
} from '../video-studio-path-containment'
import {
  readFileWithSha256,
  sha256Bytes,
  VIDEO_STUDIO_FILE_CONFLICT_ERROR,
  writeDurableContainedFile
} from '../video-studio-tx-journal'
import { syncDesignMarkdown, syncFrameMarkdown, syncMotionMarkdown } from './style-markdown-sync'
import { assertSafeStyleProfileTokens } from './style-token-validation'

const LibraryMetaSchema = z.object({
  schemaVersion: z.literal(1),
  styleId: StyleIdSchema,
  latestVersion: z.number().int().positive(),
  versions: z.array(z.number().int().positive()).min(1)
})

export type LibraryStyleBundle = {
  profile: StyleProfile
  revision: string
  latestVersion: number
  frameMarkdown: string | null
  designMarkdown: string | null
  motionMarkdown: string | null
}

async function readOptionalText(absPath: string): Promise<string | null> {
  return readFile(absPath, 'utf8').catch(() => null)
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function readLibraryStyleBundle(
  stylesDir: string,
  styleId: string
): Promise<LibraryStyleBundle | null> {
  const safeId = StyleIdSchema.safeParse(styleId)
  if (!safeId.success) {
    return null
  }
  const styleDir = await resolveContainedPath(stylesDir, safeId.data).catch(() => null)
  if (!styleDir) {
    return null
  }
  const dirStats = await stat(styleDir).catch(() => null)
  if (!dirStats?.isDirectory()) {
    return null
  }

  let latestVersion = 1
  let sourceDir = styleDir
  const metaRaw = await readOptionalText(join(styleDir, 'library-meta.json'))
  if (metaRaw) {
    const parsedMeta = LibraryMetaSchema.safeParse(safeJsonParse(metaRaw))
    if (parsedMeta.success) {
      latestVersion = parsedMeta.data.latestVersion
      const versionDir = await resolveContainedPath(styleDir, `v${latestVersion}`).catch(() => null)
      if (versionDir && (await stat(versionDir).catch(() => null))?.isDirectory()) {
        sourceDir = versionDir
      }
    }
  }

  const profileDisk = await readFileWithSha256(join(sourceDir, 'style-profile.json'))
  if (!profileDisk.exists || !profileDisk.bytes || !profileDisk.sha256) {
    return null
  }
  const parsedProfile = StyleProfileSchema.safeParse(
    safeJsonParse(profileDisk.bytes.toString('utf8'))
  )
  if (!parsedProfile.success) {
    return null
  }
  const profile: StyleProfile = { ...parsedProfile.data, tier: 'library' }
  return {
    profile,
    revision: profileDisk.sha256,
    latestVersion: Math.max(latestVersion, profile.version),
    frameMarkdown: await readOptionalText(join(sourceDir, 'frame.md')),
    designMarkdown: await readOptionalText(join(sourceDir, 'DESIGN.md')),
    motionMarkdown: await readOptionalText(join(sourceDir, 'MOTION.md'))
  }
}

export async function listLibraryStyleProfiles(stylesDir: string): Promise<StyleProfile[]> {
  const dirStats = await stat(stylesDir).catch(() => null)
  if (!dirStats?.isDirectory()) {
    return []
  }
  const rootReal = await canonicalRealpath(stylesDir).catch(() => stylesDir)
  const entries = await readdir(rootReal, { withFileTypes: true }).catch(() => [])
  const out: StyleProfile[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }
    const candidate = join(rootReal, entry.name)
    const candidateReal = await canonicalRealpath(candidate).catch(() => null)
    if (!candidateReal || !isWithinCanonicalRoot(rootReal, candidateReal, false)) {
      continue
    }
    const bundle = await readLibraryStyleBundle(rootReal, entry.name).catch(() => null)
    if (bundle) {
      out.push(bundle.profile)
    }
  }

  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export async function saveLibraryStyleBundle(
  stylesDir: string,
  params: {
    profile: StyleProfile
    expectedRevision?: string
    designMarkdown?: string
    frameMarkdown?: string
    motionMarkdown?: string
  }
): Promise<{ profile: StyleProfile; revision: string }> {
  const validated = StyleProfileSchema.parse(params.profile)
  assertSafeStyleProfileTokens(validated)

  await mkdir(stylesDir, { recursive: true, mode: 0o700 })
  const styleDir = await resolveContainedPath(stylesDir, validated.id)
  const existing = await readLibraryStyleBundle(stylesDir, validated.id)

  if (params.expectedRevision !== undefined) {
    if (!existing || existing.revision !== params.expectedRevision) {
      throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
    }
  }

  const nextVersion = existing ? existing.latestVersion + 1 : Math.max(1, validated.version)
  const existingMetaRaw = await readOptionalText(join(styleDir, 'library-meta.json'))
  const existingMeta = existingMetaRaw
    ? LibraryMetaSchema.safeParse(safeJsonParse(existingMetaRaw))
    : null
  const versions = existingMeta?.success
    ? [...new Set([...existingMeta.data.versions, nextVersion])].sort((a, b) => a - b)
    : existing
      ? [existing.latestVersion, nextVersion]
      : [nextVersion]

  const { snapshotRevision: _dropSnapshotRev, ...withoutSnapshot } = validated
  const savedProfile = StyleProfileSchema.parse({
    ...withoutSnapshot,
    version: nextVersion,
    tier: 'library'
  })

  const frameMarkdown = syncFrameMarkdown(
    params.frameMarkdown ?? existing?.frameMarkdown ?? null,
    savedProfile
  )
  const designMarkdown = syncDesignMarkdown(
    params.designMarkdown ?? existing?.designMarkdown ?? null,
    savedProfile
  )
  const motionMarkdown = syncMotionMarkdown(
    params.motionMarkdown ?? existing?.motionMarkdown ?? null,
    savedProfile
  )
  const profileJson = `${JSON.stringify(savedProfile, null, 2)}\n`

  const versionDir = await resolveContainedPath(styleDir, `v${nextVersion}`)
  if ((await stat(versionDir).catch(() => null)) !== null) {
    throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
  }

  const files: readonly [string, string][] = [
    ['style-profile.json', profileJson],
    ['frame.md', frameMarkdown],
    ['DESIGN.md', designMarkdown],
    ['MOTION.md', motionMarkdown]
  ]
  for (const [rel, content] of files) {
    await writeDurableContainedFile(await resolveContainedPath(versionDir, rel), content)
    await writeDurableContainedFile(await resolveContainedPath(styleDir, rel), content)
  }

  const metaJson = `${JSON.stringify(
    {
      schemaVersion: 1,
      styleId: savedProfile.id,
      latestVersion: nextVersion,
      versions
    },
    null,
    2
  )}\n`
  await writeDurableContainedFile(
    await resolveContainedPath(styleDir, 'library-meta.json'),
    metaJson
  )

  return { profile: savedProfile, revision: sha256Bytes(profileJson) }
}

export async function deleteLibraryStyleBundle(
  stylesDir: string,
  styleId: string,
  expectedRevision?: string
): Promise<void> {
  const safeId = StyleIdSchema.parse(styleId)
  const existing = await readLibraryStyleBundle(stylesDir, safeId)
  if (!existing) {
    throw new Error('video_studio_style_not_found')
  }
  if (expectedRevision !== undefined && expectedRevision !== existing.revision) {
    throw new Error(VIDEO_STUDIO_FILE_CONFLICT_ERROR)
  }
  const styleDir = await resolveContainedPath(stylesDir, safeId)
  await rm(styleDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
}

export function resolveSafeProjectDir(profileDir: string, projectId: string): string {
  return resolveVideoStudioProjectDir(profileDir, projectId)
}
