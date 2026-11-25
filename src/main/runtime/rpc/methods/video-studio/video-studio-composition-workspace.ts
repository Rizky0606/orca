import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../shared/execution-host/execution-host'
import { folderWorkspaceKey } from '../../../../../shared/workspace/identity/workspace-scope'
import type { VideoStudioProject } from '../../../../../shared/video-studio/video-studio-project'
import {
  ensureVideoStudioProjectsRoot,
  resolveVideoStudioProjectDir
} from '../../../../video-studio/video-studio-composition-paths'
import { openVideoStudioJobManager } from '../../../../video-studio/video-studio-job-registry'
import { resolveRpcWorkspaceCreatorProvenance } from '../../callers/workspace-creator-context'
import type { RpcContext } from '../../core'

async function canonicalPath(targetPath: string): Promise<string> {
  return realpath(targetPath).catch(() => resolve(targetPath))
}

function isLocalGroupOrWorkspace(row: {
  connectionId?: string | null
  executionHostId?: string | null
}): boolean {
  return (
    !row.connectionId &&
    (row.executionHostId ?? LOCAL_EXECUTION_HOST_ID) === LOCAL_EXECUTION_HOST_ID
  )
}

export async function openVideoStudioCompositionWorkspace(
  context: RpcContext,
  profileDir: string,
  project: VideoStudioProject
): Promise<{ folderWorkspaceId: string; worktreeId: string }> {
  const manager = await openVideoStudioJobManager(profileDir)
  const state = await manager.getCompositionState(project.id)
  if (!state.initialized) {
    await manager.scaffoldComposition(project)
  }

  const projectDir = resolveVideoStudioProjectDir(profileDir, project.id)
  const canonicalProjectDir = await canonicalPath(projectDir)
  const store = context.runtime.requireStore()

  const workspaces =
    typeof context.runtime.listVisibleFolderWorkspaces === 'function'
      ? context.runtime.listVisibleFolderWorkspaces()
      : (store.getFolderWorkspaces?.() ?? [])

  for (const existing of workspaces) {
    if (!isLocalGroupOrWorkspace(existing)) {
      continue
    }
    if ((await canonicalPath(existing.folderPath)) === canonicalProjectDir) {
      return {
        folderWorkspaceId: existing.id,
        worktreeId: folderWorkspaceKey(existing.id)
      }
    }
  }

  const groups =
    typeof context.runtime.listVisibleProjectGroups === 'function'
      ? context.runtime.listVisibleProjectGroups()
      : (store.getProjectGroups?.() ?? [])

  const projectsRoot = await ensureVideoStudioProjectsRoot(profileDir)
  const canonicalRoot = await canonicalPath(projectsRoot)

  let group = groups.find(
    (entry) =>
      isLocalGroupOrWorkspace(entry) &&
      !entry.internalPurpose &&
      (entry.name === 'Video Studio' ||
        (entry.parentPath ? resolve(entry.parentPath) === resolve(canonicalRoot) : false))
  )

  if (!group) {
    if (typeof context.runtime.createProjectGroup === 'function') {
      group = await context.runtime.createProjectGroup({
        name: 'Video Studio',
        parentPath: canonicalRoot,
        createdFrom: 'manual'
      })
    } else if (store.createProjectGroup) {
      group = store.createProjectGroup({
        name: 'Video Studio',
        parentPath: canonicalRoot,
        createdFrom: 'manual'
      })
    } else {
      throw new Error('runtime_unavailable')
    }
  }

  let createdWorkspace: { id: string } | undefined
  if (typeof context.runtime.createFolderWorkspace === 'function') {
    const res = await context.runtime.createFolderWorkspace({
      projectGroupId: group.id,
      name: project.title,
      folderPath: canonicalProjectDir,
      signal: context.signal,
      creatorProvenance: resolveRpcWorkspaceCreatorProvenance(context)
    })
    createdWorkspace = res.folderWorkspace
  } else if (store.createFolderWorkspace) {
    createdWorkspace = store.createFolderWorkspace({
      projectGroupId: group.id,
      name: project.title,
      folderPath: canonicalProjectDir,
      creatorProvenance: resolveRpcWorkspaceCreatorProvenance(context)
    })
  } else {
    throw new Error('runtime_unavailable')
  }

  return {
    folderWorkspaceId: createdWorkspace.id,
    worktreeId: folderWorkspaceKey(createdWorkspace.id)
  }
}
