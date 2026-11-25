# Video Studio HyperFrames Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Orca Video Studio to a host-owned HyperFrames composition, validation, preview, and MP4 rendering pipeline with a reserved Remotion engine adapter slot.

**Architecture:** Extend `VideoStudioProject` with backward-compatible `engine`, `fps`, and `renders` fields; isolate each project's composition files (`project.json`, `hyperframes.json`, `index.html`, `scenes/`, `assets/`, `renders/`) under `<profileDir>/video-studio/projects/<projectId>/`; run HyperFrames CLI operations through `@orca/process-host` inside a unified `VideoRenderEngineAdapter` boundary; manage per-project jobs and previews via a `RevisionClock`-backed `VideoStudioJobManager` exposed over typed runtime RPC methods and streaming subscriptions; and surface engine readiness, workspace handoff, preview controls, and bounded-chunk MP4 playback in the Video Studio Production UI.

**Tech Stack:** TypeScript, React 19, Zod, Orca runtime RPC (`defineMethod`, `subscribeRuntimeRpc`, `RevisionClock`), `@orca/process-host` (`runProcess`, `spawnProcess`), Vitest, `oxlint`, `oxfmt`, Playwright fixture screenshots.

**Spec:** `docs/superpowers/specs/2026-11-25-video-studio-hyperframes-design.md`

## Global Constraints

- Store host files under `<profileStorageDirectory>/video-studio/projects/<projectId>/` and validate project IDs against path traversal; never expose host filesystem paths in renderer state or RPC results.
- Keep `VideoStudioProject` backward-compatible with Stage 1 JSON records lacking `engine`, `fps`, or `renders` (`engine: 'hyperframes'`, `fps: 30`, `renders: []`).
- Spawn all subprocesses (`node`, `hyperframes`, `npx`, `ffmpeg`, `ffprobe`) exclusively via `@orca/process-host` (`runProcess`/`spawnProcess`) with `windowsHide` and without `shell: true`, reusing `environment-doctor` shell-PATH helpers.
- Reserve `RemotionEngineAdapter` cleanly (`available: false`, `status: 'planned'`, refusing execution with `'video_studio_engine_unavailable'`); never stub fake renders.
- Keep React hooks free of `try/finally` blocks (use module-level helpers for `finally` cleanup so `check:react-compiler-compat-ratchet` passes) and pass user-facing copy through `useTranslate()` without calling `show*` helpers with raw string literals (`localization coverage`).
- Follow `docs/STYLEGUIDE.md`, `main.css` tokens, and `components/ui/` primitives.
- After finishing edits, sync desktop & mobile localization catalogs (`sync:localization-catalog`, `sync:mobile-localization`), regenerate RPC params catalog if needed (`generate:rpc-params-catalog`), and run `pnpm check:changed --base=main`.

---

### Task 1: Extend Project Schema, Render Records & RPC Contracts

**Files:**

- Modify: `src/shared/video-studio/video-studio-project.ts`
- Modify: `src/shared/video-studio/video-studio-rpc-contract.ts`
- Modify: `src/shared/video-studio/video-studio-project.test.ts`

**Interfaces:**

- Produces in `src/shared/video-studio/video-studio-project.ts`:
  - `VideoStudioEngineSchema` (`'hyperframes' | 'remotion'`), `VideoStudioEngine`
  - `VideoStudioRenderQualitySchema` (`'draft' | 'looks' | 'delivery'`), `VideoStudioRenderQuality`
  - `VideoStudioRenderRecordSchema`, `VideoStudioRenderRecord`
  - `VideoStudioProjectFields` (with `.default(...)` on `engine` and `fps` for input/stored compatibility), `VideoStudioProjectSchema` (with `renders` defaulting to `[]`), `videoStudioDimensionsForAspectRatio(aspectRatio): { width: number; height: number }`
