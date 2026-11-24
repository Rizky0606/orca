import { describe, expect, it } from 'vitest'
import { normalizeVideoStudioCatalog, normalizeVideoStudioProject } from './video-studio-project'
import { VideoStudioUpdateProjectParams } from './video-studio-rpc-contract'

const project = {
  id: 'project-1',
  title: 'Bird migration',
  prompt: 'Follow a flock.\n',
  aspectRatio: '16:9',
  durationSeconds: 5,
  workflowStage: 'research',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000
}

describe('Video Studio project codec', () => {
  it('reads valid records while isolating invalid entries and ignoring future fields', () => {
    expect(
      normalizeVideoStudioCatalog([
        { ...project, title: '  Bird migration  ', renderJob: 'future' },
        { ...project, id: '', durationSeconds: 100 },
        { ...project, title: '   ' },
        { ...project, aspectRatio: '4:3' },
        { ...project, durationSeconds: 4 },
        { ...project, durationSeconds: 5.5 },
        { ...project, durationSeconds: 3601 },
        { ...project, workflowStage: 'rendering' },
        { ...project, createdAt: 'yesterday' },
        { ...project, updatedAt: Infinity },
        null,
        {
          ...project,
          id: 'project-2',
          aspectRatio: '9:16',
          durationSeconds: 3600,
          workflowStage: 'production'
        }
      ])
    ).toEqual({
      projects: [
        project,
        {
          ...project,
          id: 'project-2',
          aspectRatio: '9:16',
          durationSeconds: 3600,
          workflowStage: 'production'
        }
      ],
      invalidRecords: 10
    })
    expect(
      normalizeVideoStudioProject({ ...project, aspectRatio: '1:1', workflowStage: 'script' })
    ).toEqual({ ...project, aspectRatio: '1:1', workflowStage: 'script' })
  })

  it('normalizes an update without letting the caller override host-owned fields', () => {
    expect(
      VideoStudioUpdateProjectParams.safeParse({ id: 'project-1', changes: { title: '  Birds  ' } })
    ).toMatchObject({ success: true, data: { id: 'project-1', changes: { title: 'Birds' } } })
    expect(
      VideoStudioUpdateProjectParams.safeParse({
        id: 'project-1',
        changes: { title: 'Birds', id: 'replacement', createdAt: 0, updatedAt: 0 }
      }).success
    ).toBe(false)
  })
})
