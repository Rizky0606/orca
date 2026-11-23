import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { getAiVaultResumeWorkspaceExecutionHostId } from '../../shared/ai-vault/resume/ai-vault-resume-target'
import { normalizeFolderWorkspaces } from '../../shared/folder-workspaces/folder-workspaces'
import { getDefaultPersistedState } from '../../shared/orca-profiles/constants'
import { normalizeProjectGroups } from '../../shared/project/groups/project-groups'
import type { Repo } from '../../shared/repository/repo-types'
import { installSidebarFeedSnapshot } from '../../shared/sidebar-feed-client/sidebar-feed-snapshot'
import { buildSidebarFeedCatalog } from '../../shared/sidebar-list/catalog/sidebar-feed-catalog'
import { normalizePairedServerRow } from '../../shared/sidebar-list/feed-facts/paired-server-rows'
import { buildWorkspaceRows } from '../../shared/sidebar-list/feed-facts/workspace-rows'
import { buildSidebarFeedRows } from '../../shared/sidebar-list/feed/sidebar-feed-rows'
import { readFeedPairedServerRow } from '../../shared/sidebar-list/feed/sidebar-feed-worktrees'
import { NO_WORKSPACE_ROW_FILTERS } from '../../shared/workspace-view/workspace-row-filters'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { FolderWorkspacePersistenceOperations } from '../persistence/restoring-sessions/folder-workspace-operations'
import { ProjectGroupPersistenceOperations } from '../persistence/tracking-repos/project-group-operations'
import { SidebarInputsFeed } from '../runtime/sidebar-inputs/feed/sidebar-inputs-feed'
import { TestPhone } from '../runtime/sidebar-inputs/feed/testing/sidebar-inputs-feed.test-fixture'
import {
  runtimeVisibleFolderWorkspaces,
  runtimeVisibleProjectGroups
} from '../runtime/workspaces/catalog/runtime-visible-catalog'
import {
  folderCatalogOf,
  resolveKeyedFolderWorkspace
} from '../runtime/workspaces/catalog/workspace-selector-candidates'
import { buildRuntimeWorktreePsSummaries } from '../runtime/workspaces/process-listing/runtime-worktree-ps-summaries'
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
    repairGeneralChatProjectGroup: groups.repairGeneralChatProjectGroup.bind(groups),
    updateProjectGroups: groups.updateProjectGroups.bind(groups),
    deleteProjectGroup: groups.deleteProjectGroup.bind(groups),
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