- Produces in `src/shared/video-studio/video-studio-rpc-contract.ts`:
  - Method constants: `VIDEO_STUDIO_PROBE_ENGINES_METHOD`, `VIDEO_STUDIO_GET_COMPOSITION_STATE_METHOD`, `VIDEO_STUDIO_SCAFFOLD_COMPOSITION_METHOD`, `VIDEO_STUDIO_OPEN_COMPOSITION_WORKSPACE_METHOD`, `VIDEO_STUDIO_CHECK_COMPOSITION_METHOD`, `VIDEO_STUDIO_START_RENDER_METHOD`, `VIDEO_STUDIO_CANCEL_RENDER_METHOD`, `VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD`, `VIDEO_STUDIO_START_PREVIEW_METHOD`, `VIDEO_STUDIO_STOP_PREVIEW_METHOD`, `VIDEO_STUDIO_READ_RENDER_OUTPUT_CHUNK_METHOD`
  - Zod param/result schemas: `VideoStudioEngineStatus`, `VideoStudioCompositionState`, `VideoStudioCheckResult`, `VideoStudioRenderJobSnapshot`, `VideoStudioJobsEvent`, `VideoStudioPreviewState`, `VideoStudioRenderOutputChunk`.

- [ ] **Step 1: Write failing backward-compatibility and schema tests**

Add tests in `src/shared/video-studio/video-studio-project.test.ts` verifying:

1. Stage 1 records missing `engine`, `fps`, and `renders` normalize to `{ engine: 'hyperframes', fps: 30, renders: [] }`.
2. Invalid `fps` (`11`, `121`, `29.5`) or invalid `engine` causes `normalizeVideoStudioProject` to return `null`.
3. Valid `renders` entries preserve fields and aspect ratios map to exact dimensions (`16:9` -> `1920x1080`, `9:16` -> `1080x1920`, `1:1` -> `1080x1080`).

```ts
it('defaults engine, fps, and renders for Stage 1 project records', () => {
  const legacy = {
    id: 'p1',
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

it('rejects out-of-range fps and maps aspect ratios to pixel dimensions', () => {
  expect(
    normalizeVideoStudioProject({
      id: 'p2',
      title: 'Bad fps',
      prompt: '',
      aspectRatio: '16:9',
      durationSeconds: 30,
      workflowStage: 'script',
      fps: 11,
      createdAt: 1000,
      updatedAt: 1000
    })
  ).toBeNull()
  expect(videoStudioDimensionsForAspectRatio('9:16')).toEqual({ width: 1080, height: 1920 })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-project.test.ts --maxWorkers=2
```

Expected: FAIL because `videoStudioDimensionsForAspectRatio` and the new defaults do not exist yet.

- [ ] **Step 3: Implement schema and RPC contracts**

Update `src/shared/video-studio/video-studio-project.ts`:

```ts
import { z } from 'zod'

export const VideoStudioProjectId = z.string().refine((value) => value.trim().length > 0)
export const VideoStudioEngineSchema = z.enum(['hyperframes', 'remotion'])
export const VideoStudioRenderQualitySchema = z.enum(['draft', 'looks', 'delivery'])

export const VideoStudioRenderRecordSchema = z.object({
  id: VideoStudioProjectId,
  engine: VideoStudioEngineSchema,
  quality: VideoStudioRenderQualitySchema,
  fileName: z.string().trim().min(1),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().min(12).max(120),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.number()
})

export const VideoStudioProjectFields = z.object({
  title: z.string().trim().min(1),
  prompt: z.string(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  durationSeconds: z.number().int().min(5).max(3600),
  workflowStage: z.enum(['research', 'script', 'production']),
  engine: VideoStudioEngineSchema.default('hyperframes'),
  fps: z.number().int().min(12).max(120).default(30)
})

export const VideoStudioProjectSchema = VideoStudioProjectFields.extend({
  id: VideoStudioProjectId,
  renders: z.array(VideoStudioRenderRecordSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type VideoStudioEngine = z.infer<typeof VideoStudioEngineSchema>
export type VideoStudioRenderQuality = z.infer<typeof VideoStudioRenderQualitySchema>
export type VideoStudioRenderRecord = z.infer<typeof VideoStudioRenderRecordSchema>
export type VideoStudioProject = z.infer<typeof VideoStudioProjectSchema>

export function videoStudioDimensionsForAspectRatio(
  aspectRatio: VideoStudioProject['aspectRatio']
): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 }
    case '1:1':
      return { width: 1080, height: 1080 }
    case '16:9':
      return { width: 1920, height: 1080 }
  }
}
```

And add the new method names and strict Zod schemas in `src/shared/video-studio/video-studio-rpc-contract.ts`:

