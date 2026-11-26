import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  resolveHostVideoAssetsDir,
  resolveVideoStudioProjectDir
} from '../video-studio-composition-paths'
import { scaffoldHyperFramesComposition } from '../video-studio-hyperframes-template'
import {
  VIDEO_STUDIO_LOCK_ORDER_VIOLATION_ERROR,
  VideoStudioLockCoordinator
} from '../video-studio-locks'
import {
  MAX_IMPORT_STATE_BYTES,
  normalizeAssetSubPath,
  toComparableRelativePath,
  toCanonicalProjectAssetPath
} from './video-studio-asset-invariants'
import { VideoStudioAssetStore } from './video-studio-asset-store'

const mockProject = {
  id: 'proj-asset-1',
  title: 'AC Mechanism Explainer',
  prompt: 'Show AC indoor unit states.',
  aspectRatio: '9:16' as const,
  durationSeconds: 30,
  workflowStage: 'script' as const,
  engine: 'hyperframes' as const,
  fps: 30,
  renders: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000
}

const CLOSED_SVG = '<svg viewBox="0 0 100 100"><rect id="housing" width="100" height="100"/></svg>'
const CUTAWAY_SVG = '<svg viewBox="0 0 100 100"><g id="evaporator"/><g id="fan"/></svg>'
const OPERATING_SVG = '<svg viewBox="0 0 100 100"><g id="fan" data-state="operating"/></svg>'
const LABELS_JSON = JSON.stringify({ labels: ['Evaporator', 'Fan'] })

function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

