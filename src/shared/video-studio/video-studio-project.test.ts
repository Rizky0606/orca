import { describe, expect, it } from 'vitest'
import {
  normalizeVideoStudioCatalog,
  normalizeVideoStudioProject,
  videoStudioDimensionsForAspectRatio
} from './video-studio-project'
import { VideoStudioUpdateProjectParams } from './video-studio-rpc-contract'

// All fields including schema defaults
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

  it('applies engine and fps defaults for legacy records without those fields', () => {
    const legacy = {
      id: 'legacy-1',
      title: 'Old project',
      prompt: '',
      aspectRatio: '16:9',
      durationSeconds: 60,
      workflowStage: 'research',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_001_000
      // no engine, fps, or renders
    }
    const parsed = normalizeVideoStudioProject(legacy)
    expect(parsed).not.toBeNull()
    expect(parsed?.engine).toBe('hyperframes')
    expect(parsed?.fps).toBe(30)
    expect(parsed?.renders).toEqual([])
  })

  it('rejects fps values outside [12, 120]', () => {
    expect(normalizeVideoStudioProject({ ...project, fps: 11 })).toBeNull()
    expect(normalizeVideoStudioProject({ ...project, fps: 121 })).toBeNull()
    expect(normalizeVideoStudioProject({ ...project, fps: 12 })).not.toBeNull()
    expect(normalizeVideoStudioProject({ ...project, fps: 120 })).not.toBeNull()
  })

  it('rejects unknown engine values', () => {
    expect(normalizeVideoStudioProject({ ...project, engine: 'premiere' })).toBeNull()
  })

  it('allows the remotion engine', () => {
    const parsed = normalizeVideoStudioProject({ ...project, engine: 'remotion' })
    expect(parsed?.engine).toBe('remotion')
  })
})

describe('videoStudioDimensionsForAspectRatio', () => {
  it('returns correct dimensions for each aspect ratio', () => {
    expect(videoStudioDimensionsForAspectRatio('16:9')).toEqual({ width: 1920, height: 1080 })
    expect(videoStudioDimensionsForAspectRatio('9:16')).toEqual({ width: 1080, height: 1920 })
    expect(videoStudioDimensionsForAspectRatio('1:1')).toEqual({ width: 1080, height: 1080 })
  })
})
