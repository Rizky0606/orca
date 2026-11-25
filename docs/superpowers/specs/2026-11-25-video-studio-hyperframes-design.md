# Video Studio HyperFrames Integration and Render Engine Contract

## Objective

Connect Orca Video Studio's project foundation to a real, host-owned composition and video rendering pipeline using **HyperFrames** as the active primary engine while establishing a unified render-engine adapter contract with a reserved **Remotion** slot for Phase 6.

After this milestone, a user can create a Video Studio project, configure its engine (`hyperframes` active, `remotion` reserved) and frame rate, scaffold a valid HyperFrames composition workspace, open that folder in an Orca workspace to author or revise scenes manually or with an Orca coding agent, validate the composition (`hyperframes check`), launch a managed HyperFrames preview server, render MP4 outputs (`draft`, `looks`, `delivery`) with live progress and cancellation, and play or save rendered videos directly inside Video Studio.

## Scope

### Included

- Backward-compatible Video Studio project schema extensions: `engine` (`'hyperframes' | 'remotion'`), `fps` (`12..120`, default `30`), and `renders` output metadata history.
- Host-owned per-project composition directories under `<profileStorageDirectory>/video-studio/projects/<projectId>/` with universal layout (`project.json`, `index.html`, `hyperframes.json`, `scenes/`, `assets/`, `renders/`).
- Unified `VideoRenderEngineAdapter` boundary with:
  - Active `HyperFramesEngineAdapter` using `@orca/process-host` (`runProcess`/`spawnProcess`) for environment probing (`doctor`), scaffolding, checking (`check`), managed live preview (`preview`), and MP4 rendering (`render`).
  - Reserved `RemotionEngineAdapter` returning explicit unavailable/planned capability metadata without mocking renders.
- Per-project render/preview job manager with concurrency guard (one active check/render per project), bounded log retention, `RevisionClock`-backed streaming updates, `AbortSignal` cancellation, and runtime-shutdown cleanup.
- Typed RPC contract extensions (`videoStudio.*`) for probing engines, reading composition state, scaffolding, opening a composition folder workspace, running checks, starting/cancelling renders, subscribing to job state, managing preview servers, and reading rendered MP4 outputs in bounded chunks.
- Desktop and responsive Video Studio Production UI updates following `docs/STYLEGUIDE.md`, plus read-only mobile browse extensions displaying engine, FPS, and render summary.

### Excluded

- Automated AI creative-director/script/storyboard/asset/TTS generation pipelines (Roadmap Phases 02–05).
- Style Profile analyzer and multi-agent Quality Control feedback loops (Roadmap Phases 02 & 07).
- Active Remotion bundling and rendering execution (Roadmap Phase 06).
- Cloud/Lambda/CloudRun HyperFrames remote render dispatch.
- Direct filesystem paths or OS-specific path assembly in renderer code.

## Architecture and Data Model

### Project Schema Extension

Extend `VideoStudioProject` in `src/shared/video-studio/video-studio-project.ts` with backward-compatible defaults so existing Stage 1 catalogs parse cleanly:

```ts
type VideoStudioEngine = 'hyperframes' | 'remotion'
type VideoStudioRenderQuality = 'draft' | 'looks' | 'delivery'

type VideoStudioRenderRecord = {
  id: string
  engine: VideoStudioEngine
  quality: VideoStudioRenderQuality
  fileName: string
  durationSeconds: number
  width: number
  height: number
  fps: number
  sizeBytes: number
  createdAt: number
}
```

Added fields on `VideoStudioProject`:

- `engine`: `'hyperframes' | 'remotion'` (default `'hyperframes'`).
- `fps`: integer from `12` through `120` (default `30`).
- `renders`: array of `VideoStudioRenderRecord` (default `[]`).

Resolution continues to derive from `aspectRatio` (`'16:9'` -> `1920x1080`, `'9:16'` -> `1080x1920`, `'1:1'` -> `1080x1080`). No host filesystem paths are stored inside `VideoStudioProject` or returned to the UI.

### Host-Owned Composition Storage

For a given runtime profile directory `profileDir`, each project's composition lives under:

`<profileDir>/video-studio/projects/<projectId>/`

Path resolution validates `projectId` against safe path containment (`realpath`/`resolve` relative containment under the projects root) to block path traversal. Inside each project directory:

- `project.json`: portable project manifest synced when metadata is scaffolded or updated.
- `hyperframes.json`: project configuration matching the selected canvas size and FPS.
- `index.html`: standalone HyperFrames composition adhering to `hyperframes-core` rules (`data-composition-id`, `data-width`, `data-height`, `data-fps`, `data-duration`, `window.__timelines` with a single paused GSAP timeline displaying the project title and prompt summary).
- `scenes/`, `assets/`, `renders/`: standard subdirectories created on scaffold.

