import { useState, type ReactNode } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import type { ConfiguredFeatureHost } from '@/runtime/hosts/catalog/use-configured-feature-hosts'
import type { VideoStudioProject } from '../../../../shared/video-studio/video-studio-project'
import { VideoStudioHostUnavailable, VideoStudioPageFrame } from './VideoStudioPage'
import { VideoStudioProjects } from './VideoStudioProjects'

const local: ConfiguredFeatureHost = { id: 'local', label: 'This computer' }
const remote: ConfiguredFeatureHost = { id: 'runtime:studio', label: 'Studio server' }
const timestamp = Date.parse('2026-11-23T10:00:00Z')
const harbor: VideoStudioProject = {
  id: 'harbor',
  title: 'Morning at the harbor',
  prompt:
    'Follow the harbor from first light to the morning rush. Find a quiet establishing shot and close on a boat leaving the dock.',
  aspectRatio: '16:9',
  durationSeconds: 45,
  workflowStage: 'research',
  createdAt: timestamp,
  updatedAt: timestamp
}
const projects: VideoStudioProject[] = [
  harbor,
  {
    ...harbor,
    id: 'ridge',
    title: 'Above the ridgeline',
    aspectRatio: '9:16',
    workflowStage: 'script'
  }
]

function Frame({ children, host = local }: { children: ReactNode; host?: ConfiguredFeatureHost }) {
  return (
    <div className="flex h-160 overflow-hidden rounded-md border border-border">
      <VideoStudioPageFrame hosts={[local, remote]} selectedHost={host} selectHost={() => {}}>
        {children}
      </VideoStudioPageFrame>
    </div>
  )
}

function Catalog({
  stage,
  invalidRecords = 0
}: {
  stage?: VideoStudioProject['workflowStage']
  invalidRecords?: number
}) {
  const [projectId, selectProject] = useState<string | null>(stage ? harbor.id : null)
  return (
    <Frame>
      <VideoStudioProjects
        controller={{
          snapshot: {
            projects: stage ? [{ ...harbor, workflowStage: stage }, ...projects.slice(1)] : [],
            invalidRecords
          },
          loading: false,
          saving: false,
          error: null,
          projectId,
          selectProject,
          retry: () => {},
          saveProject: async () => false,
          deleteProject: async () => false
        }}
      />
    </Frame>
  )
}

export const empty = defineFixture({ width: 960, render: () => <Catalog /> })
export const research = defineFixture({ width: 960, render: () => <Catalog stage="research" /> })
export const script = defineFixture({ width: 960, render: () => <Catalog stage="script" /> })
export const production = defineFixture({
  width: 960,
  render: () => <Catalog stage="production" />
})
export const invalid = defineFixture({
  width: 960,
  render: () => <Catalog stage="research" invalidRecords={2} />
})
export const unavailable = defineFixture({
  width: 960,
  render: () => (
    <Frame host={remote}>
      <VideoStudioHostUnavailable host={remote} environmentId="studio" />
    </Frame>
  )
})
export const narrow = defineFixture({ width: 390, render: () => <Catalog stage="production" /> })