let tempRoot: string
let profileDir: string
let projectDir: string

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'orca-vs-assets-'))
  profileDir = join(tempRoot, 'profile')
  projectDir = resolveVideoStudioProjectDir(profileDir, mockProject.id)
  await scaffoldHyperFramesComposition(projectDir, mockProject)
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Master Asset Invariants, Path Containment, SHA-256 & State CRUD', () => {
  it('enforces defaultState, unique component IDs, acyclic parentComponentId, path normalization, containment, and 15 MiB limit', async () => {
    const store = new VideoStudioAssetStore(profileDir)

    expect(MAX_IMPORT_STATE_BYTES).toBe(15 * 1024 * 1024)
    expect(normalizeAssetSubPath('assets/objects/ac/closed.svg')).toBe('objects/ac/closed.svg')
    expect(normalizeAssetSubPath('objects/ac/closed.svg')).toBe('objects/ac/closed.svg')
    expect(toCanonicalProjectAssetPath('objects/ac/closed.svg')).toBe(
      'assets/objects/ac/closed.svg'
    )
    expect(() => normalizeAssetSubPath('../escape.svg')).toThrow('video_studio_invalid_path')
    expect(() => normalizeAssetSubPath('assets/asset-registry.json')).toThrow(
      'video_studio_invalid_path'
    )

    await expect(
      store.registerOrImportAsset({
        scope: 'project',
        projectId: mockProject.id,
        asset: {
          id: 'ac_bad_default',
          name: 'AC Bad Default',
          type: 'object',
          format: 'layered-svg',
          tags: [],
          defaultState: 'nonexistent',
          stateFiles: { closed: { contentBase64: b64(CLOSED_SVG) } }
        }
      })
    ).rejects.toThrow('video_studio_asset_invariant_invalid')

    await expect(
      store.registerOrImportAsset({
        scope: 'project',
        projectId: mockProject.id,
        asset: {
          id: 'ac_dup_comp',
          name: 'AC Dup Comp',
          type: 'object',
          format: 'layered-svg',
          tags: [],
          defaultState: 'closed',
          stateFiles: { closed: { contentBase64: b64(CLOSED_SVG) } },
          components: [
            { id: 'fan', animatable: true },
            { id: 'fan', animatable: false }
          ]
        }
      })
    ).rejects.toThrow('video_studio_asset_invariant_invalid')

    await expect(
      store.registerOrImportAsset({
        scope: 'project',
        projectId: mockProject.id,
        asset: {
          id: 'ac_cycle',
          name: 'AC Cycle',
          type: 'object',
          format: 'layered-svg',
          tags: [],
          defaultState: 'closed',
          stateFiles: { closed: { contentBase64: b64(CLOSED_SVG) } },
          components: [
            { id: 'a', parentComponentId: 'b', animatable: true },
            { id: 'b', parentComponentId: 'c', animatable: true },
            { id: 'c', parentComponentId: 'a', animatable: true }
          ]
        }
      })
    ).rejects.toThrow('video_studio_asset_invariant_invalid')

    await expect(
      store.registerOrImportAsset({
        scope: 'project',
        projectId: mockProject.id,
        asset: {
          id: 'ac_escape',
          name: 'AC Escape',
          type: 'object',
          format: 'layered-svg',
          tags: [],
          defaultState: 'closed',
          stateFiles: { closed: { relativePath: '../index.html' } }
        }
      })
    ).rejects.toThrow('video_studio_invalid_path')

    const oversized = Buffer.alloc(MAX_IMPORT_STATE_BYTES + 1, 65).toString('base64')
    await expect(
      store.registerOrImportAsset({
        scope: 'project',
        projectId: mockProject.id,
        asset: {
          id: 'ac_too_big',
          name: 'AC Big',
          type: 'object',
          format: 'svg',
          tags: [],
          defaultState: 'closed',
          stateFiles: { closed: { contentBase64: oversized } }
        }
      })
    ).rejects.toThrow('video_studio_invalid_state_file')

    // Directory symlink / junction containment check outside assets/
    const outsideDir = join(tempRoot, 'outside-assets-dir')
    await mkdir(outsideDir, { recursive: true })
    await writeFile(join(outsideDir, 'escaped.svg'), '<svg>escaped</svg>', 'utf8')
    const linkedDir = join(projectDir, 'assets', 'objects', 'linked_escape_dir')
    let linkedDirCreated = false
    try {
      await symlink(outsideDir, linkedDir, process.platform === 'win32' ? 'junction' : 'dir')
      linkedDirCreated = true
    } catch {
      // Ignore if platform restricts symlinks/junctions
    }
    if (linkedDirCreated) {
      await expect(
        store.registerOrImportAsset({
          scope: 'project',
          projectId: mockProject.id,
          asset: {
            id: 'ac_junction',
            name: 'AC Junction',
            type: 'object',
            format: 'svg',
            tags: [],
            defaultState: 'closed',
            stateFiles: { closed: { relativePath: 'objects/linked_escape_dir/escaped.svg' } }
          }
        })
      ).rejects.toThrow('video_studio_invalid_path')
    }

    await writeFile(join(projectDir, 'assets', 'objects', 'labels.json'), LABELS_JSON, 'utf8')
    const imported = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      asset: {
        id: 'ac_indoor_001',
        name: 'Indoor AC Unit',
        type: 'object',
        format: 'layered-svg',
        tags: ['hvac'],
        defaultState: 'closed',
        stateFiles: {
          closed: {
            contentBase64: b64(CLOSED_SVG),
            label: 'Closed Shell',
            dependencies: ['objects/labels.json']
          }
        },
        components: [
          { id: 'housing', selector: '#housing', animatable: false },
          {
            id: 'fan',
            selector: '#fan',
            parentComponentId: 'housing',
            animatable: true,
            allowedTransforms: ['rotate']
          }
        ]
      }
    })
    expect(imported.asset.snapshotRevision).toBe('rev-1')
    expect(imported.asset.states.closed.file).toBe('assets/objects/ac_indoor_001/closed.svg')
    expect(imported.asset.states.closed.sha256).toBe(sha256Text(CLOSED_SVG))
    expect(imported.asset.states.closed.dependencies).toEqual(['assets/objects/labels.json'])

    // Duplicate ID import rejected with conflict
    await expect(
      store.registerOrImportAsset({
        scope: 'project',
        projectId: mockProject.id,
        asset: {
          id: 'ac_indoor_001',
          name: 'Dup',
          type: 'object',
          format: 'svg',
          tags: [],
          defaultState: 'closed',
          stateFiles: { closed: { contentBase64: b64(CLOSED_SVG) } }
        }
      })
    ).rejects.toThrow('video_studio_file_conflict')

    // Stale expectedRevision rejected
    await expect(
      store.updateAssetMetadata({
        projectId: mockProject.id,
        assetId: 'ac_indoor_001',
        expectedRevision: 'stale-sha',
        changes: { name: 'Should Fail' }
      })
    ).rejects.toThrow('video_studio_file_conflict')

    // State CRUD: upsert cutaway & operating + switch defaultState
    const updated = await store.updateAssetMetadata({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      expectedRevision: imported.revision,
      changes: {
        tags: ['hvac', 'mechanism'],
        upsertStates: {
          cutaway: { contentBase64: b64(CUTAWAY_SVG), label: 'Cutaway' },
          operating: { contentBase64: b64(OPERATING_SVG), label: 'Operating' }
        },
        defaultState: 'cutaway',
        license: { spdx: 'Apache-2.0', commercialAllowed: true },
        consistency: { lockGeometry: true, lockProportions: true, lockMaterials: false }
      }
    })
    expect(updated.asset.snapshotRevision).toBe('rev-2')
    expect(updated.asset.defaultState).toBe('cutaway')
    expect(Object.keys(updated.asset.states).sort()).toEqual(['closed', 'cutaway', 'operating'])

    // Removing active defaultState without reassigning defaultState fails invariant check
    await expect(
      store.updateAssetMetadata({
        projectId: mockProject.id,
        assetId: 'ac_indoor_001',
        expectedRevision: updated.revision,
        changes: { removeStates: ['cutaway'] }
      })
    ).rejects.toThrow('video_studio_asset_invariant_invalid')

    // Removing non-default state succeeds cleanly
    const removedState = await store.updateAssetMetadata({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      expectedRevision: updated.revision,
      changes: { removeStates: ['operating'] }
    })
    expect(Object.keys(removedState.asset.states).sort()).toEqual(['closed', 'cutaway'])

    // Corrupt state file SHA-256 on disk -> flagged in listProjectAssets and rejected on mutation/publish
    await writeFile(
      join(projectDir, 'assets', 'objects', 'ac_indoor_001', 'cutaway.svg'),
      '<svg>TAMPERED</svg>',
      'utf8'
    )
    const listed = await store.listProjectAssets({ projectId: mockProject.id })
    expect(listed.invariantErrors.ac_indoor_001?.join(' ')).toContain('sha256-mismatch')
    await expect(
      store.saveProjectAssetToLibrary({
        projectId: mockProject.id,
        assetId: 'ac_indoor_001'
      })
    ).rejects.toThrow('video_studio_invalid_state_file')
  })
})