- `VIDEO_STUDIO_PROBE_ENGINES_METHOD = 'videoStudio.probeEngines'`
- `VIDEO_STUDIO_GET_COMPOSITION_STATE_METHOD = 'videoStudio.getCompositionState'`
- `VIDEO_STUDIO_SCAFFOLD_COMPOSITION_METHOD = 'videoStudio.scaffoldComposition'`
- `VIDEO_STUDIO_OPEN_COMPOSITION_WORKSPACE_METHOD = 'videoStudio.openCompositionWorkspace'`
- `VIDEO_STUDIO_CHECK_COMPOSITION_METHOD = 'videoStudio.checkComposition'`
- `VIDEO_STUDIO_START_RENDER_METHOD = 'videoStudio.startRender'`
- `VIDEO_STUDIO_CANCEL_RENDER_METHOD = 'videoStudio.cancelRender'`
- `VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD = 'videoStudio.subscribeJobs'`
- `VIDEO_STUDIO_START_PREVIEW_METHOD = 'videoStudio.startPreview'`
- `VIDEO_STUDIO_STOP_PREVIEW_METHOD = 'videoStudio.stopPreview'`
- `VIDEO_STUDIO_READ_RENDER_OUTPUT_CHUNK_METHOD = 'videoStudio.readRenderOutputChunk'`

Ensure `VideoStudioReadRenderOutputChunkParams` caps `maxBytes` (e.g. `.int().min(1).max(512 * 1024)`), `offset` (`.int().nonnegative()`), and `renderId` (`VideoStudioProjectId`). Ensure `VideoStudioCreateProjectParams` accepts optional `engine` / `fps` with defaults (`VideoStudioProjectFields.strict()`), and `VideoStudioUpdateProjectParams.changes` allows partial updates to `title`, `prompt`, `aspectRatio`, `durationSeconds`, `workflowStage`, `engine`, `fps` (never `id`, `createdAt`, or `renders`).

- [ ] **Step 4: Run tests, format, lint & typecheck**

```powershell
corepack pnpm exec oxfmt --write src/shared/video-studio
corepack pnpm exec oxlint src/shared/video-studio
corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-project.test.ts --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/shared/video-studio
git commit -m "feat(video): extend project schema and hyperframes RPC contracts"
```

---

### Task 2: Host Composition Paths, HyperFrames Template & Catalog Extensions

**Files:**

- Create: `src/main/video-studio/video-studio-composition-paths.ts`
- Create: `src/main/video-studio/video-studio-hyperframes-template.ts`
- Create: `src/main/video-studio/video-studio-composition-paths.test.ts`
- Modify: `src/main/video-studio/video-studio-catalog.ts`
- Modify: `src/main/video-studio/video-studio-catalog.test.ts`

**Interfaces:**

- Consumes: `VideoStudioProject`, `VideoStudioRenderRecord`, `videoStudioDimensionsForAspectRatio` from `../../shared/video-studio/video-studio-project`.
- Produces in `src/main/video-studio/video-studio-composition-paths.ts`:
  - `resolveVideoStudioProjectsRoot(profileDir: string): Promise<string>`
  - `resolveVideoStudioProjectDir(profileDir: string, projectId: string): Promise<string>` (validates `projectId` contains no separators or `..` segments and checks contained relative path)
  - `resolveVideoStudioRenderOutputFile(projectDir: string, fileName: string): Promise<string>` (resolves inside `<projectDir>/renders` and verifies containment)
  - `inspectVideoStudioCompositionState(projectDir: string, preview?: { active: boolean; url?: string }): Promise<VideoStudioCompositionState>`
- Produces in `src/main/video-studio/video-studio-hyperframes-template.ts`:
  - `scaffoldHyperFramesComposition(projectDir: string, project: VideoStudioProject, options?: { overwrite?: boolean }): Promise<VideoStudioCompositionState>`
- Produces on `VideoStudioCatalog` (`src/main/video-studio/video-studio-catalog.ts`):
  - `get(id: string): Promise<VideoStudioProject | null>`
  - `appendRender(projectId: string, record: VideoStudioRenderRecord): Promise<VideoStudioUpdateProjectResult>`
  - `remove({ id })` deletes the project directory under `projects/<id>/` via `rm(..., { recursive: true, force: true })` after atomic catalog update.

- [ ] **Step 1: Write failing path-containment, scaffold, and catalog render tests**

Create `src/main/video-studio/video-studio-composition-paths.test.ts` testing:

1. `resolveVideoStudioProjectDir` rejects traversal IDs (`../escape`, `foo/bar`, `foo\\bar`, `.`, `..`, empty).
2. `resolveVideoStudioRenderOutputFile` rejects traversal file names (`../secret.mp4`, nested paths).
3. `scaffoldHyperFramesComposition` writes `project.json`, `hyperframes.json`, `index.html`, and creates `scenes/`, `assets/`, `renders/`; `index.html` contains `data-composition-id`, `data-width`, `data-height`, `data-fps`, `data-duration`, `window.__timelines`, and HTML-escaped title/prompt; a second call without `overwrite: true` preserves custom `index.html` edits while updating `project.json`.

And extend `src/main/video-studio/video-studio-catalog.test.ts` verifying `appendRender` appends a `VideoStudioRenderRecord` atomically without altering `createdAt`, and `remove` deletes the project's composition folder when present.

- [ ] **Step 2: Run tests to verify they fail**

```powershell
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/video-studio-catalog.test.ts --maxWorkers=2
```

Expected: FAIL because the new modules/methods do not exist.

- [ ] **Step 3: Implement composition path containment, HyperFrames scaffold template, and catalog updates**

Key implementation requirements for `src/main/video-studio/video-studio-hyperframes-template.ts`:

- Compute `{ width, height }` from `videoStudioDimensionsForAspectRatio(project.aspectRatio)`.
- Escape HTML text entities (`&`, `<`, `>`, `"`, `'`) before interpolating `project.title` and `project.prompt` into `index.html`.
- Follow `hyperframes-core` rules in the generated `index.html`:
  - Root `<div id="stage" data-composition-id="video-studio-main" data-width="${width}" data-height="${height}" data-fps="${project.fps}" data-duration="${project.durationSeconds}" style="width:100%;height:100%;position:relative;overflow:hidden;...">`
  - Single paused GSAP timeline registered at `window.__timelines['video-studio-main']` (loading GSAP from CDN or lightweight deterministic fallback when `typeof window.gsap !== 'undefined'`, with `seek`/`pause` timeline contract so `hyperframes check` passes cleanly without CSS/GSAP transform conflicts).
  - Never wrap standalone `index.html` root in `<template>`.
- Write `hyperframes.json` with `{ "id": "video-studio-main", "width": width, "height": height, "fps": project.fps, "durationSeconds": project.durationSeconds }`.

- [ ] **Step 4: Run tests, format, and lint**

```powershell
corepack pnpm exec oxfmt --write src/main/video-studio
corepack pnpm exec oxlint src/main/video-studio
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/video-studio-catalog.test.ts --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/main/video-studio
git commit -m "feat(video): add host composition paths, hyperframes scaffold, and render history"
```

---

### Task 3: Render Engine Adapter Contract, HyperFrames Adapter & Remotion Slot

**Files:**

- Create: `src/main/video-studio/engines/video-render-engine.ts`
- Create: `src/main/video-studio/engines/hyperframes-engine-adapter.ts`
- Create: `src/main/video-studio/engines/remotion-engine-adapter.ts`
- Create: `src/main/video-studio/engines/video-render-engine-registry.ts`
- Create: `src/main/video-studio/engines/hyperframes-engine-adapter.test.ts`

**Interfaces:**

- Consumes: `runProcess`, `spawnProcess` from `@orca/process-host`, `hydrateShellPathForAgentDetection` from `../../ipc/command-path/agent-detection-shell-path`, `resolveCommandOnLocalPath` from `../../ipc/command-path/command-path-resolver`, `buildLocalPreflightEnv` from `../../ipc/preflight/preflight-local-env`, and `VideoStudio*` types from `../../../shared/video-studio/video-studio-rpc-contract`.
- Produces:
  - `VideoRenderEngineAdapter` interface (`id`, `probeEnvironment`, `checkProject`, `startPreview`, `renderProject`)
  - `createHostVideoEngineDeps()`
  - `createHyperFramesEngineAdapter(deps)`
  - `remotionEngineAdapter` (reserved Phase 6 slot)
  - `getVideoRenderEngineAdapter(engine, deps?)` and `probeAllVideoRenderEngines(deps?)`

- [ ] **Step 1: Write failing adapter contract tests**

Create `src/main/video-studio/engines/hyperframes-engine-adapter.test.ts` testing with injected mock `VideoEngineProcessDeps`:

