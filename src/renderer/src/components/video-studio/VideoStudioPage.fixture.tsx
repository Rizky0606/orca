import { useState, type ReactNode } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import type { ConfiguredFeatureHost } from '@/runtime/hosts/catalog/use-configured-feature-hosts'
import type { VideoStudioProject } from '../../../../shared/video-studio/video-studio-project'
import { VideoStudioHostUnavailable, VideoStudioPageFrame } from './VideoStudioPage'
import { VideoStudioProjects } from './VideoStudioProjects'
import {
  FIXTURE_AC_ASSET,
  TECH_EXPLAINER_FIXTURE_STYLE,
  makeFixtureInspector
} from './video-studio-data.test-fixture'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'
import type { VideoStudioProductionController } from './use-video-studio-production'

const local: ConfiguredFeatureHost = { id: 'local', label: 'This computer' }
const remote: ConfiguredFeatureHost = { id: 'runtime:studio', label: 'Studio server' }
const timestamp = Date.parse('2026-11-23T10:00:00Z')

const renderedRecord = {
  id: 'render-1',
  engine: 'hyperframes' as const,
  quality: 'looks' as const,
  fileName: 'render-1.mp4',
  durationSeconds: 45,
  width: 1920,
  height: 1080,
  fps: 30,
  sizeBytes: 3_420_160,
  createdAt: timestamp + 60_000
}