it('keeps unrelated local and SSH siblings visible through the mobile sidebar feed', async () => {
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
  const workspaces = Object.fromEntries(
    buildWorkspaceRows({
      worktrees: [],
      repos: store.getRepos(),
      lineageById: {},
      folderWorkspaces: runtimeVisibleFolderWorkspaces(store)
    })
  )
  const projectCatalog = {
    repos: [],
    projects: [],
    setups: [],
    projectOrderBy: 'manual',
    projectGroups: runtimeVisibleProjectGroups(store)
  }
  const feed = new SidebarInputsFeed(
    () =>
      Object.entries({ workspaces, projectCatalog }).map(([name, entities]) => ({
        name,
        read: () => entities,
        watch: () => () => {}
      })),
    () => {}
  )
  const phone = new TestPhone(feed, 'test-phone')
  phone.refresh()
  await phone.settle()
  phone.disconnect()
  const installed = phone.state.installed
  expect(installed).not.toBeNull()
  const { domains } = installSidebarFeedSnapshot(installed!, null)
  const catalog = buildSidebarFeedCatalog(domains.projectCatalog, [], [])
  const { rows } = buildSidebarFeedRows(domains, catalog, {
    groupBy: 'repo',
    sortBy: 'recent',
    projectOrderBy: 'manual',
    collapsedGroups: new Set(),
    filters: NO_WORKSPACE_ROW_FILTERS,
    workspaceHostScope: 'all',
    visibleWorkspaceHostIds: null,
    workspaceStatuses: [],
    pinnedDisplayPolicy: 'single-location',
    defaultHostId: 'local',
    hostLabelOverrides: new Map(),
    localHostLabel: 'This computer'
  })
  expect(
    rows
      .filter((row) => row.type === 'folder-workspace')
      .map(({ folderWorkspace, projectGroup, groupDepth }) => ({
        id: folderWorkspace.id,
        group: projectGroup?.id,
        groupDepth
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  ).toEqual(
    [local.id, remote.id, samePath.id].sort().map((id) => ({ id, group: undefined, groupDepth: 0 }))
  )
  expect(rows.some((row) => row.type === 'header' && row.projectGroup?.id === group.id)).toBe(false)
  expect(rows[0]).toMatchObject({ type: 'header', key: 'project-group:ungrouped', count: 3 })
  expect(store.getFolderWorkspaces().map(({ projectGroupId }) => projectGroupId)).toEqual([
    group.id,
    group.id,
    group.id,
    group.id
  ])
})

it('uses the visible sibling name in process summaries under the internal group', async () => {
  const store = makeStore()
  await ensureGeneralChatHome({ rootFolder: generalChatRootFolder }, store)
  const [group] = store.getProjectGroups()
  const sibling = store.createFolderWorkspace({ projectGroupId: group.id, name: 'User folder' })

  const summaries = buildRuntimeWorktreePsSummaries({
    store,
    resolvedWorktrees: [],
    platformByRepoId: new Map()
  })

  expect([...summaries.values()].map(({ worktreeId, repo }) => ({ worktreeId, repo }))).toEqual([
    { worktreeId: `folder:${sibling.id}`, repo: 'User folder' }
  ])
  const [summary] = summaries.values()
  const paired = normalizePairedServerRow('runtime:server', JSON.parse(JSON.stringify(summary)))
  expect(paired && readFeedPairedServerRow(paired)?.folderWorkspace).toMatchObject({
    id: sibling.id,
    projectGroupId: group.id,
    sidebarUngrouped: true
  })
})

it('infers SSH routing for an unstamped sibling after profile reload', async () => {
  const store = makeStore()
  const root = generalChatRootFolder()
  const app = await ensureGeneralChatHome({ rootFolder: generalChatRootFolder }, store)
  const [group] = store.getProjectGroups()
  const sibling = store.createFolderWorkspace({
    projectGroupId: group.id,
    folderPath: join(root, 'remote-folder')
  })
  store.getRepos().push({
    id: 'remote-repo',
    path: join(sibling.folderPath, 'repo'),
    displayName: 'Remote repo',
    addedAt: 1,
    badgeColor: '',
    connectionId: 'ssh-1'
  })
  store.reload()

  expect(resolveKeyedFolderWorkspace(folderCatalogOf(store), `folder:${sibling.id}`)).toMatchObject(
    {
      projectGroupId: group.id,
      executionHostId: 'ssh:ssh-1',
      connectionId: 'ssh-1'
    }
  )
  expect(resolveKeyedFolderWorkspace(folderCatalogOf(store), app.worktreeId)).toMatchObject({
    executionHostId: 'local',
    connectionId: null
  })
  expect(runtimeVisibleFolderWorkspaces(store)).toEqual([
    expect.objectContaining({ id: sibling.id, executionHostId: 'ssh:ssh-1', connectionId: 'ssh-1' })
  ])
  expect(
    getAiVaultResumeWorkspaceExecutionHostId(
      {
        folderWorkspaces: store.getFolderWorkspaces(),
        projectGroups: store.getProjectGroups(),
        repos: store.getRepos(),
        findWorktree: () => undefined
      },
      `folder:${sibling.id}`
    )
  ).toBe('ssh:ssh-1')
  expect(store.getFolderWorkspaces().find(({ id }) => id === sibling.id)).toEqual(sibling)
})

it('retains the workspace identity and repairs group and workspace paths after relocation', async () => {
  const store = makeStore()
  const relocated = generalChatRootFolder()
  const unrelatedGroup = store.createProjectGroup({
    name: 'Other folder',
    parentPath: relocated,
    createdFrom: 'manual'
  })
  const unrelatedFolder = store.createFolderWorkspace({ projectGroupId: unrelatedGroup.id })
  const original = await ensureGeneralChatHome(
    { rootFolder: () => join(getCanonicalUserDataPath(), 'previous-general-chat') },
    store
  )
  const originalGroup = store.getProjectGroups().find(({ internalPurpose }) => internalPurpose)
  store.updateFolderWorkspace(unrelatedFolder.id, { sortOrder: Number.MAX_SAFE_INTEGER })
  store.reload()

  expect(runtimeVisibleProjectGroups(store).map(({ id }) => id)).toEqual([unrelatedGroup.id])
  expect(runtimeVisibleFolderWorkspaces(store).map(({ id }) => id)).toEqual([unrelatedFolder.id])
  expect(listReferenceWorkspaces(store).map(({ id, repo }) => ({ id, repo }))).toEqual([
    { id: `folder:${unrelatedFolder.id}`, repo: 'Other folder' }
  ])
  expect(await ensureGeneralChatHome({ rootFolder: () => relocated }, store)).toEqual(original)
  expect(store.getProjectGroups()).toEqual([
    unrelatedGroup,
    expect.objectContaining({ id: originalGroup?.id, parentPath: relocated })
  ])
  expect(store.getFolderWorkspaces()).toEqual([
    expect.objectContaining({ id: unrelatedFolder.id, folderPath: relocated }),
    expect.objectContaining({ id: original.folderWorkspaceId, folderPath: relocated })
  ])
  expect(runtimeVisibleProjectGroups(store).map(({ id }) => id)).toEqual([unrelatedGroup.id])
  expect(runtimeVisibleFolderWorkspaces(store).map(({ id }) => id)).toEqual([unrelatedFolder.id])
  expect((await stat(relocated)).isDirectory()).toBe(true)
  expect(await ensureGeneralChatHome({ rootFolder: () => relocated }, makeStore())).toEqual(
    original
  )
})

it('refuses public group mutations while permitting General Chat to repair its home', async () => {
  const store = makeStore()
  const oldRoot = join(getCanonicalUserDataPath(), 'previous-general-chat')
  const home = await ensureGeneralChatHome({ rootFolder: () => oldRoot }, store)
  const [group] = store.getProjectGroups()
  const sibling = store.createFolderWorkspace({ projectGroupId: group.id, name: 'User folder' })

  expect.soft(store.updateProjectGroup(group.id, { name: 'Renamed' })).toBeNull()
  expect
    .soft(store.updateProjectGroups([{ groupId: group.id, updates: { name: 'Renamed' } }]))
    .toBeNull()
  expect.soft(store.deleteProjectGroup(group.id)).toBe(false)
  expect(await ensureGeneralChatHome({ rootFolder: generalChatRootFolder }, store)).toEqual(home)
  expect(store.getProjectGroups()).toEqual([
    expect.objectContaining({
      id: group.id,
      name: 'General Chat',
      parentPath: generalChatRootFolder()
    })
  ])
  expect(store.getFolderWorkspaces()).toContain(sibling)
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
