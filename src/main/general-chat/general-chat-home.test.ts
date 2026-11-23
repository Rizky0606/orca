import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { getDefaultPersistedState } from '../../shared/orca-profiles/constants'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { FolderWorkspacePersistenceOperations } from '../persistence/restoring-sessions/folder-workspace-operations'
import { ProjectGroupPersistenceOperations } from '../persistence/tracking-repos/project-group-operations'
import {
  runtimeVisibleFolderWorkspaces,
  runtimeVisibleProjectGroups
} from '../runtime/workspaces/catalog/runtime-visible-catalog'
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
    getFolderWorkspaces: folders.getFolderWorkspaces.bind(folders),
    createFolderWorkspace: folders.createFolderWorkspace.bind(folders),
    getRepos: () => state.repos
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