1. `probeEnvironment` reports missing tools (`hyperframes`, `ffmpeg`, or `node < 22`) clearly without failing/throwing when absent.
2. `probeEnvironment` runs `doctor --json` when `hyperframes` and `ffmpeg` are present and maps `.ok` cleanly.
3. `checkProject` invokes `['check', '--json']` and extracts structured errors/warnings/passed status.
4. `renderProject` invokes `['render', '--quality', quality, '--output', relativeOutputPath]` with `signal`, deletes incomplete output file when aborted/failed, verifies non-empty output file on success, and reads duration/dimensions via `ffprobe` when present (falling back to project config when `ffprobe` is absent).
5. `remotionEngineAdapter.probeEnvironment` returns `status: 'planned'`, `available: false`; calling `renderProject` throws `'video_studio_engine_unavailable'`.

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts --maxWorkers=2
```

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Implement unified adapter, HyperFrames adapter, Remotion slot, and host deps**

Implementation notes:

- In `createHostVideoEngineDeps()`:
  - Call `await hydrateShellPathForAgentDetection(undefined, true)` so retries see newly installed `hyperframes`/`ffmpeg`/`node` without restarting Orca.
  - Resolve `hyperframes` via `resolveCommandOnLocalPath('hyperframes', { env })`, falling back to `npx` (`resolveCommandOnLocalPath('npx', { env })`) only for check/render/preview when `hyperframes` binary itself isn't directly on PATH — wait: for `probeEnvironment`, distinguish direct `hyperframes` vs `npx --no-install hyperframes` so probing never triggers a slow remote npm download! Tell the user clearly in the status summary if neither local `hyperframes` nor `ffmpeg` is installed (`npm i -g hyperframes` / FFmpeg install hint).
  - Use `runProcess` for `doctor`, `check`, `render`, and `ffprobe` with `AbortSignal` support; use `spawnProcess` for long-lived `hyperframes preview` server with piped stdout/stderr to detect the bound `http://127.0.0.1:<port>...` URL and clean process tree termination on stop.
- Never pass `shell: true` anywhere.

- [ ] **Step 4: Run tests, format, and lint**

```powershell
corepack pnpm exec oxfmt --write src/main/video-studio/engines
corepack pnpm exec oxlint src/main/video-studio/engines
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/main/video-studio/engines
git commit -m "feat(video): add hyperframes render adapter and remotion slot"
```

---

### Task 4: Per-Project Job Manager, Preview Lifecycle & Revision Clock

**Files:**

- Create: `src/main/video-studio/video-studio-job-manager.ts`
- Create: `src/main/video-studio/video-studio-job-manager.test.ts`

**Interfaces:**

- Consumes: `RevisionClock` (from `../runtime/events/revisioned-state`), `VideoRenderEngineAdapter`, `VideoStudioCatalog`, composition path helpers.
- Produces:
  - `VideoStudioJobManager` (one instance per `profileDir` via `openVideoStudioJobManager(profileDir, deps?)` plus `disposeAllVideoStudioJobManagers()` for runtime shutdown):
    - `probeEngines()`
    - `getJobSnapshot(projectId)` / `listSnapshots()` / `revisions: RevisionClock` / `subscribe(listener)`
    - `getPreviewState(projectId)` / `startPreview(project)` / `stopPreview(projectId)`
    - `runCheck(project)` -> `Promise<VideoStudioCheckResult>`
    - `startRender(project, quality)` -> `Promise<VideoStudioRenderJobSnapshot>` (rejects with `'video_studio_job_already_running'` if another check/render is active for that project; rejects `'video_studio_engine_unavailable'` for Remotion)
    - `cancelProjectWork(projectId)` -> aborts active render/check, stops active preview, resolves to latest snapshot

- [ ] **Step 1: Write failing job manager tests**

Create `src/main/video-studio/video-studio-job-manager.test.ts` verifying:

