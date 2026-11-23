import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { normalizeFolderWorkspaces } from '../../shared/folder-workspaces/folder-workspaces'
import { getDefaultPersistedState } from '../../shared/orca-profiles/constants'
import { normalizeProjectGroups } from '../../shared/project/groups/project-groups'
import type { Repo } from '../../shared/repository/repo-types'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { FolderWorkspacePersistenceOperations } from '../persistence/restoring-sessions/folder-workspace-operations'
import { ProjectGroupPersistenceOperations } from '../persistence/tracking-repos/project-group-operations'
import {
  runtimeVisibleFolderWorkspaces,
  runtimeVisibleProjectGroups
} from '../runtime/workspaces/catalog/runtime-visible-catalog'
import {
  folderCatalogOf,
  resolveKeyedFolderWorkspace
} from '../runtime/workspaces/catalog/workspace-selector-candidates'
import { listReferenceWorkspaces } from '../runtime/workspaces/references/runtime-reference-catalog'
import { generalChatRootFolder, isGeneralChatProjectGroup } from './general-chat-home'
import { ensureGeneralChatHome } from './general-chat-home-workspace'

function makeStore() {
  const state = getDefaultPersistedState(getCanonicalUserDataPath())
  const operations = {
    state,
    scheduleSave: () => {},
    removeWorkspaceLineageForRemovedFolder: () => {},
    pruneMobileClientTabSelections: () => {}
  }
  const groups = new ProjectGroupPersistenceOperations(operations)
  const folders = new FolderWorkspacePersistenceOperations({
    ...operations,
    hydrateRepo: (repo) => repo
  })
  return {
    getProjectGroups: groups.getProjectGroups.bind(groups),
    createProjectGroup: groups.createProjectGroup.bind(groups),
    updateProjectGroup: groups.updateProjectGroup.bind(groups),
    getFolderWorkspaces: folders.getFolderWorkspaces.bind(folders),
    createFolderWorkspace: folders.createFolderWorkspace.bind(folders),
    updateFolderWorkspace: folders.updateFolderWorkspace.bind(folders),
    getRepos: () => state.repos,
    getAllWorktreeMeta: () => state.worktreeMeta,
    reload() {
      state.projectGroups = normalizeProjectGroups(JSON.parse(JSON.stringify(state.projectGroups)))
      state.folderWorkspaces = normalizeFolderWorkspaces(
        JSON.parse(JSON.stringify(state.folderWorkspaces)),
        state.projectGroups
      )
    }
  }
}

it('uses the shared home for standard profiles and keeps isolated profiles separate', () => {
  const home = resolve('home', 'me')
  const appData = join(home, 'App Data')
  const xdgDataHome = join(home, '.local', 'share')
  const paths = { home, appData, xdgDataHome }
  const standardRoot = join(home, '.orca', 'general-chat')
  for (const userData of [
    join(appData, 'Orca'),
    join(appData, 'orca-dev'),
    join(home, '.orca'),
    join(home, '.orca-0a1b2c3d'),
    join(xdgDataHome, 'Orca')
  ]) {
    expect(generalChatRootFolder({ ...paths, userData })).toBe(standardRoot)
  }
  const userData = resolve('test-profile')
  expect(generalChatRootFolder({ ...paths, userData })).toBe(join(userData, 'general-chat'))
})

it('shares one hidden application workspace across concurrent ensures', async () => {
  const store = makeStore()
  const deps = { rootFolder: generalChatRootFolder }

  const [left, right] = await Promise.all([
    ensureGeneralChatHome(deps, store),
    ensureGeneralChatHome(deps, store)
  ])
  expect(left).toEqual(right)
  expect(await ensureGeneralChatHome(deps, store)).toEqual(left)
  expect(store.getFolderWorkspaces()).toEqual([
    expect.objectContaining({
      id: left.folderWorkspaceId,
      folderPath: join(getCanonicalUserDataPath(), 'general-chat')
    })
  ])
  expect(left.worktreeId).toBe(`folder:${left.folderWorkspaceId}`)
  expect((await stat(join(getCanonicalUserDataPath(), 'general-chat'))).isDirectory()).toBe(true)
})

