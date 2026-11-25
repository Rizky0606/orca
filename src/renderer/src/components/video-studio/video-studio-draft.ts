import {
  VideoStudioCreateProjectParams,
  type VideoStudioCreateProjectParams as ProjectFields
} from '../../../../shared/video-studio/video-studio-rpc-contract'

export type VideoStudioDraft = Omit<ProjectFields, 'durationSeconds'> & { durationSeconds: string }

const defaults: ProjectFields = {
  title: '',
  prompt: '',
  aspectRatio: '16:9',
  durationSeconds: 30,
  workflowStage: 'research'
}

export function videoStudioDraft(project: ProjectFields = defaults): VideoStudioDraft {
  const { title, prompt, aspectRatio, durationSeconds, workflowStage } = project
  return { title, prompt, aspectRatio, durationSeconds: String(durationSeconds), workflowStage }
}

export function parseVideoStudioDraft(draft: VideoStudioDraft) {
  const result = VideoStudioCreateProjectParams.safeParse({
    ...draft,
    durationSeconds: draft.durationSeconds.trim() ? Number(draft.durationSeconds) : undefined
  })
  return result.success
    ? { project: result.data }
    : { errors: result.error.issues.map(({ path }) => path[0]) }
}