const harbor: VideoStudioProject = {
  id: 'harbor',
  title: 'Morning at the harbor',
  prompt:
    'Follow the harbor from first light to the morning rush. Find a quiet establishing shot and close on a boat leaving the dock.',
  aspectRatio: '16:9',
  durationSeconds: 45,
  workflowStage: 'research',
  engine: 'hyperframes',
  fps: 30,
  renders: [],
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

const noop = () => {}

function makeProduction(
  overrides: Partial<VideoStudioProductionController> = {}
): VideoStudioProductionController {
  return {
    engines: [
      {
        engine: 'hyperframes',
        available: true,
        status: 'ready',
        missingTools: [],
        doctorOk: true,
        version: '0.9.94',
        summary: 'HyperFrames 0.9.94 ready'
      },
      {
        engine: 'remotion',
        available: false,
        status: 'planned',
        missingTools: [],
        doctorOk: false,
        summary: 'Remotion adapter is reserved for Phase 6.'
      }
    ],
    probingEngines: false,
    composition: {
      initialized: true,
      entryExists: true,
      files: ['hyperframes.json', 'index.html', 'project.json'],
      previewActive: false
    },
    checkResult: null,
    job: null,
    preview: { active: false },
    busyAction: null,
    error: null,
    selectedRenderId: null,
    videoUrl: null,
    loadingVideo: false,
    recheckEngines: noop,
    scaffoldComposition: noop,
    openInWorkspace: noop,
    runCheck: noop,
    startPreview: noop,
    stopPreview: noop,
    startRender: noop,
    cancelRender: noop,
    selectRender: noop,
    saveRender: noop,
    ...overrides
  }
}

function Frame({ children, host = local }: { children: ReactNode; host?: ConfiguredFeatureHost }) {
  return (
    <div className="flex min-h-160 overflow-hidden rounded-md border border-border">
      <VideoStudioPageFrame hosts={[local, remote]} selectedHost={host} selectHost={() => {}}>
        {children}
      </VideoStudioPageFrame>
    </div>
  )
}

function Catalog({
  stage,
  invalidRecords = 0,
  withRender = false,
  production,
  inspector,
  initialScriptView
}: {
  stage?: VideoStudioProject['workflowStage']
  invalidRecords?: number
  withRender?: boolean
  production?: VideoStudioProductionController
  inspector?: VideoStudioInspectorController
  initialScriptView?: 'storyboard' | 'assets'
}) {
  const [projectId, selectProject] = useState<string | null>(stage ? harbor.id : null)
  const harborVariant: VideoStudioProject = {
    ...harbor,
    workflowStage: stage ?? 'research',
    renders: withRender ? [renderedRecord] : []
  }
  return (
    <Frame>
      <VideoStudioProjects
        controller={{
          snapshot: {
            projects: stage ? [harborVariant, ...projects.slice(1)] : [],
            invalidRecords
          },
          loading: false,
          saving: false,
          error: null,
          projectId,
          selectProject,
          retry: noop,
          refresh: noop,
          saveProject: async () => false,
          deleteProject: async () => false
        }}
        production={production ?? makeProduction()}
        inspector={inspector ?? makeFixtureInspector()}
        initialScriptView={initialScriptView}
      />
    </Frame>
  )
}

export const empty = defineFixture({ width: 960, render: () => <Catalog /> })
export const research = defineFixture({ width: 960, render: () => <Catalog stage="research" /> })
export const script = defineFixture({ width: 960, render: () => <Catalog stage="script" /> })
export const scriptStoryboard = defineFixture({
  width: 960,
  render: () => (
    <Catalog
      stage="script"
      production={makeProduction({
        composition: {
          initialized: true,
          entryExists: true,
          files: ['hyperframes.json', 'index.html', 'compositions/01-hook.html'],
          previewActive: false,
          drift: {
            inSync: false,
            hasWarnings: true,
            plannedTotalDurationSeconds: 7,
            actualTotalDurationSeconds: 10,
            unmountedScenes: ['scene_cutaway'],
            missingFiles: ['compositions/02-cutaway.html']
          }
        }
      })}
    />
  )
})
export const scriptAssets = defineFixture({
  width: 960,
  render: () => (
    <Catalog
      stage="script"
      initialScriptView="assets"
      inspector={makeFixtureInspector({
        projectAssets: {
          assets: [FIXTURE_AC_ASSET],
          warnings: [
            {
              file: 'compositions/02-cutaway.html',
              reason: 'Dynamic template literal may reference assets/',
              expression: '`assets/objects/${id}/operating.svg`',
              mayBeReferencedDynamically: true
            }
          ],
          invariantErrors: {},
          revision: 'rev-assets-2'
        }
      })}
    />
  )
})
export const styleConflict = defineFixture({
  width: 960,
  render: () => (
    <Catalog
      stage="style"
      inspector={makeFixtureInspector({
        styleState: {
          profile: TECH_EXPLAINER_FIXTURE_STYLE,
          revision: 'rev-style-drift',
          markdownDrift: true,
          driftedFiles: ['frame.md']
        },
        styleDiff: {
          inSync: false,
          diffs: [
            {
              file: 'frame.md',
              tokenPath: 'visual.palette.accentPrimary',
              jsonValue: '#2563EB',
              markdownValue: '#BE123C'
            }
          ]
        }
      })}
    />
  )
})
export const validationPartial = defineFixture({
  width: 960,
  render: () => (
    <Catalog
      stage="production"
      inspector={makeFixtureInspector({
        externalChangedPaths: ['STORYBOARD.md'],
        documents: {
          ...makeFixtureInspector().documents!,
          trustState: 'unapproved',
          approvedInputFingerprint: undefined,
          currentInputFingerprint: 'b'.repeat(64)
        }
      })}
      production={makeProduction({
        externalChangedPaths: ['STORYBOARD.md'],
        composition: {
          initialized: true,
          entryExists: true,
          files: ['hyperframes.json', 'index.html'],
          previewActive: false,
          checkStale: true,
          currentInputFingerprint: 'b'.repeat(64)
        },
        checkResult: {
          passed: true,
          errors: [],
          warnings: [
            {
              severity: 'warning',
              code: 'browser_checks_skipped',
              message: 'Static lint passed; browser checks skipped.'
            }
          ],
          summary: 'Partial: static lint passed (browser checks skipped)',
          checkedAt: timestamp,
          durationMs: 310,
          status: 'partial',
          stale: true,
          skippedChecks: ['browser'],
          productionGate: {
            allowed: false,
            blockingReasons: ['Browser check skipped', 'Composition modified since check']
          }
        }
      })}
    />
  )
})
export const production = defineFixture({
  width: 960,
  render: () => <Catalog stage="production" />
})
export const productionToolsMissing = defineFixture({
  width: 960,
  render: () => (
    <Catalog
      stage="production"
      production={makeProduction({
        composition: { initialized: false, entryExists: false, files: [], previewActive: false },
        engines: [
          {
            engine: 'hyperframes',
            available: false,
            status: 'missing-tools',
            missingTools: ['hyperframes', 'ffmpeg'],
            doctorOk: false,
            summary:
              'HyperFrames CLI not found on PATH. Install with `npm i -g hyperframes` (requires Node 22+ and FFmpeg).'
          }
        ]
      })}
    />
  )
})
export const productionRendering = defineFixture({
  width: 960,
  render: () => (
    <Catalog
      stage="production"
      production={makeProduction({
        job: {
          projectId: harbor.id,
          renderId: 'render-2',
          kind: 'render',
          engine: 'hyperframes',
          quality: 'looks',
          status: 'rendering',
          progressPercent: 64,
          stageLabel: 'capture',
          logLines: [
            '[compile] Validated video-studio-main (1920x1080 @ 30fps)',
            '[setup] BeginFrame capture initialized',
            '[capture] Rendering frame 864 / 1350 (64%)'
          ],
          startedAt: timestamp
        }
      })}
    />
  )
})
export const productionRendered = defineFixture({
  width: 960,
  render: () => (
    <Catalog
      stage="production"
      withRender
      production={makeProduction({
        selectedRenderId: renderedRecord.id,
        preview: { active: true, url: 'http://127.0.0.1:43123/#project/harbor', port: 43123 },
        checkResult: {
          passed: true,
          errors: [],
          warnings: [],
          summary: 'Composition check passed',
          checkedAt: timestamp,
          durationMs: 420
        },
        job: {
          projectId: harbor.id,
          renderId: renderedRecord.id,
          kind: 'render',
          engine: 'hyperframes',
          quality: 'looks',
          status: 'completed',
          progressPercent: 100,
          logLines: ['[encode] Wrote renders/render-1.mp4 (3.4 MB)'],
          startedAt: timestamp,
          completedAt: timestamp + 60_000,
          record: renderedRecord
        }
      })}
    />
  )
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
export const narrow = defineFixture({
  width: 390,
  render: () => (
    <Catalog
      stage="production"
      withRender
      production={makeProduction({ selectedRenderId: renderedRecord.id })}
    />
  )
})