1. Starting a second render while one is in flight for the same `projectId` rejects with `'video_studio_job_already_running'`, while a different `projectId` runs independently.
2. `cancelProjectWork(projectId)` triggers the adapter `AbortSignal`, transitions state to `'cancelled'`, and bumps the revision clock.
3. Completing a render appends a `VideoStudioRenderRecord` to the catalog and transitions job status to `'completed'`.
4. Log buffer stays bounded at 100 lines when an adapter emits >150 lines.
5. `disposeAll()` stops active renders and previews cleanly.

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-job-manager.test.ts --maxWorkers=2
```

Expected: FAIL because `video-studio-job-manager.ts` does not exist.

- [ ] **Step 3: Implement `VideoStudioJobManager`**

Write `src/main/video-studio/video-studio-job-manager.ts` implementing per-project single-active-job locking, bounded 100-line log ring, `RevisionClock` emission, preview process tracking, and clean abort/cleanup.

- [ ] **Step 4: Run tests, format, and lint**

```powershell
corepack pnpm exec oxfmt --write src/main/video-studio/video-studio-job-manager.ts src/main/video-studio/video-studio-job-manager.test.ts
corepack pnpm exec oxlint src/main/video-studio/video-studio-job-manager.ts src/main/video-studio/video-studio-job-manager.test.ts
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-job-manager.test.ts --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add src/main/video-studio/video-studio-job-manager.ts src/main/video-studio/video-studio-job-manager.test.ts
git commit -m "feat(video): add per-project render job and preview manager"
```

---

### Task 5: Runtime RPC Methods, Subscriptions, Output Chunking & Renderer Client

**Files:**

- Modify: `src/main/runtime/rpc/methods/video-studio/video-studio-methods.ts`
- Modify: `src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts`
- Modify: `src/main/runtime/rpc/server/runtime-rpc-mobile-method-routing.ts`
- Modify: `src/renderer/src/runtime/video-studio/video-studio-client.ts`
- Modify: `src/shared/rpc-contract/rpc-params-catalog.generated.ts` (via `corepack pnpm run generate:rpc-params-catalog`)

**Interfaces:**

- Consumes: `openVideoStudioCatalog`, `openVideoStudioJobManager`, `resolveVideoStudioProjectDir`, `resolveVideoStudioRenderOutputFile`, `scaffoldHyperFramesComposition`, `bindStructuredAgentSessionStream`, `subscribeRuntimeRpc`.
- Produces:
  - Full `VIDEO_STUDIO_METHODS` covering CRUD + `probeEngines`, `getCompositionState`, `scaffoldComposition`, `openCompositionWorkspace`, `checkComposition`, `startRender`, `cancelRender`, `subscribeJobs`, `startPreview`, `stopPreview`, `readRenderOutputChunk`.
  - `openCompositionWorkspace`: ensures scaffold exists, finds existing visible `FolderWorkspace` matching `projectDir` or ensures a `'Video Studio'` `ProjectGroup` + creates an ordinary `FolderWorkspace` for `projectDir`, returning `{ folderWorkspaceId, worktreeId }`.
  - `readRenderOutputChunk`: validates `project` + `renderId` exists in `project.renders`, opens `resolveVideoStudioRenderOutputFile(projectDir, record.fileName)`, reads `maxBytes` (<= 512 KiB) at `offset`, and returns base64 chunk + `totalBytes` + `eof` + `'video/mp4'`.
  - Typed client functions & `subscribeVideoStudioJobsForTarget` in `src/renderer/src/runtime/video-studio/video-studio-client.ts`.

- [ ] **Step 1: Write failing RPC method tests**

Extend `src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts` to test:

1. `videoStudio.scaffoldComposition` creates the project folder/template without returning filesystem paths in the RPC result.
2. `videoStudio.probeEngines` returns both `hyperframes` and `remotion` (`status: 'planned'`).
3. `videoStudio.startRender` with a Remotion project fails with `'video_studio_engine_unavailable'`.
4. `videoStudio.readRenderOutputChunk` rejects unknown `renderId` with `'video_studio_render_not_found'`, rejects oversized `maxBytes` with `'invalid_argument'`, and reads multi-chunk MP4 bytes accurately when a render record exists.
5. `videoStudio.openCompositionWorkspace` returns `{ folderWorkspaceId, worktreeId }` and is idempotent across repeated calls.

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts --maxWorkers=2
```

Expected: FAIL because the new RPC methods are not registered yet.

- [ ] **Step 3: Implement RPC methods, mobile routing allowlist/refusals, client wrappers, and regenerate RPC params catalog**

