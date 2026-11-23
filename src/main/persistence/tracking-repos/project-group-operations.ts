import type { ProfileSaveDomains } from '../profile-save-domains'
import { WORKSPACE_SESSION_DOMAINS } from '../workspace-session-domains'
import type { PersistedState } from '../../../shared/orca-profiles/persisted-state-types'
import type {
  ProjectGroup,
  ProjectGroupMutation,
  ProjectGroupParentMove,
  ProjectGroupUpdate
} from '../../../shared/project/groups/project-group-types'
import {
  createProjectGroup,
  getProjectGroupSubtreeIds,
  normalizeProjectGroupName
} from '../../../shared/project/groups/project-groups'
import { getNextRootProjectOrder } from '../../../shared/sidebar-list/sections/root-project-order'
import { folderWorkspaceKey } from '../../../shared/workspace/identity/workspace-scope'
import { removeWorkspaceSessionOwnersEverywhere } from '../restoring-sessions/session-owner-removal'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host/execution-host'
import { findGeneralChatHome } from '../../general-chat/general-chat-home'

export type ProjectGroupMutationOperations = {
  state: PersistedState
  scheduleSave: (domains: ProfileSaveDomains) => void
  removeWorkspaceLineageForRemovedFolder: (folderWorkspaceId: string) => void
  pruneMobileClientTabSelections: (matchesWorktreeId: (worktreeId: string) => boolean) => void
}

export class ProjectGroupPersistenceOperations {
  constructor(private readonly operations: ProjectGroupMutationOperations) {}

  private get state(): PersistedState {
    return this.operations.state
  }

  private scheduleSave(domains: ProfileSaveDomains): void {
    this.operations.scheduleSave(domains)
  }

  private removeWorkspaceLineageForRemovedFolder(folderWorkspaceId: string): void {
    this.operations.removeWorkspaceLineageForRemovedFolder(folderWorkspaceId)
  }

  private pruneMobileClientTabSelections(matchesWorktreeId: (worktreeId: string) => boolean): void {
    this.operations.pruneMobileClientTabSelections(matchesWorktreeId)
  }

  getProjectGroups(): ProjectGroup[] {
    return [...(this.state.projectGroups ?? [])].sort(
      (left, right) => left.tabOrder - right.tabOrder || left.name.localeCompare(right.name)
    )
  }

  createProjectGroup(input: {
    name: string
    parentPath?: string | null
    connectionId?: string | null
    parentGroupId?: string | null
    createdFrom: ProjectGroup['createdFrom']
    internalPurpose?: ProjectGroup['internalPurpose']
  }): ProjectGroup {
    let maxOrder = -1
    // Large persisted lists can exceed spread argument limits.
    for (const existingGroup of this.state.projectGroups ?? []) {
      maxOrder = Math.max(maxOrder, existingGroup.tabOrder)
    }
    const group = createProjectGroup({
      ...input,
      tabOrder: maxOrder + 1
    })
    if (input.internalPurpose === 'general-chat') {
      group.internalPurpose = input.internalPurpose
      group.executionHostId = LOCAL_EXECUTION_HOST_ID
      group.connectionId = null
    }
    const rootProjectOrder = !group.parentGroupId
      ? getNextRootProjectOrder(this.state.repos, this.state.projectGroups ?? [])
      : undefined
    if (rootProjectOrder !== undefined) {
      group.rootProjectOrder = rootProjectOrder
    }
    this.state.projectGroups = [...(this.state.projectGroups ?? []), group]
    this.scheduleSave(['projectGroups'])
    return group
  }

  updateProjectGroup(groupId: string, updates: ProjectGroupUpdate): ProjectGroup | null {
    const group = (this.state.projectGroups ?? []).find((entry) => entry.id === groupId)
    if (!group || group.id === this.generalChatGroupId()) {
      return null
    }
    this.applyGroupUpdate(group, updates)
    this.scheduleSave(['projectGroups'])
    return group
  }

  repairGeneralChatProjectGroup(groupId: string, root: string): ProjectGroup | null {
    const group = findGeneralChatHome(
      this.state.projectGroups ?? [],
      this.state.folderWorkspaces ?? [],
      root
    ).group
    if (!group || group.id !== groupId) {
      return null
    }
    group.internalPurpose = 'general-chat'
    group.executionHostId = LOCAL_EXECUTION_HOST_ID
    group.connectionId = null
    group.parentPath = root
    group.updatedAt = Date.now()
    this.scheduleSave(['projectGroups'])
    return group
  }

  updateProjectGroups(mutations: readonly ProjectGroupMutation[]): ProjectGroup[] | null {
    const byId = new Map((this.state.projectGroups ?? []).map((group) => [group.id, group]))
    const generalChatId = this.generalChatGroupId()
    if (mutations.some(({ groupId }) => !byId.has(groupId) || groupId === generalChatId)) {
      return null
    }
    const updated = mutations.map(({ groupId, updates }) => {
      const group = byId.get(groupId)!
      this.applyGroupUpdate(group, updates)
      return group
    })
    if (updated.length > 0) {
      this.scheduleSave(['projectGroups'])
    }
    return updated
  }

