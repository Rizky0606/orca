import { describe, expect, it } from 'vitest'
import {
  normalizeVideoStudioCatalog,
  normalizeVideoStudioProject,
  videoStudioDimensionsForAspectRatio
} from './video-studio-project'
import {
  VideoStudioReadRenderOutputChunkParams,
  VideoStudioUpdateProjectParams
} from './video-studio-rpc-contract'

const project = {
  id: 'project-1',
  title: 'Bird migration',
  prompt: 'Follow a flock.\n',
  aspectRatio: '16:9',
  durationSeconds: 5,
  workflowStage: 'research',
  engine: 'hyperframes',
  fps: 30,
  renders: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000
} as const

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

  it('defaults engine, fps, and renders for legacy Stage 1 project records', () => {
    const legacy = {
      id: 'legacy-1',
      title: 'Legacy clip',
      prompt: 'Describe an engine',
      aspectRatio: '9:16',
      durationSeconds: 30,
      workflowStage: 'research',
      createdAt: 1000,
      updatedAt: 2000
    }
    expect(normalizeVideoStudioProject(legacy)).toEqual({
      ...legacy,
      engine: 'hyperframes',
      fps: 30,
      renders: []
    })
  })

  it('normalizes an update while letting engine and fps change and blocking host-owned fields', () => {
    expect(
      VideoStudioUpdateProjectParams.safeParse({
        id: 'project-1',
        changes: { title: '  Birds  ', engine: 'remotion', fps: 60 }
      })
    ).toMatchObject({
      success: true,
      data: { id: 'project-1', changes: { title: 'Birds', engine: 'remotion', fps: 60 } }
    })
    expect(
      VideoStudioUpdateProjectParams.safeParse({
        id: 'project-1',
        changes: { title: 'Birds', id: 'replacement', createdAt: 0, updatedAt: 0, renders: [] }
      }).success
    ).toBe(false)
  })

  it('rejects out-of-range fps and invalid engine values', () => {
    expect(normalizeVideoStudioProject({ ...project, fps: 11 })).toBeNull()
    expect(normalizeVideoStudioProject({ ...project, fps: 121 })).toBeNull()
    expect(normalizeVideoStudioProject({ ...project, fps: 29.5 })).toBeNull()
    expect(normalizeVideoStudioProject({ ...project, engine: 'premiere' })).toBeNull()
    expect(normalizeVideoStudioProject({ ...project, engine: 'remotion', fps: 60 })).toMatchObject({
      engine: 'remotion',
      fps: 60
    })
  })

  it('preserves valid render records and maps aspect ratios to pixel dimensions', () => {
    const withRender = normalizeVideoStudioProject({
      ...project,
      renders: [
        {
          id: 'render-1',
          engine: 'hyperframes',
          quality: 'looks',
          fileName: 'render-1.mp4',
          durationSeconds: 5,
          width: 1920,
          height: 1080,
          fps: 30,
          sizeBytes: 102400,
          createdAt: 2000
        }
      ]
    })
    expect(withRender?.renders).toHaveLength(1)
    expect(videoStudioDimensionsForAspectRatio('16:9')).toEqual({ width: 1920, height: 1080 })
    expect(videoStudioDimensionsForAspectRatio('9:16')).toEqual({ width: 1080, height: 1920 })
    expect(videoStudioDimensionsForAspectRatio('1:1')).toEqual({ width: 1080, height: 1080 })
  })

  it('bounds readRenderOutputChunk maxBytes and non-negative offsets', () => {
    expect(
      VideoStudioReadRenderOutputChunkParams.safeParse({
        projectId: 'p1',
        renderId: 'r1',
        offset: 0,
        maxBytes: 512 * 1024 + 1
      }).success
    ).toBe(false)
    expect(
      VideoStudioReadRenderOutputChunkParams.safeParse({
        projectId: 'p1',
        renderId: 'r1',
        offset: -1,
        maxBytes: 1024
      }).success
    ).toBe(false)
  })
})
