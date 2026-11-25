import {
  VideoStudioCreateProjectParams,
  type VideoStudioCreateProjectParams as ProjectFields
} from '../../../../shared/video-studio/video-studio-rpc-contract'

export const DEFAULT_FPS = 30

export type VideoStudioDraft = Omit<ProjectFields, 'durationSeconds'> & {
  durationSeconds: string
}

const defaults: ProjectFields = {
  title: '',
  prompt: '',
  aspectRatio: '16:9',
  durationSeconds: 30,
  workflowStage: 'research',
  engine: 'hyperframes',
  fps: DEFAULT_FPS
}

export function videoStudioDraft(project: ProjectFields = defaults): VideoStudioDraft {
  const { title, prompt, aspectRatio, durationSeconds, workflowStage, engine, fps } = project
  return {
    title,
    prompt,
    aspectRatio,
    durationSeconds: String(durationSeconds),
    workflowStage,
    engine,
    fps
  }
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
