import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { computeProjectInputFingerprint } from '../../../../video-studio/engines/project-input-fingerprint'
import { openVideoStudioCatalog } from '../../../../video-studio/video-studio-catalog'
import {
  resolveVideoStudioProjectDir,
  resolveVideoStudioRenderOutputFile
} from '../../../../video-studio/video-studio-composition-paths'
import {
  disposeAllVideoStudioJobManagers,
  openVideoStudioJobManager
} from '../../../../video-studio/video-studio-job-registry'
import { RpcDispatcher } from '../../dispatcher'
import { mobileRpcSshRefusal } from '../../server/runtime-rpc-mobile-method-routing'
import { VIDEO_STUDIO_MOBILE_METHOD_SET } from '../../server/runtime-rpc-mobile-video-studio-methods'
import { createSubscriptionRegistryDouble } from '../../testing/subscription-registry-test-double'
import { VIDEO_STUDIO_METHODS } from './video-studio-methods'

const OkEnvelopeSchema = z.object({ ok: z.literal(true), result: z.unknown() })

function expectOkResult<S extends z.ZodTypeAny>(response: unknown, schema: S): z.infer<S> {
  return schema.parse(OkEnvelopeSchema.parse(response).result)
}

const directories: string[] = []

async function host() {
  const path = await mkdtemp(join(tmpdir(), 'orca-video-studio-rpc-'))
  directories.push(path)
  await openVideoStudioJobManager(path, {
    watcherDebounceMs: 30,
    engineDeps: {
      hydrateShellPath: async () => {},
      resolveCommand: async () => null,
      allocateLoopbackPort: async () => 43210,
      runProcess: async () => ({ code: 0, signal: null, stdout: '', stderr: '', timedOut: false }),
      runProcessStreaming: async () => ({
        code: 0,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false
      }),
      spawnPreviewStream: () => ({
        stop: async () => {},
        exited: Promise.resolve(0)
      }),
      statFile: async () => null,
      removeFile: async () => {}
    }
  })
  const groups: {
    id: string
    name: string
    parentPath?: string | null
    createdFrom: string
    tabOrder: number
  }[] = []
  const workspaces: {
    id: string
    projectGroupId: string
    name: string
    folderPath: string
  }[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods need only the dispatch identity, group/folder state, subscription cleanup, and profile directory.
  const runtime = {
    ...createSubscriptionRegistryDouble(),
    getRuntimeId: () => 'video-studio-test-host',
    requireStore: () => ({
      getProfileStorageDirectory: () => path,
      getProjectGroups: () => groups,
      getFolderWorkspaces: () => workspaces
    }),
    listVisibleProjectGroups: () => groups,
    listVisibleFolderWorkspaces: () => workspaces,
    createProjectGroup: async (input: {
      name: string
      parentPath?: string | null
      createdFrom?: string
    }) => {
      const group = {
        id: `pg-${groups.length + 1}`,
        name: input.name,
        parentPath: input.parentPath ?? null,
        createdFrom: input.createdFrom ?? 'manual',
        tabOrder: groups.length
      }
      groups.push(group)
      return group
    },
    createFolderWorkspace: async (input: {
      projectGroupId: string
      name?: string
      folderPath?: string | null
    }) => {
      const ws = {
        id: `fw-${workspaces.length + 1}`,
        projectGroupId: input.projectGroupId,
        name: input.name ?? 'Workspace',
        folderPath: input.folderPath ?? ''
      }
      workspaces.push(ws)
      return { folderWorkspace: ws }
    }
  } as unknown as ConstructorParameters<typeof RpcDispatcher>[0]['runtime']
  const dispatcher = new RpcDispatcher({ runtime, methods: VIDEO_STUDIO_METHODS })
  return {
    path,
    file: join(path, 'video-studio-projects.json'),
    call: (method: string, params?: unknown) =>
      dispatcher.dispatch(
        { id: 'video', authToken: 'test', method, params },
        { callerScope: { kind: 'mobile', delegated: true } }
      ),
    callOwner: (method: string, params?: unknown) =>
      dispatcher.dispatch({ id: 'video', authToken: 'test', method, params }),
    subscribe: (method: string, params: unknown, onResult: (res: unknown) => void) => {
      const controller = new AbortController()
      void dispatcher.dispatchStreamingObjects(
        { id: 'sub-1', authToken: 'test', method, params },
        (response) => {
          if (response.ok) {
            onResult(response.result)
          }
        },
        { callerScope: { kind: 'mobile', delegated: true }, signal: controller.signal }
      )
      return () => controller.abort()
    },
    runtime
  }
}

afterEach(async () => {
  await disposeAllVideoStudioJobManagers()
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const draft = {
  title: '  Flight paths  ',
  prompt: 'Follow a flock',
  aspectRatio: '16:9',
  durationSeconds: 30,
  workflowStage: 'research'
}

it('isolates durable project mutations between authenticated runtime hosts', async () => {
  const first = await host()
  const second = await host()
  const created = await first.call('videoStudio.createProject', draft)
  expect(created).toMatchObject({
    ok: true,
    result: {
      projectId: expect.any(String),
      projects: [{ title: 'Flight paths', engine: 'hyperframes', fps: 30, renders: [] }],
      invalidRecords: 0
    }
  })
  const [{ id, createdAt }] = JSON.parse(await readFile(first.file, 'utf8'))
  expect(await second.call('videoStudio.listProjects')).toMatchObject({
    ok: true,
    result: { projects: [], invalidRecords: 0 }
  })
  expect(await second.call('videoStudio.deleteProject', { id })).toMatchObject({
    ok: false,
    error: { code: 'video_studio_project_not_found' }
  })
  expect(
    await first.call('videoStudio.updateProject', { id, changes: { durationSeconds: 4 } })
  ).toMatchObject({
    ok: false,
    error: { code: 'invalid_argument' }
  })
  expect(
    await first.call('videoStudio.updateProject', { id, changes: { workflowStage: 'script' } })
  ).toMatchObject({
    ok: true,
    result: { projectId: id, projects: [{ id, createdAt, workflowStage: 'script' }] }
  })
  expect(await first.call('videoStudio.deleteProject', { id })).toMatchObject({
    ok: true,
    result: { projects: [], invalidRecords: 0 }
  })
})

it('reports unreadable catalog without sending parser details or replacing bytes', async () => {
  const runtime = await host()
  await writeFile(runtime.file, 'private invalid bytes')
  const response = await runtime.call('videoStudio.createProject', draft)
  expect(response.ok ? response : response.error).toEqual({
    code: 'video_studio_catalog_unreadable',
    message: 'video_studio_catalog_unreadable'
  })
  expect(await readFile(runtime.file, 'utf8')).toBe('private invalid bytes')
})

it('scaffolds composition and opens FolderWorkspace idempotently without exposing paths', async () => {
  const runtime = await host()
  const created = await runtime.call('videoStudio.createProject', draft)
  const { projectId } = expectOkResult(created, z.object({ projectId: z.string() }))

  const scaffold = await runtime.call('videoStudio.scaffoldComposition', { projectId })
  expect(scaffold).toMatchObject({
    ok: true,
    result: {
      initialized: true,
      entryExists: true,
      files: expect.arrayContaining(['hyperframes.json', 'index.html', 'project.json']),
      previewActive: false
    }
  })
  expect(JSON.stringify(scaffold)).not.toContain(runtime.path)

  const open1 = await runtime.call('videoStudio.openCompositionWorkspace', { projectId })
  const open2 = await runtime.call('videoStudio.openCompositionWorkspace', { projectId })
  expect(open1).toEqual(open2)
  expect(open1).toMatchObject({
    ok: true,
    result: { folderWorkspaceId: 'fw-1', worktreeId: 'folder:fw-1' }
  })
})

it('probes both engines and refuses Remotion execution', async () => {
  const runtime = await host()
  const probe = await runtime.call('videoStudio.probeEngines', {})
  expect(probe).toMatchObject({
    ok: true,
    result: {
      engines: expect.arrayContaining([
        expect.objectContaining({ engine: 'remotion', available: false, status: 'planned' }),
        expect.objectContaining({ engine: 'hyperframes' })
      ])
    }
  })

  const created = await runtime.call('videoStudio.createProject', {
    ...draft,
    engine: 'remotion'
  })
  const { projectId } = expectOkResult(created, z.object({ projectId: z.string() }))
  const renderRes = await runtime.call('videoStudio.startRender', { projectId, quality: 'looks' })
  expect(renderRes).toMatchObject({
    ok: false,
    error: { code: 'video_studio_engine_unavailable' }
  })
})

it('validates render ownership, bounds chunk sizes, and streams exact MP4 bytes', async () => {
  const runtime = await host()
  const created = await runtime.call('videoStudio.createProject', draft)
  const { projectId } = expectOkResult(created, z.object({ projectId: z.string() }))

  expect(
    await runtime.call('videoStudio.readRenderOutputChunk', {
      projectId,
      renderId: 'missing-render',
      offset: 0,
      maxBytes: 1024
    })
  ).toMatchObject({ ok: false, error: { code: 'video_studio_render_not_found' } })

  expect(
    await runtime.call('videoStudio.readRenderOutputChunk', {
      projectId,
      renderId: 'r1',
      offset: 0,
      maxBytes: 512 * 1024 + 1
    })
  ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })

  const projectDir = resolveVideoStudioProjectDir(runtime.path, projectId)
  await mkdir(join(projectDir, 'renders'), { recursive: true })
  const mp4Bytes = Buffer.from('0123456789ABCDEF', 'utf8')
  await writeFile(resolveVideoStudioRenderOutputFile(projectDir, 'r1.mp4'), mp4Bytes)
  const catalog = await openVideoStudioCatalog(runtime.path)
  await catalog.appendRender(projectId, {
    id: 'r1',
    engine: 'hyperframes',
    quality: 'looks',
    fileName: 'r1.mp4',
    durationSeconds: 30,
    width: 1920,
    height: 1080,
    fps: 30,
    sizeBytes: mp4Bytes.length,
    createdAt: 1_700_000_000_000
  })

  const c1 = await runtime.call('videoStudio.readRenderOutputChunk', {
    projectId,
    renderId: 'r1',
    offset: 0,
    maxBytes: 10
  })
  const c2 = await runtime.call('videoStudio.readRenderOutputChunk', {
    projectId,
    renderId: 'r1',
    offset: 10,
    maxBytes: 10
  })
  expect(c1).toMatchObject({
    ok: true,
    result: { totalBytes: 16, nextOffset: 10, eof: false, mimeType: 'video/mp4' }
  })
  expect(c2).toMatchObject({
    ok: true,
    result: { totalBytes: 16, nextOffset: 16, eof: true, mimeType: 'video/mp4' }
  })
  const chunkSchema = z.object({ dataBase64: z.string() })
  const combined = Buffer.concat([
    Buffer.from(expectOkResult(c1, chunkSchema).dataBase64, 'base64'),
    Buffer.from(expectOkResult(c2, chunkSchema).dataBase64, 'base64')
  ])
  expect(combined).toEqual(mp4Bytes)
})

it('handles StyleProfile, MotionRegistry, Documents, Research, Storyboard, and expectedRevision over RPC', async () => {
  const runtime = await host()
  const { projectId } = expectOkResult(
    await runtime.callOwner('videoStudio.createProject', draft),
    z.object({ projectId: z.string() })
  )
  await runtime.callOwner('videoStudio.scaffoldComposition', { projectId })

  const motionRes = expectOkResult(
    await runtime.call('videoStudio.listMotionPresets', { category: 'camera' }),
    z.object({ presets: z.array(z.object({ id: z.string(), executionKind: z.string() })) })
  )
  expect(motionRes.presets.some((p) => p.id === 'camera.smooth_zoom')).toBe(true)
  expect(
    expectOkResult(
      await runtime.call('videoStudio.listMotionPresets', { executableOnly: true }),
      z.object({ presets: z.array(z.unknown()) })
    ).presets
  ).toEqual([])

  const styles = expectOkResult(
    await runtime.call('videoStudio.listStyleProfiles', {}),
    z.object({ profiles: z.array(z.object({ id: z.string() })) })
  )
  expect(styles.profiles.map((p) => p.id)).toContain('technical-explainer-01')

  expect(
    await runtime.callOwner('videoStudio.saveLibraryStyleProfile', {
      profile: {
        ...expectOkResult(
          await runtime.call('videoStudio.getProjectStyleState', { projectId }),
          z.object({ profile: z.record(z.string(), z.unknown()) })
        ).profile,
        id: 'technical-explainer-01',
        tier: 'library'
      }
    })
  ).toMatchObject({ ok: false, error: { code: 'video_studio_style_readonly' } })

  const dup = expectOkResult(
    await runtime.callOwner('videoStudio.duplicateStyleProfile', {
      sourceStyleId: 'technical-explainer-01',
      newStyleId: 'custom-tech-style',
      name: 'Custom Tech Style'
    }),
    z.object({ profile: z.record(z.string(), z.unknown()), revision: z.string() })
  )
  const savedLib = expectOkResult(
    await runtime.callOwner('videoStudio.saveLibraryStyleProfile', {
      profile: { ...dup.profile, name: 'Custom Tech Style v2' },
      expectedRevision: dup.revision
    }),
    z.object({ profile: z.object({ version: z.number(), name: z.string() }), revision: z.string() })
  )
  expect(savedLib.profile.version).toBe(2)

  await runtime.callOwner('videoStudio.applyStyleProfileToProject', {
    projectId,
    styleId: 'clean-editorial-01'
  })
  const styleState = expectOkResult(
    await runtime.call('videoStudio.getProjectStyleState', { projectId }),
    z.object({ profile: z.object({ id: z.string() }), revision: z.string() })
  )
  expect(styleState.profile.id).toBe('clean-editorial-01')

  expect(
    await runtime.callOwner('videoStudio.updateProjectStyleTokens', {
      projectId,
      tokens: { visual: { palette: { accentPrimary: '#0F766E' } } },
      expectedRevision: 'stale-sha'
    })
  ).toMatchObject({ ok: false, error: { code: 'video_studio_file_conflict' } })

  expect(
    await runtime.callOwner('videoStudio.updateProjectStyleTokens', {
      projectId,
      tokens: { visual: { palette: { accentPrimary: 'red; background:url(javascript:1)' } } },
      expectedRevision: styleState.revision
    })
  ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })

  const updatedStyle = expectOkResult(
    await runtime.callOwner('videoStudio.updateProjectStyleTokens', {
      projectId,
      tokens: { visual: { palette: { accentPrimary: '#0F766E' } } },
      expectedRevision: styleState.revision
    }),
    z.object({
      profile: z.object({ visual: z.object({ palette: z.object({ accentPrimary: z.string() }) }) }),
      revision: z.string()
    })
  )
  expect(updatedStyle.profile.visual.palette.accentPrimary).toBe('#0F766E')

  const projectDir = resolveVideoStudioProjectDir(runtime.path, projectId)
  const frameMd = await readFile(join(projectDir, 'frame.md'), 'utf8')
  await writeFile(join(projectDir, 'frame.md'), frameMd.replace('#0F766E', '#BE123C'), 'utf8')
  expect(
    expectOkResult(
      await runtime.callOwner('videoStudio.getStyleReconciliationDiff', { projectId }),
      z.object({ inSync: z.boolean() })
    ).inSync
  ).toBe(false)
  await runtime.callOwner('videoStudio.reconcileProjectStyle', {
    projectId,
    mode: 'import-from-markdown',
    sourceFile: 'frame.md'
  })

  expect(
    await runtime.callOwner('videoStudio.deleteLibraryStyleProfile', {
      styleId: 'custom-tech-style'
    })
  ).toMatchObject({ ok: true, result: { deleted: true } })

  const docs = expectOkResult(
    await runtime.call('videoStudio.getProjectDocuments', { projectId }),
    z.object({
      revisions: z.record(z.string(), z.string()),
      storyboard: z.object({ frames: z.array(z.object({ sceneId: z.string() })) })
    })
  )
  await expect(
    runtime.callOwner('videoStudio.updateProjectBrief', {
      projectId,
      frontmatter: { audience: 'Physics students' },
      expectedRevision: docs.revisions['BRIEF.md']
    })
  ).resolves.toMatchObject({ ok: true })
  expect(
    await runtime.callOwner('videoStudio.updateProjectScript', {
      projectId,
      scriptMarkdown: '# Narration\nConflict test',
      expectedRevision: 'bad-rev'
    })
  ).toMatchObject({ ok: false, error: { code: 'video_studio_file_conflict' } })
  await expect(
    runtime.callOwner('videoStudio.updateProjectScript', {
      projectId,
      scriptMarkdown: '# Narration\nFrame 1 narration',
      expectedRevision: docs.revisions['SCRIPT.md']
    })
  ).resolves.toMatchObject({ ok: true })

  const srcAdded = expectOkResult(
    await runtime.callOwner('videoStudio.upsertResearchSource', {
      projectId,
      source: {
        url: 'https://example.com/physics',
        title: 'Heat Transfer Basics',
        origin: 'manual',
        verificationStatus: 'verified',
        claimIds: []
      },
      expectedRevision: docs.revisions['references/sources.json']
    }),
    z.object({ source: z.object({ id: z.string() }), revision: z.string() })
  )
  await expect(
    runtime.callOwner('videoStudio.deleteResearchSource', {
      projectId,
      sourceId: srcAdded.source.id,
      expectedRevision: srcAdded.revision
    })
  ).resolves.toMatchObject({ ok: true, result: { deleted: true } })

  const f1 = docs.storyboard.frames[0]!.sceneId
  const f2 = expectOkResult(
    await runtime.callOwner('videoStudio.addStoryboardFrame', {
      projectId,
      frame: { title: 'Mechanism', duration: '6s', motionPresets: ['diagram.flow_path'] },
      expectedRevision: docs.revisions['STORYBOARD.md']
    }),
    z.object({ frame: z.object({ sceneId: z.string() }), revision: z.string() })
  )
  const patched = expectOkResult(
    await runtime.callOwner('videoStudio.patchStoryboardFrame', {
      projectId,
      sceneId: f2.frame.sceneId,
      patch: { title: 'Compressor Flow', duration: '7s' },
      expectedRevision: f2.revision
    }),
    z.object({ frame: z.object({ title: z.string() }), revision: z.string() })
  )
  expect(patched.frame.title).toBe('Compressor Flow')

  const reordered = expectOkResult(
    await runtime.callOwner('videoStudio.reorderStoryboardFrames', {
      projectId,
      sceneIds: [f2.frame.sceneId, f1],
      expectedRevision: patched.revision
    }),
    z.object({
      storyboard: z.object({ frames: z.array(z.object({ sceneId: z.string() })) }),
      revision: z.string()
    })
  )
  expect(reordered.storyboard.frames.map((f) => f.sceneId)).toEqual([f2.frame.sceneId, f1])
  await expect(
    runtime.callOwner('videoStudio.deleteStoryboardFrame', {
      projectId,
      sceneId: f2.frame.sceneId,
      expectedRevision: reordered.revision
    })
  ).resolves.toMatchObject({ ok: true, result: { deleted: true } })
})

it('handles Master Asset Registry, Host Library publishing, dependency block, and safe paths over RPC', async () => {
  const runtime = await host()
  const { projectId: p1 } = expectOkResult(
    await runtime.callOwner('videoStudio.createProject', draft),
    z.object({ projectId: z.string() })
  )
  const { projectId: p2 } = expectOkResult(
    await runtime.callOwner('videoStudio.createProject', { ...draft, title: 'Second' }),
    z.object({ projectId: z.string() })
  )
  await runtime.callOwner('videoStudio.scaffoldComposition', { projectId: p1 })
  await runtime.callOwner('videoStudio.scaffoldComposition', { projectId: p2 })

  const imported = expectOkResult(
    await runtime.callOwner('videoStudio.registerOrImportAsset', {
      scope: 'project',
      projectId: p1,
      asset: {
        id: 'ac_unit',
        name: 'AC Unit',
        type: 'object',
        format: 'svg',
        defaultState: 'closed',
        stateFiles: {
          closed: { contentBase64: Buffer.from('<svg id="closed"/>').toString('base64') }
        }
      }
    }),
    z.object({ asset: z.object({ id: z.string() }), revision: z.string() })
  )
  expect(JSON.stringify(imported)).not.toContain(runtime.path)

  const updated = expectOkResult(
    await runtime.callOwner('videoStudio.updateAssetMetadata', {
      projectId: p1,
      assetId: 'ac_unit',
      expectedRevision: imported.revision,
      changes: {
        upsertStates: {
          cutaway: { contentBase64: Buffer.from('<svg id="cutaway"/>').toString('base64') }
        }
      }
    }),
    z.object({ revision: z.string() })
  )
  await expect(
    runtime.callOwner('videoStudio.saveProjectAssetToLibrary', {
      projectId: p1,
      assetId: 'ac_unit',
      expectedProjectRevision: updated.revision
    })
  ).resolves.toMatchObject({ ok: true, result: { asset: { id: 'ac_unit', version: 1 } } })

  expect(
    expectOkResult(
      await runtime.call('videoStudio.listLibraryAssets', {}),
      z.object({ assets: z.array(z.object({ id: z.string() })) })
    ).assets.map((a) => a.id)
  ).toContain('ac_unit')

  await expect(
    runtime.call('videoStudio.listProjectAssets', { projectId: p1 })
  ).resolves.toMatchObject({ ok: true, result: { assets: [{ id: 'ac_unit' }] } })

  await expect(
    runtime.callOwner('videoStudio.applyLibraryAssetToProject', {
      projectId: p2,
      assetId: 'ac_unit'
    })
  ).resolves.toMatchObject({ ok: true, result: { asset: { id: 'ac_unit' } } })

  const p1Docs = expectOkResult(
    await runtime.call('videoStudio.getProjectDocuments', { projectId: p1 }),
    z.object({
      revisions: z.record(z.string(), z.string()),
      storyboard: z.object({ frames: z.array(z.object({ sceneId: z.string() })) })
    })
  )
  await runtime.callOwner('videoStudio.patchStoryboardFrame', {
    projectId: p1,
    sceneId: p1Docs.storyboard.frames[0]!.sceneId,
    patch: { assets: ['ac_unit'] },
    expectedRevision: p1Docs.revisions['STORYBOARD.md']
  })
  await expect(
    runtime.callOwner('videoStudio.removeProjectAsset', {
      projectId: p1,
      assetId: 'ac_unit',
      expectedRevision: updated.revision
    })
  ).resolves.toMatchObject({ ok: false, error: { code: 'video_studio_asset_in_use' } })
  await expect(
    runtime.callOwner('videoStudio.removeProjectAsset', {
      projectId: p1,
      assetId: 'ac_unit',
      force: true,
      expectedRevision: updated.revision
    })
  ).resolves.toMatchObject({ ok: true, result: { removed: true } })
  await expect(
    runtime.callOwner('videoStudio.deleteLibraryAsset', { assetId: 'ac_unit' })
  ).resolves.toMatchObject({ ok: true, result: { deleted: true } })

  const traversal = await runtime.call('videoStudio.listProjectAssets', { projectId: '../escape' })
  expect(traversal).toMatchObject({ ok: false })
  expect(JSON.stringify(traversal)).not.toContain(runtime.path)
})

it('enforces Trust Store approval, rejects stale fingerprints & TOCTOU, streams watcher events, and guards mobile/SSH', async () => {
  const runtime = await host()
  const { projectId } = expectOkResult(
    await runtime.callOwner('videoStudio.createProject', draft),
    z.object({ projectId: z.string() })
  )
  await runtime.callOwner('videoStudio.scaffoldComposition', { projectId })

  const projectDir = resolveVideoStudioProjectDir(runtime.path, projectId)
  await writeFile(join(projectDir, 'index.html'), '<html><body>AI edited</body></html>', 'utf8')

  await expect(
    runtime.callOwner('videoStudio.checkComposition', { projectId })
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'video_studio_execution_approval_required' }
  })
  await expect(runtime.callOwner('videoStudio.startPreview', { projectId })).resolves.toMatchObject(
    {
      ok: false,
      error: { code: 'video_studio_execution_approval_required' }
    }
  )
  await expect(
    runtime.callOwner('videoStudio.startRender', { projectId, quality: 'looks' })
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'video_studio_execution_approval_required' }
  })

  await expect(
    runtime.callOwner('videoStudio.approveProjectExecution', {
      projectId,
      trustState: 'approved-render',
      inputFingerprint: '0'.repeat(64)
    })
  ).resolves.toMatchObject({ ok: false, error: { code: 'video_studio_file_conflict' } })

  const docsAfterEdit = expectOkResult(
    await runtime.call('videoStudio.getProjectDocuments', { projectId }),
    z.object({
      trustState: z.string(),
      currentInputFingerprint: z.string().optional()
    })
  )
  expect(docsAfterEdit.trustState).toBe('unapproved')
  const liveFp = (await computeProjectInputFingerprint(projectDir)).inputFingerprint
  expect(docsAfterEdit.currentInputFingerprint).toBe(liveFp)

  await expect(
    runtime.callOwner('videoStudio.approveProjectExecution', {
      projectId,
      trustState: 'approved-render',
      inputFingerprint: liveFp
    })
  ).resolves.toMatchObject({
    ok: true,
    result: { trustState: 'approved-render', inputFingerprint: liveFp }
  })

  const streamed: unknown[] = []
  const unsub = runtime.subscribe('videoStudio.subscribeJobs', { projectId }, (evt) =>
    streamed.push(evt)
  )
  await vi.waitFor(() => expect(streamed.length).toBeGreaterThanOrEqual(1))

  // Orca TX self-write via RPC must NOT trigger projectFilesChanged
  const docsNow = expectOkResult(
    await runtime.call('videoStudio.getProjectDocuments', { projectId }),
    z.object({ revisions: z.record(z.string(), z.string()) })
  )
  await expect(
    runtime.callOwner('videoStudio.updateProjectScript', {
      projectId,
      scriptMarkdown: '# Self write via RPC\n',
      expectedRevision: docsNow.revisions['SCRIPT.md']
    })
  ).resolves.toMatchObject({ ok: true })
  // ast-grep-ignore: test-no-real-time-wait -- intentional negative settle window confirming TX suppression does not emit after debounceMs
  await new Promise((r) => setTimeout(r, 100))
  expect(
    streamed.filter(
      (evt) =>
        typeof evt === 'object' &&
        evt !== null &&
        'type' in evt &&
        evt.type === 'projectFilesChanged'
    )
  ).toHaveLength(0)

  await writeFile(join(projectDir, 'SCRIPT.md'), '# External watcher edit\n', 'utf8')
  await vi.waitFor(() =>
    expect(streamed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'projectFilesChanged',
          projectId,
          externalEdit: true,
          changedPaths: expect.arrayContaining(['SCRIPT.md'])
        })
      ])
    )
  )
  unsub()

  for (const readOnlyMethod of [
    'videoStudio.listStyleProfiles',
    'videoStudio.getProjectStyleState',
    'videoStudio.getProjectDocuments',
    'videoStudio.listLibraryAssets',
    'videoStudio.listProjectAssets',
    'videoStudio.listMotionPresets'
  ]) {
    expect(VIDEO_STUDIO_MOBILE_METHOD_SET.has(readOnlyMethod)).toBe(true)
    expect(mobileRpcSshRefusal(readOnlyMethod)).toBeTruthy()
  }
  for (const mutationMethod of [
    'videoStudio.updateProjectScript',
    'videoStudio.approveProjectExecution',
    'videoStudio.registerOrImportAsset'
  ]) {
    expect(VIDEO_STUDIO_MOBILE_METHOD_SET.has(mutationMethod)).toBe(false)
    await expect(runtime.call(mutationMethod, { projectId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'forbidden' }
    })
  }
})
