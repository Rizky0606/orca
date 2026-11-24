import { z } from 'zod'
import {
  VideoStudioProjectFields,
  VideoStudioProjectId,
  VideoStudioProjectSchema
} from './video-studio-project'

export const VIDEO_STUDIO_LIST_PROJECTS_METHOD = 'videoStudio.listProjects'
export const VIDEO_STUDIO_CREATE_PROJECT_METHOD = 'videoStudio.createProject'
export const VIDEO_STUDIO_UPDATE_PROJECT_METHOD = 'videoStudio.updateProject'
export const VIDEO_STUDIO_DELETE_PROJECT_METHOD = 'videoStudio.deleteProject'

export const VideoStudioListProjectsParams = z.strictObject({})
export const VideoStudioCreateProjectParams = VideoStudioProjectFields.strict()
export const VideoStudioUpdateProjectParams = z.strictObject({
  id: VideoStudioProjectId,
  changes: VideoStudioProjectFields.partial().strict()
})
export const VideoStudioDeleteProjectParams = z.strictObject({ id: VideoStudioProjectId })

export const VideoStudioListProjectsResult = z.object({
  projects: z.array(VideoStudioProjectSchema),
  invalidRecords: z.number().int().nonnegative()
})
export const VideoStudioCreateProjectResult = VideoStudioListProjectsResult.extend({
  projectId: VideoStudioProjectId
})
export const VideoStudioUpdateProjectResult = VideoStudioCreateProjectResult
export const VideoStudioDeleteProjectResult = VideoStudioListProjectsResult

export type VideoStudioListProjectsParams = z.infer<typeof VideoStudioListProjectsParams>
export type VideoStudioCreateProjectParams = z.infer<typeof VideoStudioCreateProjectParams>
export type VideoStudioUpdateProjectParams = z.infer<typeof VideoStudioUpdateProjectParams>
export type VideoStudioDeleteProjectParams = z.infer<typeof VideoStudioDeleteProjectParams>
export type VideoStudioListProjectsResult = z.infer<typeof VideoStudioListProjectsResult>
export type VideoStudioCreateProjectResult = z.infer<typeof VideoStudioCreateProjectResult>
export type VideoStudioUpdateProjectResult = z.infer<typeof VideoStudioUpdateProjectResult>
export type VideoStudioDeleteProjectResult = z.infer<typeof VideoStudioDeleteProjectResult>