Implement the new methods in `src/main/runtime/rpc/methods/video-studio/video-studio-methods.ts`, wire `VIDEO_STUDIO_SUBSCRIBE_JOBS_METHOD` using `bindStructuredAgentSessionStream` + `jobManager.revisions` (matching `streamManagedRuntimeInstall`), update `VIDEO_STUDIO_MOBILE_METHODS` in `src/main/runtime/rpc/server/runtime-rpc-mobile-method-routing.ts`, add typed client calls & `subscribeVideoStudioJobsForTarget` in `src/renderer/src/runtime/video-studio/video-studio-client.ts`, and run `corepack pnpm run generate:rpc-params-catalog`.

- [ ] **Step 4: Run tests, format, lint & catalog verify**

```powershell
corepack pnpm run generate:rpc-params-catalog
corepack pnpm exec oxfmt --write src/main/runtime/rpc/methods/video-studio src/main/runtime/rpc/server/runtime-rpc-mobile-method-routing.ts src/renderer/src/runtime/video-studio
corepack pnpm exec oxlint src/main/runtime/rpc/methods/video-studio src/main/runtime/rpc/server/runtime-rpc-mobile-method-routing.ts src/renderer/src/runtime/video-studio
corepack pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/main/runtime/rpc/methods/video-studio src/main/runtime/rpc/server/runtime-rpc-mobile-method-routing.ts src/renderer/src/runtime/video-studio src/shared/rpc-contract/rpc-params-catalog.generated.ts
git commit -m "feat(video): expose hyperframes composition, render, and output RPCs"
```

---

### Task 6: Video Studio Production UI, Engine Controls, Preview & MP4 Player

**Files:**

- Create: `src/renderer/src/components/video-studio/use-video-studio-production.ts`
- Create: `src/renderer/src/components/video-studio/VideoStudioProductionPanel.tsx`
- Modify: `src/renderer/src/components/video-studio/video-studio-draft.ts`
- Modify: `src/renderer/src/components/video-studio/VideoStudioProjectForm.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioWorkflow.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioProjects.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioPage.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioPage.fixture.tsx`
- Modify: `mobile/src/host-screen/host-feature-browse-sheet.tsx`

**Interfaces:**

- Consumes: `videoStudio.*` client methods and `subscribeVideoStudioJobsForTarget` from `src/renderer/src/runtime/video-studio/video-studio-client.ts`, `useAppStore` (`setActiveWorktree`, `setActiveView`) to switch into an opened composition workspace.
- Produces:
  - `Engine` (`HyperFrames` / `Remotion (Planned — Phase 6)`) and `FPS` (`24` / `30` / `60`) selectors in `VideoStudioProjectForm.tsx`.
  - `VideoStudioProductionPanel.tsx` rendering:
    - Engine readiness banner (`HyperFrames CLI`, `Node 22+`, `FFmpeg`, `Recheck` button, install guidance when absent)
    - Composition actions (`Scaffold Composition`, `Open in Workspace`, `Run Check` + inline check findings, `Start Preview` / `Open Preview` / `Stop Preview`)
    - Render quality (`Draft` / `Looks` / `Delivery`), `Render MP4` / `Cancel` controls, live job status & collapsible logs, render history list, and chunk-loaded Blob `<video controls>` player + Save MP4 action (revoking object URLs cleanly on unmount/change).
  - Updated `VideoStudioPage.fixture.tsx` variants (`empty`, `research`, `script`, `production`, `productionToolsMissing`, `productionRendering`, `productionRendered`, `invalid`, `unavailable`).
  - Read-only `engine`, `fps`, and render count display in `mobile/src/host-screen/host-feature-browse-sheet.tsx`.

- [ ] **Step 1: Update draft parser and form (`engine` and `fps`)**

Update `video-studio-draft.ts` (`DEFAULT_FPS = 30`, `engine: 'hyperframes'`) and `VideoStudioProjectForm.tsx` using existing `Select` and `Label` primitives. Show Remotion with clear disabled/planned indication (`"Remotion (Phase 6)"`).

- [ ] **Step 2: Implement `use-video-studio-production.ts` controller hook**

Important constraints:

- Put all `try/finally` blocks in module-level async helper functions (`withBusyFlag`) so React Compiler compatibility (`check:react-compiler-compat-ratchet`) passes with zero bailouts.
- Avoid `show*('literal')` calls so `localization coverage` passes.
- Read MP4 chunks sequentially via `readRenderOutputChunkForTarget`, assemble a `Blob(..., { type: 'video/mp4' })`, expose `videoUrl` via `URL.createObjectURL`, and revoke previous object URLs on project/render switch or unmount.
- On `openCompositionWorkspace`, call `openVideoStudioCompositionWorkspaceForTarget`, reload repos/folders if needed, and activate `worktreeId` + `setActiveView('workspaces')`.