Deleting a Video Studio project cancels any active job/preview for that project first, removes the catalog record atomically, and removes its composition directory if present.

### Opening a Composition in an Orca Workspace

`videoStudio.openCompositionWorkspace` ensures the project directory is scaffolded, then finds or creates an ordinary `FolderWorkspace` pointing to that host directory (preserving existing project-group/sidebar semantics so the user can edit `index.html`, `scenes/`, and `assets/` using Orca's editor, terminal, and coding agents). Renderer code triggers workspace activation by the returned `folderWorkspaceId`/`worktreeId` without inspecting OS paths.

## Render Engine Adapter Contract

Define `VideoRenderEngineAdapter` in `src/main/video-studio/engines/video-render-engine.ts`:

- `id: VideoStudioEngine`
- `probeEnvironment(deps): Promise<VideoStudioEngineStatus>`
- `scaffoldProject(projectDir, project, options): Promise<VideoStudioCompositionState>`
- `checkProject(projectDir, signal): Promise<VideoStudioCheckResult>`
- `startPreview(projectDir, onExit): Promise<VideoStudioPreviewHandle>`
- `renderProject(projectDir, request, onProgress, signal): Promise<VideoStudioRenderArtifact>`

### Cross-Platform Process Rules

All subprocess invocations (`node`, `hyperframes`, `npx`, `ffmpeg`, `ffprobe`) MUST use `runProcess` / `spawnProcess` from `@orca/process-host` with `windowsHide` and without `shell: true`, reusing Orca's shell-PATH refresh logic from `environment-doctor` so Windows, macOS, and Linux resolve tools reliably.

### `HyperFramesEngineAdapter`

- **Environment Probe:** Checks `node` version (`>= 22`), `hyperframes` binary (direct PATH or `npx --no-install hyperframes` / resolved local command), and `ffmpeg`. When `hyperframes` is runnable, executes `doctor --json` with a bounded timeout and surfaces structured diagnostics (`ready`, `missingTools`, `doctorOk`, `summary`). Never silently downloads or installs global tools during a passive probe.
- **Scaffold:** Writes `project.json`, `hyperframes.json`, `index.html`, and creates `scenes/`, `assets/`, `renders/`. Existing user edits in `index.html` are preserved unless `overwrite: true` is explicitly passed.
- **Check:** Runs `hyperframes check --json` in `projectDir`, parses structured lint/runtime/layout/contrast findings into `{ passed, errors, warnings, summary }`.
- **Preview:** Launches `hyperframes preview` in the project directory on an available local loopback port, parses/verifies the ready HTTP URL (`http://127.0.0.1:<port>/...`), and registers a dispose handle so switching projects, closing preview, or shutting down the runtime terminates the child process cleanly.
- **Render:** Runs `hyperframes render --quality <draft|looks|delivery> --output renders/<renderId>.mp4`. Streams parsed stage/progress lines to the job manager, enforces `AbortSignal` termination on cancel, deletes incomplete output files on failure or cancellation, confirms the final MP4 exists and has non-zero size (reading stream duration/dimensions via `ffprobe` when available, falling back to project config), and records the completed `VideoStudioRenderRecord` in the catalog.

### `RemotionEngineAdapter`

Implements `VideoRenderEngineAdapter` for `'remotion'`:

- `probeEnvironment` returns `{ engine: 'remotion', available: false, status: 'planned', summary: 'Remotion adapter is reserved for Phase 6.' }`.
- `scaffoldProject`, `checkProject`, `startPreview`, and `renderProject` reject with an explicit `'video_studio_engine_unavailable'` error rather than stubbing fake outputs.

## Runtime Job Manager, Streaming & Media Transport

### Job Manager (`src/main/video-studio/video-studio-job-manager.ts`)

- Keyed per `profileDir` + `projectId`; enforces at most one active `check` or `render` job per project (rejecting overlapping starts with `'video_studio_job_already_running'`).
- Maintains job states: `'queued' | 'checking' | 'rendering' | 'completed' | 'failed' | 'cancelled'`.
- Buffers up to 100 recent log lines per project job and bumps a `RevisionClock` on every state/progress/log change.
- Tracks active preview handles per project and tears down all child processes on runtime shutdown.

### RPC Methods (`src/shared/video-studio/video-studio-rpc-contract.ts`)

Add typed, Zod-validated methods under `VIDEO_STUDIO_METHODS`:

- `videoStudio.probeEngines`: returns `VideoStudioEngineStatus[]` for `hyperframes` and `remotion`.
- `videoStudio.getCompositionState`: `{ projectId }` -> `{ initialized, entryExists, files, previewActive, previewUrl? }`.
- `videoStudio.scaffoldComposition`: `{ projectId, overwrite? }` -> updated composition state.
- `videoStudio.openCompositionWorkspace`: `{ projectId }` -> `{ folderWorkspaceId, worktreeId }`.
- `videoStudio.checkComposition`: `{ projectId }` -> `VideoStudioCheckResult`.
- `videoStudio.startRender`: `{ projectId, quality }` -> `{ job }`.
- `videoStudio.cancelRender`: `{ projectId }` -> `{ job }`.
- `videoStudio.subscribeJobs`: `{}` (optional `{ projectId }`) -> streaming snapshots via `subscribeRuntimeRpc` (`RevisionClock` + `bindStructuredAgentSessionStream` pattern), yielding engine/job updates cleanly over both local IPC and remote runtime transports.
- `videoStudio.startPreview` / `videoStudio.stopPreview`: `{ projectId }` -> `{ active, url? }`.
- `videoStudio.readRenderOutputChunk`: `{ projectId, renderId, offset, maxBytes }` -> `{ dataBase64, totalBytes, nextOffset, eof, mimeType }`. Validates `(projectId, renderId)` against the catalog and project `renders/` root, enforcing bounded chunk sizes so rendered MP4 files play cleanly in `<video controls>` and can be exported over local or remote connections without exposing raw filesystem paths or `file://` origin restrictions.

### Remote & Mobile Boundaries

- All new RPC methods respect explicit `RuntimeClientTarget` routing; no silent host fallback.
- Mobile SSH refusal rules in `runtime-rpc-mobile-method-routing.ts` continue to gate unsupported SSH mutations explicitly.
- Mobile host browsing (`host-feature-browse-sheet.tsx`) remains read-only and displays `engine`, `fps`, and existing `renders` count/metadata.

## User Interface

Following `docs/STYLEGUIDE.md`, `main.css` tokens, `components/ui/` primitives, Lucide icons, and responsive desktop/narrow behavior:

- **Project Form (`VideoStudioProjectForm.tsx`):** Add `Engine` selector (`HyperFrames` active, `Remotion (Phase 6)` clearly marked unavailable) and `FPS` selector (`24`, `30`, `60`), keeping validation inline.
- **Production & Composition Panel (`VideoStudioProductionPanel.tsx`):** Mounted inside the project detail surface when viewing or working in the project workflow (prominent in `Production`, accessible for composition setup):
  - **Engine Readiness Banner:** Displays `HyperFrames`, `Node 22+`, and `FFmpeg` status from `videoStudio.probeEngines` with a **Recheck** button and clear install guidance when missing. Never enables fake Render/Check/Preview actions while prerequisites are absent.
  - **Composition Actions:** _Scaffold Composition_ (or _Re-scaffold_ behind confirmation if `index.html` already exists), _Open in Workspace_, _Run Check_ (showing inline pass/fail findings), and _Preview_ (_Start_ / _Open URL_ / _Stop_).
  - **Render & Outputs:** Quality selector (`Draft`, `Looks`, `Delivery`), _Render MP4_ / _Cancel_ action, live job status badge, collapsible log output, and a render history list where selecting an output loads the MP4 via `readRenderOutputChunk` into an accessible `<video controls>` player with a _Save MP4_ action.

## Verification

- **Unit and Invariant Tests:**
  - `src/shared/video-studio/video-studio-project.test.ts`: backward compatibility of Stage 1 records missing `engine`, `fps`, and `renders`, plus schema bounds on `fps` and `renders`.
  - `src/main/video-studio/video-studio-catalog.test.ts`: persistence of `engine`, `fps`, `renders`, and directory cleanup on project deletion.
  - `src/main/video-studio/video-studio-composition-paths.test.ts`: project ID containment / anti-traversal guarantees and scaffold creation/preservation invariants.
  - `src/main/video-studio/engines/hyperframes-engine-adapter.test.ts`: CLI argument construction, `doctor --json` and `check --json` parsing, `AbortSignal` cancellation cleanup, and missing-tool handling using mocked process runners.
  - `src/main/video-studio/video-studio-job-manager.test.ts`: single-job-per-project exclusion, state transitions, bounded log retention, and shutdown cleanup.
  - `src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts`: new RPC method validation, `readRenderOutputChunk` catalog/bounds checks, and Remotion adapter refusal.
- **Visual & Gate Checks:**
  - Fixture variants in `VideoStudioPage.fixture.tsx` covering prerequisites-missing, scaffolded-ready, active-render-progress, and completed-output states, verified via `pnpm fixtures:shot`.
  - `pnpm exec oxfmt`, `pnpm exec oxlint`, `pnpm tc:node`, `pnpm tc:web`, `mobile` typecheck, `check:react-compiler-compat-ratchet`, and `pnpm check:changed`. (Real end-to-end HyperFrames CLI renders require `hyperframes` + `ffmpeg` on the host; Electron CDP validation requires C++ Build Tools for native dependencies.)