describe('Immutable Host Library Versioning, Portable Copy & Lock Order', () => {
  it('publishes immutable v1/v2 versions, imports directly to library v1, copies portably, enforces lock order, and keeps snapshots isolated', async () => {
    const locks = new VideoStudioLockCoordinator()
    const store = new VideoStudioAssetStore(profileDir, locks)
    const projB = 'proj-asset-2'
    const dirB = resolveVideoStudioProjectDir(profileDir, projB)
    await scaffoldHyperFramesComposition(dirB, { ...mockProject, id: projB, title: 'Project B' })
    await writeFile(
      join(projectDir, 'assets', 'objects', 'shared-labels.json'),
      LABELS_JSON,
      'utf8'
    )

    // Direct import into Host Library scope creates v1 and rejects duplicate v1
    const libDirect = await store.registerOrImportAsset({
      scope: 'library',
      asset: {
        id: 'badge_callout',
        name: 'Badge Callout',
        type: 'graphic',
        format: 'svg',
        tags: ['ui'],
        defaultState: 'idle',
        stateFiles: { idle: { contentBase64: b64(CLOSED_SVG) } }
      }
    })
    expect(libDirect.asset.version).toBe(1)
    expect(libDirect.asset.snapshotRevision).toBeUndefined()
    await expect(
      store.registerOrImportAsset({
        scope: 'library',
        asset: {
          id: 'badge_callout',
          name: 'Badge Callout',
          type: 'graphic',
          format: 'svg',
          tags: ['ui'],
          defaultState: 'idle',
          stateFiles: { idle: { contentBase64: b64(CLOSED_SVG) } }
        }
      })
    ).rejects.toThrow('video_studio_file_conflict')

    const imported = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      asset: {
        id: 'ac_indoor_001',
        name: 'Indoor AC Unit',
        type: 'object',
        format: 'layered-svg',
        tags: ['hvac'],
        defaultState: 'closed',
        dependencies: ['assets/objects/shared-labels.json'],
        stateFiles: { closed: { contentBase64: b64(CLOSED_SVG) } }
      }
    })

    await expect(
      store.saveProjectAssetToLibrary({
        projectId: mockProject.id,
        assetId: 'ac_indoor_001',
        expectedProjectRevision: 'wrong-rev'
      })
    ).rejects.toThrow('video_studio_file_conflict')

    const v1Pub = await store.saveProjectAssetToLibrary({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      expectedProjectRevision: imported.revision
    })
    expect(v1Pub.asset.version).toBe(1)

    const hostAssetsDir = resolveHostVideoAssetsDir(profileDir)
    const v1AssetJsonPath = join(hostAssetsDir, 'ac_indoor_001', 'v1', 'asset.json')
    const v1AssetJsonBefore = await readFile(v1AssetJsonPath, 'utf8')

    // Update Project A & publish v2; v1 must remain untouched
    const updatedA = await store.updateAssetMetadata({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      expectedRevision: imported.revision,
      changes: { upsertStates: { cutaway: { contentBase64: b64(CUTAWAY_SVG) } } }
    })
    const v2Pub = await store.saveProjectAssetToLibrary({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      expectedProjectRevision: updatedA.revision
    })
    expect(v2Pub.asset.version).toBe(2)
    expect(await readFile(v1AssetJsonPath, 'utf8')).toBe(v1AssetJsonBefore)

    // Concurrent library apply & publish serialize cleanly without deadlock
    const [appliedV1] = await Promise.all([
      store.applyLibraryAssetToProject({
        projectId: projB,
        assetId: 'ac_indoor_001',
        version: 1
      }),
      store.saveProjectAssetToLibrary({
        projectId: mockProject.id,
        assetId: 'ac_indoor_001'
      })
    ])
    expect(appliedV1.asset.version).toBe(1)
    expect(appliedV1.asset.snapshotRevision).toBe('rev-1')
    expect(
      await readFile(join(dirB, 'assets', 'objects', 'ac_indoor_001', 'closed.svg'), 'utf8')
    ).toBe(CLOSED_SVG)
    expect(await readFile(join(dirB, 'assets', 'objects', 'shared-labels.json'), 'utf8')).toBe(
      LABELS_JSON
    )

    // Deleting v1 leaves v2 & Project B snapshot intact; tampered library file blocks apply
    await store.deleteLibraryAsset({ assetId: 'ac_indoor_001', version: 1 })
    const libList = await store.listLibraryAssets({ type: 'object', tag: 'hvac' })
    expect(libList.assets.map((a) => [a.id, a.version])).toEqual([['ac_indoor_001', 3]])
    expect(
      (await store.listProjectAssets({ projectId: projB })).assets.map((a) => [a.id, a.version])
    ).toEqual([['ac_indoor_001', 1]])

    // Lock order enforcement: holding project lock before hostAssets operation fails
    await expect(
      locks.withProjectLock(projB, () =>
        store.applyLibraryAssetToProject({ projectId: projB, assetId: 'ac_indoor_001' })
      )
    ).rejects.toThrow(VIDEO_STUDIO_LOCK_ORDER_VIOLATION_ERROR)

    // Corrupt library v2 file -> apply rejects before touching Project B
    await writeFile(
      join(
        hostAssetsDir,
        'ac_indoor_001',
        'v2',
        'assets',
        'objects',
        'ac_indoor_001',
        'closed.svg'
      ),
      '<svg>CORRUPT</svg>',
      'utf8'
    )
    await expect(
      store.applyLibraryAssetToProject({
        projectId: projB,
        assetId: 'ac_indoor_001',
        version: 2
      })
    ).rejects.toThrow('video_studio_invalid_state_file')

    // Whole-asset library delete leaves Project B intact; missing asset throws not_found
    await store.deleteLibraryAsset({ assetId: 'ac_indoor_001' })
    expect((await store.listProjectAssets({ projectId: projB })).assets).toHaveLength(1)
    await expect(store.deleteLibraryAsset({ assetId: 'ac_indoor_001' })).rejects.toThrow(
      'video_studio_asset_not_found'
    )
  })
})