  /** Moves nested groups under other groups in order, skipping unknown groups and moves that would form a cycle. */
  setProjectGroupParents(moves: readonly ProjectGroupParentMove[]): ProjectGroup[] {
    const byId = new Map((this.state.projectGroups ?? []).map((group) => [group.id, group]))
    const generalChatId = this.generalChatGroupId()
    const moved: ProjectGroup[] = []
    for (const { groupId, parentGroupId } of moves) {
      const group = byId.get(groupId)
      if (
        !group ||
        groupId === generalChatId ||
        parentGroupId === generalChatId ||
        !byId.has(parentGroupId) ||
        group.parentGroupId === parentGroupId
      ) {
        continue
      }
      // A cycle exists if the group is the new parent or one of its ancestors.
      const visited = new Set<string>()
      let ancestor = byId.get(parentGroupId)
      while (ancestor && ancestor.id !== groupId && !visited.has(ancestor.id)) {
        visited.add(ancestor.id)
        ancestor = ancestor.parentGroupId ? byId.get(ancestor.parentGroupId) : undefined
      }
      if (ancestor?.id === groupId) {
        continue
      }
      group.parentGroupId = parentGroupId
      group.updatedAt = Date.now()
      moved.push(group)
    }
    if (moved.length > 0) {
      this.scheduleSave(['projectGroups'])
    }
    return moved
  }

  private generalChatGroupId(): string | undefined {
    return findGeneralChatHome(this.state.projectGroups ?? [], this.state.folderWorkspaces ?? [])
      .group?.id
  }

  private applyGroupUpdate(group: ProjectGroup, updates: ProjectGroupUpdate): void {
    if (updates.name !== undefined) {
      group.name = normalizeProjectGroupName(updates.name, group.name)
    }
    if (updates.isCollapsed !== undefined) {
      group.isCollapsed = updates.isCollapsed
    }
    if (updates.tabOrder !== undefined && Number.isFinite(updates.tabOrder)) {
      group.tabOrder = updates.tabOrder
    }
    if (updates.rootProjectOrder === null) {
      delete group.rootProjectOrder
    } else if (
      updates.rootProjectOrder !== undefined &&
      Number.isFinite(updates.rootProjectOrder)
    ) {
      group.rootProjectOrder = updates.rootProjectOrder
    }
    if (updates.color !== undefined) {
      group.color = typeof updates.color === 'string' ? updates.color : null
    }
    if (updates.hookSettings !== undefined) {
      group.hookSettings = updates.hookSettings
    }
    group.updatedAt = Date.now()
  }

  deleteProjectGroup(groupId: string): boolean {
    const before = this.state.projectGroups?.length ?? 0
    const deletedGroupIds = getProjectGroupSubtreeIds(this.state.projectGroups ?? [], groupId)
    const generalChatId = this.generalChatGroupId()
    if (generalChatId && deletedGroupIds.has(generalChatId)) {
      return false
    }
    this.state.projectGroups = (this.state.projectGroups ?? []).filter(
      (group) => !deletedGroupIds.has(group.id)
    )
    if ((this.state.projectGroups?.length ?? 0) === before) {
      return false
    }
    // Sidebar grouping does not own repos; ungroup them rather than delete them.
    this.state.repos = this.state.repos.map((repo) =>
      repo.projectGroupId && deletedGroupIds.has(repo.projectGroupId)
        ? { ...repo, projectGroupId: null }
        : repo
    )
    const removedFolderWorkspaceKeys = new Set<string>()
    for (const workspace of this.state.folderWorkspaces ?? []) {
      if (deletedGroupIds.has(workspace.projectGroupId)) {
        removedFolderWorkspaceKeys.add(folderWorkspaceKey(workspace.id))
        this.removeWorkspaceLineageForRemovedFolder(workspace.id)
      }
    }
    // Remove all partition copies or folder layouts could resurrect on load.
    removeWorkspaceSessionOwnersEverywhere(this.state, removedFolderWorkspaceKeys)
    this.state.folderWorkspaces = (this.state.folderWorkspaces ?? []).filter(
      (workspace) => !deletedGroupIds.has(workspace.projectGroupId)
    )
    this.pruneMobileClientTabSelections((worktreeId) => removedFolderWorkspaceKeys.has(worktreeId))
    this.scheduleSave([
      'projectGroups',
      'repos',
      'folderWorkspaces',
      'workspaceLineageByChildKey',
      'crossStoreLineageByChildKey',
      ...WORKSPACE_SESSION_DOMAINS,
      'mobileClientTabSelectionsByDeviceId'
    ])
    return true
  }
}