it('hides only the local application group and its folder workspace', async () => {
  const store = makeStore()
  const root = join(getCanonicalUserDataPath(), 'general-chat')
  const { folderWorkspaceId } = await ensureGeneralChatHome(
    { rootFolder: generalChatRootFolder },
    store
  )
  const remote = store.createProjectGroup({
    name: 'General Chat',
    parentPath: root,
    connectionId: 'ssh-1',
    createdFrom: 'manual'
  })
  const user = store.createProjectGroup({
    name: 'General Chat',
    parentPath: join(getCanonicalUserDataPath(), 'user-folder'),
    createdFrom: 'manual'
  })
  const visibleFolders = [remote, user].map(
    (group) => store.createFolderWorkspace({ projectGroupId: group.id }).id
  )

  expect(isGeneralChatProjectGroup({ parentPath: root, connectionId: null }, root)).toBe(true)
  expect(isGeneralChatProjectGroup({ parentPath: root, connectionId: 'ssh-1' }, root)).toBe(false)
  expect(
    isGeneralChatProjectGroup({ parentPath: root, executionHostId: 'runtime:pair' }, root)
  ).toBe(false)
  expect(store.getFolderWorkspaces().some(({ id }) => id === folderWorkspaceId)).toBe(true)
  expect(runtimeVisibleProjectGroups(store).map(({ id }) => id)).toEqual([remote.id, user.id])
  expect(
    runtimeVisibleFolderWorkspaces(store)
      .map(({ id }) => id)
      .sort()
  ).toEqual(visibleFolders.sort())
})

it('keeps the local routing pin after profile reload even when an SSH repo overlaps', async () => {
  const store = makeStore()
  const root = generalChatRootFolder()
  const sshRepo: Repo = {
    id: 'overlapping-repo',
    path: join(root, 'repo'),
    displayName: 'Remote repo',
    addedAt: 1,
    badgeColor: '',
    connectionId: 'ssh-1'
  }
  store.getRepos().push(sshRepo)
  const { worktreeId } = await ensureGeneralChatHome({ rootFolder: generalChatRootFolder }, store)

  store.reload()
  expect(store.getProjectGroups()).toEqual([expect.objectContaining({ executionHostId: 'local' })])
  expect(store.getFolderWorkspaces()).toEqual([
    expect.objectContaining({ executionHostId: 'local' })
  ])
  expect(resolveKeyedFolderWorkspace(folderCatalogOf(store), worktreeId)).toMatchObject({
    executionHostId: 'local',
    connectionId: null,
    folderPath: root
  })
})

it('keeps unrelated local and SSH workspaces visible under the internal group', async () => {
  const store = makeStore()
  const root = generalChatRootFolder()
  await ensureGeneralChatHome({ rootFolder: generalChatRootFolder }, store)
  const [group] = store.getProjectGroups()
  const local = store.createFolderWorkspace({
    projectGroupId: group.id,
    folderPath: join(root, 'user-folder')
  })
  const remote = store.createFolderWorkspace({
    projectGroupId: group.id,
    folderPath: root,
    connectionId: 'ssh-1'
  })
  const samePath = store.createFolderWorkspace({ projectGroupId: group.id, folderPath: root })
  expect(
    runtimeVisibleFolderWorkspaces(store)
      .map(({ id }) => id)
      .sort()
  ).toEqual([local.id, remote.id, samePath.id].sort())
})

it('retains the workspace identity and repairs group and workspace paths after relocation', async () => {
  const store = makeStore()
  const original = await ensureGeneralChatHome({ rootFolder: generalChatRootFolder }, store)
  const relocated = join(getCanonicalUserDataPath(), 'relocated-general-chat')
  store.reload()

  expect(await ensureGeneralChatHome({ rootFolder: () => relocated }, store)).toEqual(original)
  expect(store.getProjectGroups()).toEqual([expect.objectContaining({ parentPath: relocated })])
  expect(store.getFolderWorkspaces()).toEqual([
    expect.objectContaining({ id: original.folderWorkspaceId, folderPath: relocated })
  ])
  expect((await stat(relocated)).isDirectory()).toBe(true)
  expect(await ensureGeneralChatHome({ rootFolder: () => relocated }, makeStore())).toEqual(
    original
  )
})

it('excludes the internal workspace from references while preserving native routing', async () => {
  const store = makeStore()
  const { worktreeId } = await ensureGeneralChatHome({ rootFolder: generalChatRootFolder }, store)
  const user = store.createProjectGroup({
    name: 'References',
    parentPath: join(getCanonicalUserDataPath(), 'references'),
    createdFrom: 'manual'
  })
  const visible = store.createFolderWorkspace({ projectGroupId: user.id })

  expect(listReferenceWorkspaces(store).map(({ id }) => id)).toEqual([`folder:${visible.id}`])
  expect(resolveKeyedFolderWorkspace(folderCatalogOf(store), worktreeId, 'local')).toMatchObject({
    folderPath: generalChatRootFolder()
  })
})