describe('Dependency Scanner & Dynamic JS Reference Delete Guard', () => {
  it('blocks static refs, warns on dynamic template-literal/concat/eval JS refs, and protects shared & unconfirmed files on disk', async () => {
    const store = new VideoStudioAssetStore(profileDir)
    await writeFile(join(projectDir, 'assets', 'objects', 'shared.json'), LABELS_JSON, 'utf8')

    const imported = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      asset: {
        id: 'ac_indoor_001',
        name: 'Indoor AC Unit',
        type: 'object',
        format: 'layered-svg',
        tags: [],
        defaultState: 'operating',
        dependencies: ['assets/objects/shared.json'],
        stateFiles: { operating: { contentBase64: b64(OPERATING_SVG) } }
      }
    })
    const operatingAbs = join(projectDir, 'assets', 'objects', 'ac_indoor_001', 'operating.svg')
    const sharedAbs = join(projectDir, 'assets', 'objects', 'shared.json')

    // 1. Static reference in STORYBOARD.md blocks unforced removal
    await writeFile(
      join(projectDir, 'STORYBOARD.md'),
      '## Frame 1 — Operating\n\n- scene_id: scene_01\n- duration: 4s\n- assets: ac_indoor_001:operating\n',
      'utf8'
    )
    await expect(
      store.removeProjectAsset({
        projectId: mockProject.id,
        assetId: 'ac_indoor_001',
        force: false,
        forceDeleteFiles: false,
        expectedRevision: imported.revision
      })
    ).rejects.toThrow('video_studio_asset_in_use')
    expect((await stat(operatingAbs)).isFile()).toBe(true)

    // 2. Dynamic template-literal in composition <script> + concat in .js file
    await writeFile(
      join(projectDir, 'STORYBOARD.md'),
      '## Frame 1 — Opening\n\n- scene_id: scene_01\n- duration: 4s\n- assets:\n',
      'utf8'
    )
    await writeFile(
      join(projectDir, 'compositions', '02-cutaway.html'),
      `<template id="tpl-02"><div data-composition-id="02-cutaway" data-duration="4"><img id="unit"/></div><script>const mount = (id) => { document.querySelector('#unit').src = \`assets/objects/\${id}/operating.svg\`; };</script></template>`,
      'utf8'
    )
    await writeFile(
      join(projectDir, 'compositions', 'loader.js'),
      `export const loadState = (name) => 'assets/objects/' + name + '/operating.svg';\nexport const dyn = (expr) => eval(expr);`,
      'utf8'
    )

    const removedDynamic = await store.removeProjectAsset({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      force: false,
      forceDeleteFiles: false,
      expectedRevision: imported.revision
    })
    expect(removedDynamic.removed).toBe(true)
    expect(removedDynamic.deletedFiles).toEqual([])
    expect(removedDynamic.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'compositions/02-cutaway.html',
          mayBeReferencedDynamically: true,
          expression: expect.stringContaining('assets/objects/${id}/operating.svg')
        }),
        expect.objectContaining({
          file: 'compositions/loader.js',
          mayBeReferencedDynamically: true,
          expression: expect.stringContaining("'assets/objects/' +")
        }),
        expect.objectContaining({
          file: 'compositions/loader.js',
          mayBeReferencedDynamically: true,
          expression: expect.stringContaining('eval(')
        })
      ])
    )
    expect((await stat(operatingAbs)).isFile()).toBe(true)

    // 3. Re-register alongside second asset sharing shared.json; static CSS ref blocks, forceDeleteFiles only deletes exclusive files
    const reimported = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      expectedRevision: removedDynamic.revision,
      asset: {
        id: 'ac_indoor_001',
        name: 'Indoor AC Unit',
        type: 'object',
        format: 'layered-svg',
        tags: [],
        defaultState: 'operating',
        dependencies: ['assets/objects/shared.json'],
        stateFiles: { operating: { relativePath: 'assets/objects/ac_indoor_001/operating.svg' } }
      }
    })
    const secondAsset = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      expectedRevision: reimported.revision,
      asset: {
        id: 'ac_outdoor_001',
        name: 'Outdoor AC Unit',
        type: 'object',
        format: 'svg',
        tags: [],
        defaultState: 'idle',
        dependencies: ['assets/objects/shared.json'],
        stateFiles: { idle: { contentBase64: b64(CLOSED_SVG) } }
      }
    })
    await writeFile(
      join(projectDir, 'compositions', 'theme.css'),
      `.unit { background-image: url("../assets/objects/ac_indoor_001/operating.svg"); }`,
      'utf8'
    )
    await expect(
      store.removeProjectAsset({
        projectId: mockProject.id,
        assetId: 'ac_indoor_001',
        force: false,
        forceDeleteFiles: false
      })
    ).rejects.toThrow('video_studio_asset_in_use')

    const forcedNoUnlink = await store.removeProjectAsset({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      force: true,
      forceDeleteFiles: false,
      expectedRevision: secondAsset.revision
    })
    expect(forcedNoUnlink.deletedFiles).toEqual([])
    expect((await stat(operatingAbs)).isFile()).toBe(true)

    // Re-register & remove WITH forceDeleteFiles: true -> unlinks exclusive operating.svg, preserves shared.json!
    const reimported2 = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      expectedRevision: forcedNoUnlink.revision,
      asset: {
        id: 'ac_indoor_001',
        name: 'Indoor AC Unit',
        type: 'object',
        format: 'layered-svg',
        tags: [],
        defaultState: 'operating',
        dependencies: ['assets/objects/shared.json'],
        stateFiles: { operating: { relativePath: 'assets/objects/ac_indoor_001/operating.svg' } }
      }
    })
    const forcedUnlink = await store.removeProjectAsset({
      projectId: mockProject.id,
      assetId: 'ac_indoor_001',
      force: true,
      forceDeleteFiles: true,
      expectedRevision: reimported2.revision
    })
    expect(forcedUnlink.deletedFiles).toEqual(['assets/objects/ac_indoor_001/operating.svg'])
    await expect(stat(operatingAbs)).rejects.toThrow()
    expect((await stat(sharedAbs)).isFile()).toBe(true)
  })

  it('guards case-insensitive ASSET-REGISTRY.JSON and Shared.json/shared.json collisions, survives malformed STORYBOARD.md, reports multiple JS warnings, and flags duplicate registry IDs', async () => {
    const store = new VideoStudioAssetStore(profileDir)

    expect(() => normalizeAssetSubPath('ASSET-REGISTRY.JSON')).toThrow('video_studio_invalid_path')
    expect(() => normalizeAssetSubPath('assets/Asset-Registry.json')).toThrow(
      'video_studio_invalid_path'
    )
    expect(() => normalizeAssetSubPath('ASSETS')).toThrow('video_studio_invalid_path')
    expect(toComparableRelativePath('assets/objects/Shared.json', 'win32')).toBe(
      'assets/objects/shared.json'
    )
    expect(toComparableRelativePath('assets/objects/Shared.json', 'darwin')).toBe(
      'assets/objects/shared.json'
    )
    expect(toComparableRelativePath('assets/objects/Shared.json', 'linux')).toBe(
      'assets/objects/Shared.json'
    )

    // Case-variant shared dependency: Shared.json vs shared.json must NOT unlink on Windows/macOS
    await writeFile(join(projectDir, 'assets', 'objects', 'Shared.json'), LABELS_JSON, 'utf8')
    const sharedAbs = join(projectDir, 'assets', 'objects', 'Shared.json')
    const a1 = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      asset: {
        id: 'unit_a',
        name: 'Unit A',
        type: 'object',
        format: 'svg',
        tags: [],
        defaultState: 'idle',
        dependencies: ['assets/objects/Shared.json'],
        stateFiles: { idle: { contentBase64: b64(CLOSED_SVG) } }
      }
    })
    const a2 = await store.registerOrImportAsset({
      scope: 'project',
      projectId: mockProject.id,
      expectedRevision: a1.revision,
      asset: {
        id: 'unit_b',
        name: 'Unit B',
        type: 'object',
        format: 'svg',
        tags: [],
        defaultState: 'idle',
        dependencies: [
          process.platform === 'win32' || process.platform === 'darwin'
            ? 'assets/objects/shared.json'
            : 'assets/objects/Shared.json'
        ],
        stateFiles: { idle: { contentBase64: b64(CUTAWAY_SVG) } }
      }
    })

    // Multiple dynamic concat/eval patterns in one script must ALL be reported
    await writeFile(
      join(projectDir, 'compositions', 'multi.js'),
      [
        `const p1 = 'assets/objects/' + id + '/closed.svg';`,
        `const p2 = 'assets/characters/' + id + '/walk.svg';`,
        `eval('loadA()');`,
        `new Function('return 1')();`
      ].join('\n'),
      'utf8'
    )

    // Broken YAML frontmatter in STORYBOARD.md with fallback reference to unit_a
    await writeFile(
      join(projectDir, 'STORYBOARD.md'),
      ['---', 'title: [unterminated', '---', '- assets: unit_a:idle', ''].join('\n'),
      'utf8'
    )
    await expect(
      store.removeProjectAsset({
        projectId: mockProject.id,
        assetId: 'unit_a',
        force: false,
        forceDeleteFiles: false,
        expectedRevision: a2.revision
      })
    ).rejects.toThrow('video_studio_asset_in_use')

    const removedA = await store.removeProjectAsset({
      projectId: mockProject.id,
      assetId: 'unit_a',
      force: true,
      forceDeleteFiles: true,
      expectedRevision: a2.revision
    })
    expect(removedA.removed).toBe(true)
    expect(removedA.deletedFiles).toEqual(['assets/objects/unit_a/idle.svg'])
    expect((await stat(sharedAbs)).isFile()).toBe(true)
    expect(
      removedA.warnings.filter((w) => w.file === 'compositions/multi.js').length
    ).toBeGreaterThanOrEqual(4)

    // External duplicate IDs in assets/asset-registry.json surface in invariantErrors
    const regPath = join(projectDir, 'assets', 'asset-registry.json')
    const currentReg = JSON.parse(await readFile(regPath, 'utf8')) as {
      schemaVersion: number
      assets: unknown[]
    }
    currentReg.assets.push(currentReg.assets[0])
    await writeFile(regPath, JSON.stringify(currentReg, null, 2), 'utf8')
    const listedDup = await store.listProjectAssets({ projectId: mockProject.id })
    expect(listedDup.invariantErrors.unit_b?.join(' ')).toMatch(/duplicate/i)
  })
})