- [ ] **Step 3: Build `VideoStudioProductionPanel.tsx`, wire into `VideoStudioProjects.tsx` & `VideoStudioWorkflow.tsx`, update mobile browse, and add fixture variants**

Follow `docs/STYLEGUIDE.md`: use `bg-card`, `border-border`, `text-card-foreground`, `text-muted-foreground`, `Button`, `Select`, `LoadingSpinner`, Lucide icons, `min-h-11 @lg:min-h-9` touch targets, `aria-live` / `role="status"` / `role="alert"` for job states, and no horizontal scroll on narrow widths.

- [ ] **Step 4: Sync i18n catalogs, format, lint & typecheck**

```powershell
corepack pnpm run sync:localization-catalog
corepack pnpm run sync:mobile-localization
corepack pnpm exec oxfmt --write src/renderer/src/components/video-studio mobile/src/host-screen
corepack pnpm exec oxlint src/renderer/src/components/video-studio mobile/src/host-screen
corepack pnpm tc:web
```

Also run `corepack pnpm run typecheck` inside `mobile/` to verify `mobile/src/host-screen/host-feature-browse-sheet.tsx`.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/renderer/src/components/video-studio src/renderer/src/i18n/locales/en.json mobile/src/host-screen mobile/src/i18n/locales/en.json
git commit -m "feat(video): add hyperframes composition, preview, and render UI"
```

---

### Task 7: Visual Fixtures, Focused Suite & Repository Gate

**Files:**

- Modify only files required to fix validation findings.

- [ ] **Step 1: Capture and inspect Video Studio fixture screenshots**

```powershell
$env:ORCA_BACKGROUND_LAUNCH="1"
corepack pnpm fixtures:shot video-studio/VideoStudioPage --theme both
```

Inspect desktop and narrow screenshots across `productionToolsMissing`, `productionRendering`, and `productionRendered` against `docs/styleguide/ux-review-rubric.md` (no horizontal overflow, 44px narrow controls, clear status hierarchy).

- [ ] **Step 2: Run all focused Video Studio & Mobile tests**

```powershell
corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-project.test.ts src/main/video-studio/video-studio-catalog.test.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts src/main/video-studio/video-studio-job-manager.test.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts --maxWorkers=2
```

And in `mobile/`:

```powershell
corepack pnpm exec vitest run src/host-screen/host-general-chat-replies.test.ts --maxWorkers=2
```

- [ ] **Step 3: Run verification ratchets and full repository gate**

```powershell
corepack pnpm check:react-compiler-compat-ratchet
corepack pnpm tc:node
corepack pnpm tc:web
corepack pnpm check:changed --base=main
```

Note: If Windows native C++ Build Tools remain unavailable on this machine for `ensure-native-runtime` (`node-pty`), record the exact native unit-test/Electron CDP blocker transparently while confirming all JS tests, typechecks, lint, formatting, ratchets, and i18n checks pass.

- [ ] **Step 4: Commit any validation polish**

```powershell
git add -A
git commit -m "fix(video): polish hyperframes integration validation"
```

---

## Spec Coverage Self-Review

- Backward-compatible schema (`engine`, `fps`, `renders`) -> Task 1 & Task 2.
- Host-owned composition folder (`project.json`, `hyperframes.json`, `index.html`, `scenes/`, `assets/`, `renders/`) + path containment + deletion cleanup -> Task 2.
- Workspace opening (`FolderWorkspace`) without renderer path assembly -> Task 5 & Task 6.
- Cross-platform `@orca/process-host` adapter + `HyperFramesEngineAdapter` + reserved `RemotionEngineAdapter` -> Task 3.
- Per-project job locking, bounded logs, `RevisionClock` streaming, `AbortSignal` cancel, shutdown cleanup -> Task 4 & Task 5.
- Bounded-chunk MP4 reading (`readRenderOutputChunk`) + `<video controls>` playback & download -> Task 5 & Task 6.
- Production UI, mobile read-only metadata, localization sync, fixtures, and repository gate -> Task 6 & Task 7.
