# Orca AI Video Studio — Engine-Agnostic Consistency Foundation & HyperFrames 0.9.94 Alignment Design

**Date:** 2026-11-26  
**Branch / Worktree:** `feature/orca-ai-studio` (`.worktrees/orca-ai-studio`)  
**Parent Specs:**

- [General Chat and Video Studio Foundation Design](./2026-11-23-general-chat-video-studio-design.md)
- [Video Studio HyperFrames Integration and Render Engine Contract](./2026-11-25-video-studio-hyperframes-design.md)
- [General Chat Web Search, Deep Research & Video Studio Handoff](./2026-11-25-general-chat-web-search-deep-research-design.md)

---

## 1. Architecture Overview

Orca AI Studio is a unified desktop and remote-capable application combining **Coding Workspace**, **General Chat**, and **AI Video Studio** on top of Orca's shared AI infrastructure (agent orchestration, models, skills, MCP, research, and host runtime RPC).

This specification defines the **Engine-Agnostic File-First Architecture with HyperFrames-Native Implementation** for Video Studio, spanning Roadmap **Phase 02 (HyperFrames Native Integration refinements)** and **Phase 03 (Video Core & Consistency Foundation)**:

```text
01 Orca Application Foundation        [Done]    Desktop app, workspace, runtime RPC
02 HyperFrames Native Integration     [Now]     CLI 0.9.94 contract alignment, modular scaffold, preview manager
03 Video Core & Consistency           [Now]     Engine-agnostic Style Profile, Storyboard, Master Asset Registry, Inspector
04 OpenMotion Native Integration      [Next]    Motion Package importer, Motion Library, Reference Analyzer, Templates, Gateway
05 AI Creative Director & Runner      [Next]    Automated multi-agent production, research-to-video, TTS/captions pipeline
06 Remotion & Universal Motion        [Next]    Remotion runtime adapter, React compositions, multi-engine routing
07 Advanced Visual Production         [Later]   2.5D/3D (Three.js/Blender), simulation engine, camera & technical rigging
08 Unified Production Studio          [Later]   Master timeline, cross-engine compositing, automated QC, batch production
```

### Architectural Stack

```text
+-----------------------------------------------------------------------------+
| Orca Application (Electron + Web + Mobile Browse)                           |
|   Coding Workspace   |   General Chat (Research)   |   Native Video Studio  |
+-----------------------------------------------------------------------------+
| Orca Video Core (Engine-Agnostic)                                           |
|   Project Service · Dual-Scope Style Profiles · Structured Storyboard       |
|   Master Asset Registry · Motion Registry Contracts · Preview Manager       |
|   Multi-File Transaction & Conflict Detection · Research Handoff Store      |
+-----------------------------------------------------------------------------+
| Universal Engine Adapter Interface (VideoEngineAdapter)                     |
|   probe · inspect · validate · startPreview · stopPreview · render · cancel |
+-------------------------+---------------------------+-----------------------+
| HyperFrames Adapter     | Remotion Adapter          | 3D / Future Adapters  |
| (Active — CLI 0.9.94)   | (Planned — Phase 06)      | (Planned — Phase 07)  |
+-------------------------+---------------------------+-----------------------+
| OpenMotion Extension Points                                                 |
|   Motion Package Adapter · Motion Library Registry · Production Skills      |
+-----------------------------------------------------------------------------+
```

Core principles:

1. **Application-first:** Orca remains the single host application with its native UI (`docs/STYLEGUIDE.md`, `main.css` tokens, `components/ui/`), Runtime RPC (`RuntimeClientTarget`), and `@orca/process-host`.
2. **File-first:** Every creative and source artifact lives in inspectable files inside the project directory so both the Structured Inspector UI and Orca coding agents can read and edit the same workspace.
3. **Engine-agnostic core:** `VideoStudioProject`, Style Profiles, Storyboard, Master Asset Registry, Motion Registry contracts, and Structured Inspector depend on engine-neutral schemas and `VideoEngineAdapter`, never directly on HyperFrames HTML internals.
4. **HyperFrames-native first:** HyperFrames `0.9.94` is the active primary implementation, using modular `<template>` sub-compositions under `compositions/` while reserving clean directory and contract slots for Remotion, OpenMotion, and multi-engine compositing.

---

## 2. Goals and Non-Goals

### Goals (In Scope)

- Align `HyperFramesEngineAdapter` and CLI parsers with real **HyperFrames `0.9.94`** behavior (`doctor --json`, `check --json`, `preview --foreground --json --no-open`, `@hf-progress` render output, official `hyperframes.json` layout) with exact version pinning and captured CLI fixture contract tests.
- Evolve `VideoRenderEngineAdapter` into `VideoEngineAdapter` with capability declarations and a 5-state `ValidationReport` (`passed`, `failed`, `partial`, `error`, `unsupported`) cleanly separated from `productionGate`.
- Transition project scaffolding to modular HyperFrames compositions (`compositions/*.html` + `compositions/components/`) plus Orca's engine-agnostic directory layout (`.orca/`, `styles/`, `assets/{objects,characters,environments,graphics,models,audio,video}/`, `references/`), preserving backward compatibility for Stage 1/2 projects.
- Implement **Dual-Scope Style Profiles** (`Built-in presets`, `User Host Library`, and immutable/versioned `Project Snapshots`) with canonical ownership in `styles/style-profile.json` and validated synchronization/reconciliation with `frame.md`, `DESIGN.md`, and `MOTION.md`.
- Implement **Structured Storyboard** (`STORYBOARD.md`) with permanent `scene_id` across reorders/renames, optional engine/motion/asset/camera/narrative metadata, and _planned vs actual_ composition drift detection.
- Implement **Master Asset Registry** (`assets/asset-registry.json` + Host Asset Library) supporting flexible asset types, arbitrary per-asset state maps, structured animatable `components`, content hashes, dependency tracking, provenance, and licensing metadata.
- Provide complete typed RPC contracts, a responsive **Structured Inspector** across `Research`, `Script`, and `Production`, and mobile read-only parity.
- Implement **Preview Session Manager** with verified OS process identity, port ownership, conditional `--force-new`, and orphan cleanup.
- Implement **per-project and shared-library concurrency control**, multi-file transaction journal with startup crash recovery, `expectedRevision` conflict detection, and strict Windows-safe security boundaries.
- Define documented **extension points** and an **Upstream Feature Integration Matrix** for OpenMotion, Remotion, and Universal Motion Registry.

### Non-Goals (Explicitly Deferred)

- Executing full Remotion bundling/rendering or `@remotion/player` runtime (Phase 06).
- Automated OpenMotion `Motion Package` archive/ZIP importer or extraction of OpenMotion UI components (Phase 04).
- Automated multi-agent production loops (`Creative Director` / `Agent Runner` / `Reference Video Analyzer` / auto-QC fix loop) (Phases 04–05).
- Full interactive multi-track visual timeline / keyframe curve editor in React (Phases 06–08); timing truth remains in compositions on disk during Phase 02–03.
- Cross-engine alpha-channel compositing or runtime simulation/rigging engines (Phases 07–08).
- Direct embedded Chromium/Electron guest preview rendering inside Orca renderer (targeted for Phase 04+ once dedicated isolated guest transport and remote port tunneling are designed; Phase 02–03 uses validated external browser preview + chunked MP4 playback).

---

## 3. Module Boundaries

| Layer                | Directory / Package                                                                   | Responsibility                                                                                                                                    | Must NOT Depend On                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Shared Contracts     | `src/shared/video-studio/`                                                            | Zod schemas (`import * as z from 'zod'`), types, normalization, migration helpers, diff types                                                     | Node `fs`, Electron, React, engine CLIs                                                          |
| Orca Video Core      | `src/main/video-studio/`                                                              | Catalog, Style Library, Asset Library, Document parsers/patchers, Transaction journal, Conflict detection, Preview Session Manager, Job Manager   | Electron UI, React, HyperFrames HTML parsing internals                                           |
| Engine Adapters      | `src/main/video-studio/engines/`                                                      | `VideoEngineAdapter` contract, `HyperFramesEngineAdapter` (`0.9.94`), reserved `RemotionEngineAdapter`, host process deps                         | Renderer state, Electron `BrowserWindow`, direct `child_process` (must use `@orca/process-host`) |
| General Chat Bridge  | `src/main/general-chat/research/`                                                     | Seeding `BRIEF.md`, `references/sources.json`, and `references/research-notes.md` on handoff                                                      | Video rendering or engine CLI calls                                                              |
| Runtime RPC          | `src/main/runtime/rpc/methods/video-studio/`                                          | Zod-validated RPC methods, `RevisionClock` stream events, workspace handoff, mobile allowlisting                                                  | Renderer DOM, raw OS paths exposed to client                                                     |
| Renderer Client & UI | `src/renderer/src/runtime/video-studio/`, `src/renderer/src/components/video-studio/` | Typed RPC client, controller hooks (React Compiler clean), Structured Inspector (`Research`/`Script`/`Production`), conflict & validation banners | `node:fs`, `node:path`, raw filesystem paths, `dangerouslySetInnerHTML`                          |
| Mobile Browse        | `mobile/src/host-screen/`                                                             | Read-only host browsing of projects, style summary, storyboard count, renders                                                                     | Mutating RPCs, SSH execution, desktop-only Zod locales                                           |

---

## 4. Data Ownership and Single Source of Truth

Each artifact inside `<profileDir>/video-studio/projects/<projectId>/` has one authoritative owner so UI editing and coding-agent editing never create competing truths:

| File                           | Authoritative Owner                                     | Content & Responsibility                                                                                                                                                                                     | Edit Mechanism                                                                                               |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `project.json`                 | Orca Video Core                                         | Portable project metadata (`id`, `title`, `aspectRatio`, `durationSeconds`, `fps`, `engine`, `styleProfileId`, `workflowStage`)                                                                              | Synced on project CRUD & style attach                                                                        |
| `.orca/schema-version.json`    | Orca Video Core                                         | Project directory layout `schemaVersion` (`2`) and migration timestamps                                                                                                                                      | Managed on scaffold/migration                                                                                |
| `.orca/project-state.json`     | Orca Runtime Cache (non-portable, gitignored)           | Local preview session runtime state (`sessionId`, `pid`, `creationTimeMs`, `port`, `startedAt`) & transaction recovery markers                                                                               | Runtime process lifecycle only; never treated as source truth across hosts                                   |
| `.orca/tx.log`                 | Orca Transaction Manager                                | Transient write-ahead journal during multi-file commits, removed on commit completion                                                                                                                        | Transaction engine & startup recovery only                                                                   |
| `styles/style-profile.json`    | **Canonical Structured Style Source** (Orca Video Core) | Structured visual, typography, camera, motion, effects, composition, and subtitle tokens + snapshot provenance (`sourceStyleId`, `version`)                                                                  | Structured Inspector / Style Service (`expectedRevision`)                                                    |
| `frame.md`                     | HyperFrames Creative Spec                               | YAML frontmatter (tokens mirrored from `style-profile.json` in HyperFrames format) + freeform design prose                                                                                                   | Targeted frontmatter patch + Markdown reconciliation detection                                               |
| `DESIGN.md`                    | OpenMotion / Brand Context                              | Visual identity philosophy, brand notes, and OpenMotion package compatibility prose                                                                                                                          | Targeted metadata sync + freeform prose preserved                                                            |
| `MOTION.md`                    | OpenMotion Motion Language Spec                         | Motion rules, camera language, pacing notes, transition vocabulary, creative directives                                                                                                                      | Targeted header/rule block sync + freeform prose preserved                                                   |
| `BRIEF.md`                     | Production Intent (`hyperframes` compatible)            | YAML frontmatter (`workflow`, `flow`, `storyboard`, `message`, `aspect`, `length`, `audience`, `language`) + `## Intent`, `## Assets`, `## Notes`                                                            | Targeted frontmatter/section update (`expectedRevision`)                                                     |
| `STORYBOARD.md`                | **Canonical Scene Planning Source**                     | Ordered `## Frame N — Title` blocks with permanent `scene_id`, `status`, `duration`, `transition_in`, `engine`, `src`, `assets`, `voiceover`, `motion_presets`, `camera`, `narrative_role`, plus `## Locked` | Parsed via HyperFrames-compatible lenient parser; patched per `scene_id` block                               |
| `SCRIPT.md`                    | Final TTS Narration (optional)                          | Locked narration script used when TTS voiceover is generated; distinct from advisory `voiceover` lines in `STORYBOARD.md`                                                                                    | Written/edited during scripting or TTS workflows                                                             |
| `assets/asset-registry.json`   | **Canonical Asset Metadata Source**                     | Asset IDs, versions, types, custom states, structured `components`, hashes, dependencies, provenance, licenses                                                                                               | Asset Registry service (`expectedRevision`)                                                                  |
| `references/sources.json`      | Research Provenance Store                               | Structured source records (`id`, `url`, `title`, `domain`, `accessedAt`, `claimIds`, `verificationStatus`, `origin`)                                                                                         | General Chat handoff / user research verification                                                            |
| `references/research-notes.md` | Research Context Prose                                  | Synthesized findings and open questions from General Chat / user research                                                                                                                                    | Read/edited as Markdown reference                                                                            |
| `hyperframes.json`             | HyperFrames CLI Config                                  | `$schema`, `registry`, `paths` (`blocks: "compositions"`, `components: "compositions/components"`, `assets: "assets"`), `media.autoProxy`                                                                    | HyperFrames CLI / scaffold initialization                                                                    |
| `meta.json`                    | HyperFrames Project Metadata                            | `{ id, name, createdAt }` expected by HyperFrames CLI                                                                                                                                                        | Scaffold initialization                                                                                      |
| `package.json`                 | HyperFrames Workspace Scripts                           | Scripts (`check`, `preview`, `render`) and pinned engine metadata (`"engines": { "hyperframes": "0.9.94" }`)                                                                                                 | Scaffold initialization                                                                                      |
| `index.html`                   | **Canonical HyperFrames Root Composition**              | Root timeline shell mounting `compositions/*.html` via `data-composition-src` and `data-track-kind`                                                                                                          | Scaffolded once; edited by coding agent / HyperFrames Studio; **never overwritten** unless `overwrite: true` |
| `compositions/*.html`          | **Canonical Scene Animation Source**                    | Actual `<template>` sub-compositions, DOM/SVG/GSAP motion, actual durations & assets used                                                                                                                    | Edited by coding agent / HyperFrames Studio; **never regenerated from JSON**                                 |
| `renders/`                     | Output Artifacts                                        | Rendered MP4/WebM/etc. outputs tracked in `VideoStudioProject.renders`                                                                                                                                       | Render job manager only                                                                                      |

### Bidirectional Style Reconciliation Rules

1. `styles/style-profile.json` is the canonical structured token source read by UI Inspector and future engine adapters.
2. When the user saves tokens through Structured Inspector, Orca executes a multi-file transaction updating `styles/style-profile.json` plus the managed YAML frontmatter/header tokens in `frame.md`, `DESIGN.md`, and `MOTION.md` while **preserving all manual prose sections**.
3. If an external editor or Orca coding agent edits the managed tokens inside `frame.md`, `DESIGN.md`, or `MOTION.md` directly on disk (causing their token projection to diverge from `styles/style-profile.json`), Orca computes a **Reconciliation Diff** (`videoStudio.getStyleReconciliationDiff`) and surfaces two explicit user choices in UI without silent overwrite:
   - **Import Markdown changes into Style Profile JSON** (adopts agent's edits into `style-profile.json` and aligns sibling markdown files), or
   - **Re-apply Style Profile JSON to Markdown** (re-syncs managed frontmatter/header tokens from JSON while preserving prose).

### Planned vs Actual Composition State

`STORYBOARD.md` records **planned** intent (`duration`, `transition_in`, `assets`, `motion_presets`, `status`). `VideoEngineAdapter.inspect()` inspects `index.html` and `compositions/*.html` to produce **actual** composition telemetry (`actualTotalDurationSeconds`, per-file durations, mounted `data-composition-src` paths, referenced asset paths, missing files). Orca computes a non-blocking `CompositionDriftReport` per scene (`scene_id` / `src` match) showing duration mismatches, unmounted scenes, or missing referenced assets.

---

## 5. Engine Adapter Contracts

### Extended `VideoEngineAdapter` Interface

Located in `src/main/video-studio/engines/video-render-engine.ts`:

```ts
export type EngineCapabilities = {
  supportsPartialRender: boolean
  supportsPreviewServer: boolean
  supportsStructuredCheck: boolean
  supportsFrameSeeking: boolean
  supportsTransparentOutput: boolean
  supportsImageSequence: boolean
  supportsParametricComposition: boolean
  supportsAudio: boolean
  supportedFormats: readonly string[] // e.g. ['mp4', 'webm', 'mov', 'gif', 'png-sequence', 'hls']
  supportedAssetTypes: readonly AssetType[]
}

export type ValidationStatus = 'passed' | 'failed' | 'partial' | 'error' | 'unsupported'

export type ValidationReport = {
  status: ValidationStatus
  engine: VideoStudioEngine
  engineVersion?: string
  inputFingerprint: string // SHA-256 over entry HTML, compositions/scenes, hyperframes.json, style-profile.json, asset-registry.json
  revisions?: {
    compositionSha256: string
    styleSha256?: string
    assetsSha256?: string
  }
  stale?: boolean // True when current workspace inputFingerprint differs from when this report ran
  findings: VideoStudioCheckFinding[]
  skippedChecks: string[]
  sectionStatuses: Record<
    string,
    { status: ValidationStatus; errorCount: number; warningCount: number }
  >
  productionGate: {
    allowed: boolean
    blockingReasons: string[]
  }
  summary: string
  checkedAt: number
  durationMs?: number
}

export interface VideoEngineAdapter {
  readonly id: VideoStudioEngine
  readonly targetVersion: string // e.g. '0.9.94' for hyperframes
  capabilities(): EngineCapabilities
  probe(deps: VideoEngineProcessDeps): Promise<EnvironmentReport>
  scaffold(
    projectDir: string,
    project: VideoStudioProject,
    options?: { overwrite?: boolean; styleSnapshot?: StyleProfileSnapshot }
  ): Promise<VideoStudioCompositionState>
  inspect(
    projectDir: string,
    project: VideoStudioProject,
    preview?: VideoStudioPreviewState
  ): Promise<VideoStudioCompositionState>
  validate(
    projectDir: string,
    deps: VideoEngineProcessDeps,
    signal?: AbortSignal
  ): Promise<ValidationReport>
  startPreview(
    projectDir: string,
    projectName: string,
    deps: VideoEngineProcessDeps,
    onExit: () => void,
    options?: { forceNew?: boolean; signal?: AbortSignal }
  ): Promise<VideoStudioPreviewHandle>
  stopPreview(
    projectDir: string,
    session: { handle?: VideoStudioPreviewHandle; pid?: number; port?: number },
    deps: VideoEngineProcessDeps
  ): Promise<void>
  render(
    projectDir: string,
    request: VideoRenderRequest,
    deps: VideoEngineProcessDeps,
    onProgress: (update: VideoRenderProgressUpdate) => void,
    signal?: AbortSignal
  ): Promise<VideoStudioRenderRecord>
}
```

### Validation Status, Precedence, Freshness & Production Gate Semantics

- **Strict Precedence Order (highest to lowest):** `unsupported` -> `error` -> `failed` -> `partial` -> `passed`.
- `unsupported`: Engine adapter does not implement structured check (`remotion` planned slot). `productionGate.allowed = false`.
- `error`: Engine validator process crashed, timed out, returned an unparseable failure payload, or failed invocation/CLI usage. `productionGate.allowed = false`.
- `failed`: Validator executed and reported one or more error-level findings (`errorCount > 0`), **regardless** of whether optional or browser checks were skipped. `productionGate.allowed = false`.
- `partial`: Validator executed with **zero** error-level findings (`errorCount === 0`), **and** one or more requested checks did not execute (e.g., `browserSkipped === true` or an audit section was skipped/unavailable). **CLI exit success (`ok: true` / exit code `0`) alone never implies `partial`**; when all requested checks run with zero errors, status is `passed`. `productionGate.allowed` is `false` when production policy requires skipped audits (e.g., `browserSkipped: true` appends `'Required browser layout/contrast audit was skipped'` to `blockingReasons`), while keeping `status` cleanly distinct from `failed`.
- `passed`: All requested checks executed and `errorCount === 0` (`browserSkipped !== true`). `productionGate.allowed = true` (subject to freshness check below).
- **Freshness & Input Fingerprinting:** Every `ValidationReport` records `inputFingerprint` (SHA-256 across `index.html`, `compositions/*.html` / `scenes/*.html`, `hyperframes.json`, `styles/style-profile.json`, and `assets/asset-registry.json`). Before honoring `productionGate.allowed` for final delivery render or displaying a cached check badge, Orca recomputes the project's current `inputFingerprint`; if it changed since `checkedAt`, the cached report is flagged `stale: true` and `productionGate` blocks delivery until validation re-runs against the current revision.

### HyperFrames `0.9.94` CLI Alignment Fixes

1. **Exact Version Pinning (`0.9.94`):**
   - Adapter declares `HYPERFRAMES_PINNED_VERSION = '0.9.94'` and verifies **exact semver string equality** (`detectedVersion === '0.9.94'`) — comparing only major/minor versions is explicitly rejected as unverified.
   - Declaring `package.json` `engines` alone does not pin a dependency. Orca resolves the executable deterministically from an Orca-managed/lockfile-pinned `hyperframes@0.9.94` runtime installation first (or an explicit pinned binary path in `node_modules/.bin/hyperframes` / configured runtime dir) before falling back to PATH `hyperframes`, never relies on unpinned `npx latest`, and never auto-installs silently.
   - `probe()` checks `node >= 22`, `ffmpeg`, `ffprobe`, and `hyperframes` via deterministic binary resolution + `--version` / `doctor --json` (`checks[]` case-insensitive on `'FFmpeg'`, `'FFprobe'`, `'Chrome'`, `'Node.js'`, `'Version'` plus `_meta.version`).
   - Any detected CLI version other than `'0.9.94'` (whether newer or older) is marked `compatibility: 'unverified'` in `probe()` and surfaced as an explicit warning/gate note until contract compatibility is proven against that exact version's CLI schema and fixtures.
2. **Dynamic `check --json` Parser:**
   - Parses known sections (`lint`, `runtime`, `layout`, `motion`, `contrast`, `craft`, `audio`, `hdr`) **and any unknown top-level section object** that contains `findings: unknown[]` or `errors`/`warnings` arrays, preventing silent blind spots when HyperFrames adds new audit categories.
   - Reads `browserSkipped`, `scope` / `components`, and `snapshots.files` / `snapshots.findingFiles`.
   - Preserves `fixHint` and `suggestedColor` in `ValidationFinding` for Inspector display.
3. **Preview Command & URL Extraction:**
   - Spawns `hyperframes preview --foreground --json --no-open` (adding `--force-new` **only** when Preview Session Manager explicitly requests replacing a stale/unhealthy session).
   - Parses `LifecyclePayloadSchema`: `{ schemaVersion: 1, operation: 'start', ok: true, result: { state, mode, projectName, projectDir, host, port, pid, serverUrl, studioUrl, ready } }`, resolving `studioUrl` / `serverUrl` safely and verifying loopback origin (`127.0.0.1` / `localhost`).
4. **Render Progress & Partial Render Readiness:**
   - Parses `@hf-progress <json>` lines emitted in non-TTY stdout (`pct`, stage metadata), in addition to plain percentage/stage fallback.
   - Supports optional `startSeconds` / `endSeconds` fields on `VideoRenderRequest` mapping to `--start` / `--end` when `capabilities().supportsPartialRender` is enabled (preserving existing full-video UI behavior in Phase 02–03 while keeping the adapter ready for selective re-render).
5. **CLI Contract Test Fixtures:**
   - Real stdout/stderr samples captured from `hyperframes 0.9.94` (`doctor`, `check`, `preview`, `render`) will be stored as deterministic unit-test fixtures so parser expectations are verified against authentic CLI output rather than synthetic guesses.

### Reserved `RemotionEngineAdapter`

- Keeps `id: 'remotion'`, `targetVersion: 'planned'`, `capabilities()` reporting `false` / `[]` honestly without mocks.
- `probe()` returns `status: 'planned'`, `available: false`.
- `validate()` returns `ValidationReport` with `status: 'unsupported'` and `productionGate: { allowed: false, blockingReasons: ['Remotion runtime is scheduled for Phase 06.'] }`.
- `scaffold()`, `startPreview()`, and `render()` reject with `'video_studio_engine_unavailable'`.

---

## 6. Project Layout, Data Schemas, and Versioning

### Complete Project Directory Layout

```text
<profileDir>/video-studio/
├── video-studio-projects.json          # Atomic project index catalog
├── security/                           # Host-managed security & runtime authority (outside project dirs)
│   ├── trust-store.json                # Execution approval state keyed by (projectId, projectRootRealpath)
│   └── preview-sessions.json           # Host-verified active preview PID/exe/port/session records
├── styles/                             # Host User Style Library (versioned/reusable)
│   └── <styleId>/
│       ├── style-profile.json
│       ├── frame.md
│       ├── DESIGN.md                   # Preserved when style carries design philosophy / OpenMotion context
│       └── MOTION.md
├── assets/                             # Host Reusable Asset Library (immutable published versions v<n>/)
│   ├── library.json
│   └── <assetId>/v<n>/...
└── projects/
    └── <projectId>/
        ├── project.json                # Portable Orca project metadata
        ├── meta.json                   # Native HyperFrames project metadata
        ├── hyperframes.json            # HyperFrames v0.9.94 config (paths.blocks: "compositions")
        ├── package.json                # Scripts + engines.hyperframes: "0.9.94"
        ├── .gitignore                  # Ignores .orca/project-state.json, .orca/tx.log, renders/
        ├── .orca/
        │   ├── schema-version.json     # { "schemaVersion": 2, "migratedAt": ... }
        │   ├── project-state.json      # Non-portable local runtime preview PID/port state
        │   └── tx.log                  # Transient multi-file commit recovery journal
        ├── BRIEF.md                    # Production brief (HyperFrames format)
        ├── frame.md                    # HyperFrames design spec (YAML frontmatter + prose)
        ├── DESIGN.md                   # OpenMotion-compatible brand/design prose
        ├── MOTION.md                   # Motion rules & creative directives
        ├── STORYBOARD.md               # Canonical scene plan with permanent scene_id
        ├── SCRIPT.md                   # Optional locked narration script for TTS
        ├── styles/
        │   └── style-profile.json      # Canonical structured style tokens + snapshot metadata
        ├── assets/
        │   ├── asset-registry.json     # Master Asset Registry (flexible types/states/components)
        │   ├── objects/
        │   ├── characters/
        │   ├── environments/
        │   ├── graphics/
        │   ├── models/
        │   ├── audio/
        │   └── video/
        ├── references/
        │   ├── sources.json            # Structured research sources & verification status
        │   └── research-notes.md       # Synthesized research notes
        ├── index.html                  # HyperFrames root composition (thin slot orchestrator)
        ├── compositions/
        │   ├── 01-opening.html         # <template> sub-composition
        │   └── components/             # Reusable HTML/SVG components
        └── renders/                    # Local rendered outputs
        # Reserved for Phase 06–08 (not created in Phase 02–03):
        # ├── remotion/ (Root.tsx, compositions/, components/)
        # ├── timeline.json
        # └── intermediate/
```

### Schema Contracts (Engine-Agnostic, Zod-Validated)

#### A. Style Profile (`styles/style-profile.json`)

### Style & Asset Identity, Versioning & Snapshot Model

Both Style Profiles and Master Assets share strict separation between identity, contract schema, immutable library publication, and local project edits:

- **`id` (Logical Identity):** Permanent slug identifying the semantic style or entity across projects (e.g., `technical-explainer-01`, `ac_indoor_001`).
- **`schemaVersion`:** Structural contract revision (`1`) governing JSON validation and migrations.
- **`version` (Published Version):** Monotonic immutable integer (`1, 2, ...`) assigned inside the Host Library (`styles/<styleId>/` or `assets/<assetId>/v<n>/`). Once published, a library version `v<n>` is immutable and NEVER silently mutated in place.
- **`snapshotRevision` / `sourceVersion` (Project Snapshot Revision):** Local project-scoped copy (`styles/style-profile.json`, `assets/asset-registry.json`) tracking the source Host Library `id` + `version` plus its local SHA-256 / monotonic edit count. Editing a project snapshot updates only the project files and never mutates the Host Library; updating the Host Library (`v<n+1>`) never alters existing project snapshots.
- **`asset state` vs `asset instance`:** Inside an asset, `states[stateName]` defines named, verified visual/animation files (`closed`, `cutaway`, `operating`), whereas scene usage in `STORYBOARD.md` / `compositions/*.html` instantiates an `AssetInstanceRef` (`{ assetId, state, sceneId, overrides? }`).

When saving or applying a Host Library Style (`styles/<styleId>/`), `DESIGN.md` is stored alongside `style-profile.json`, `frame.md`, and `MOTION.md` whenever present or customized so design philosophy and OpenMotion-compatible tokens travel cleanly across projects.

```ts
type StyleProfileTier = 'built-in' | 'library' | 'snapshot'

type StyleProfile = {
  schemaVersion: 1
  id: string
  version: number
  snapshotRevision?: string
  name: string
  description: string
  category: string // e.g. 'technical-explainer', 'editorial', 'infographic', 'product-showcase', 'storytelling'
  tier: StyleProfileTier
  provenance?: {
    sourceStyleId: string
    sourceTier: 'built-in' | 'library'
    sourceVersion: number
    appliedAt: number
  }
  visual: {
    palette: {
      background: string
      surface: string
      primaryText: string
      secondaryText: string
      accentPrimary: string
      accentSecondary?: string
      highlight?: string
      border?: string
    }
    lighting: string // e.g. 'soft-neutral', 'high-contrast', 'flat-editorial'
    renderingStyle: string // e.g. '2.5d-semi-realistic', 'flat-vector', 'editorial-print'
    cornerRadiusPx: number
  }
  typography: {
    displayFont: string
    bodyFont: string
    monoFont: string
    titleWeight: number
    bodyWeight: number
    headingScale: 'compact' | 'balanced' | 'poster'
  }
  camera: {
    projection: 'orthographic' | '2.5d' | '2d-flat' | 'perspective'
    allowedMoves: string[] // e.g. ['pan', 'zoom', 'match-cut']
    framingRule: string
  }
  motion: {
    pacing: 'snappy' | 'measured' | 'calm' | 'energetic'
    defaultEasing: string
    transitionVocabulary: string[]
    motionPresetRefs: string[] // References Universal Motion Registry IDs
  }
  effects: {
    allowedEffects: string[] // e.g. ['airflow', 'callout', 'motion-blur']
    bannedEffects: string[] // e.g. ['neon-glow', 'heavy-drop-shadow']
  }
  composition: {
    headerZonePercent: number
    focalZonePercent: number
    actionSafePercent: number // default 90
    titleSafePercent: number // default 80
  }
  subtitle: {
    mode: 'word-highlight' | 'anchor-rail' | 'none'
    backgroundColor: string
    textColor: string
    highlightColor: string
    position: 'bottom' | 'lower-third'
  }
  openMotionPackageRef?: {
    packageId: string
    version: string
    manifestHash?: string
  }
}
```

Built-in read-only presets shipped with Orca:

1. `technical-explainer-01` (v1) — 2.5D semi-realistic technical illustration, cream/beige/charcoal/yellow/blue/orange palette, bold sans-serif, orthographic pan/zoom camera, word-by-word yellow-highlighted black-pill subtitles.
2. `clean-editorial-01` (v1) — General-purpose editorial/infographic look (neutral warm paper, serif/sans display + clean mono data, measured fades & slide reveals, lower-third anchor-rail subtitles) so non-technical topics are first-class out of the box.

#### B. Structured Storyboard (`STORYBOARD.md`)

Compatible with HyperFrames `@hyperframes/core/storyboard` while extending per-frame `extra` fields with Orca's permanent identity:

```markdown
---
format: 1080x1920
duration: 60s
message: 'How heat transfer drives AC power consumption'
arc: Hook -> Mechanism -> Comparison -> Conclusion
audience: General tech-curious viewers
style_profile: technical-explainer-01
---

## Frame 1 — Remote Temperature Trigger

- scene_id: scene_7a91c0
- status: outline
- duration: 4s
- transition_in: cut
- engine: hyperframes
- src: compositions/01-remote-trigger.html
- assets: remote_001:idle
- motion_presets: camera.smooth_zoom, typography.counter_up
- camera: orthographic
- narrative_role: hook
- voiceover: "Lower temperature settings do not cool your room faster."

Focus on the remote LCD rising/dropping from 25°C to 16°C at center frame.
```

- `scene_id` is generated once (`scene_<short-uuid>`) and **never changes** when frames are reordered, renamed, or edited.
- If an agent writes a new `## Frame N` without a `scene_id`, the parser assigns/persists a deterministic or new stable `scene_id` on explicit save/reconcile without disturbing unrelated frames.

#### C. Master Asset Registry (`assets/asset-registry.json`)

````ts
type AssetType =
  | 'object'
  | 'character'
  | 'environment'
  | 'graphic'
  | 'model3d'
  | 'audio'
  | 'video'
  | 'lottie'
  | 'custom'

type AssetFormat =
  | 'svg'
  | 'layered-svg'
  | 'png'
  | 'webp'
  | 'glb'
  | 'gltf'
  | 'lottie'
  | 'html'
  | 'mp4'
  | 'webm'
  | 'wav'
  | 'mp3'

type AssetStateEntry = {
  file: string            // Project-relative path under assets/, e.g. 'objects/ac/cutaway.svg'
  format?: AssetFormat    // Optional per-state format override
  sha256?: string         // Verified file content hash
  label?: string
  notes?: string
  dependencies?: string[] // Relative paths to textures, fonts, or helper files
}

### Asset & Style Snapshot Integrity Invariants (Validated on Write, Import, Apply, and Save-to-Library)
1. `defaultState` MUST exist as a key in `states` (non-empty).
2. Every `components[].id` within a `MasterAssetRecord` MUST be unique (no duplicate component IDs).
3. `components[].parentComponentId` hierarchy MUST be acyclic (no self-parenting or cycles detected via DFS, and any specified `parentComponentId` must exist in `components[]`).
4. Every relative file in `states[stateKey].file`, every path in `dependencies[]`, and any `DESIGN.md`/`frame.md`/`MOTION.md` referenced by a style/asset package MUST pass containment validation, exist on disk, and verify against its recorded `sha256` hash.
5. Published Host Library versions (`assets/<assetId>/v<n>/` and published style revisions) are strictly immutable; modifying metadata/states/components creates a new version (`v<n+1>`) in the Host Library or updates only the local `snapshotRevision` inside the active project.

```ts
type AssetComponentSpec = {
  id: string                  // Permanent component identity (e.g. 'fan', 'evaporator')
  name?: string
  selector?: string           // CSS/SVG selector or 3D node name (e.g. '#fan', 'Mesh_Impeller')
  parentComponentId?: string  // Component hierarchy (acyclic; references another components[].id)
  animatable: boolean
  pivot?: { x: number; y: number; z?: number }
  anchor?: { x: number; y: number; z?: number }
  allowedTransforms?: ('translate' | 'rotate' | 'scale' | 'opacity' | 'morph' | 'color')[]
}

type MasterAssetRecord = {
  id: string                  // Stable logical asset ID (e.g. 'ac_indoor_001')
  schemaVersion: 1
  version: number             // Published library version (or pinned source version in snapshot)
  snapshotRevision?: string   // Local project edit revision / hash when modified inside a project
  name: string
  type: AssetType
  format: AssetFormat
  tags: string[]
  defaultState: string
  states: Record<string, AssetStateEntry> // Flexible custom states (closed/cutaway, idle/walking, day/night, etc.)
  components: AssetComponentSpec[]
  supportedEngines: VideoStudioEngine[]
  dependencies: string[]      // Shared relative dependency paths (fonts, textures)
  provenance: {
    source: 'library' | 'imported' | 'generated'
    libraryAssetId?: string
    libraryVersion?: number
    originUrl?: string
  }
  license?: {
    spdx?: string
    attribution?: string
    commercialAllowed?: boolean
  }
  consistency: {
    lockGeometry: boolean
    lockProportions: boolean
    lockMaterials: boolean
  }
  createdAt: number
  updatedAt: number
}
````

- Deletion guard & dynamic reference caveat: Removing an asset from a project checks `STORYBOARD.md` frame `assets:` references and static file references in `index.html`, `compositions/*.html`, `scenes/*.html`, CSS, and SVG files. Because static scanning cannot exhaustively detect dynamic/evaluated JavaScript references, the registry reports dynamic-script heuristics (`mayBeReferencedDynamically`), blocks deletion with `video_studio_asset_in_use` if statically referenced (unless `force: true`), and **never deletes potentially referenced files on disk without explicit confirmation** (`forceDeleteFiles: true`).

#### D. Research Sources (`references/sources.json`)

Reuses `GeneralChatSource` identity fields from `src/shared/general-chat/general-chat-research-contract.ts` and extends them for video verification:

```ts
type VideoStudioResearchSource = {
  id: string
  url: string
  title: string
  domain: string
  snippet?: string
  accessedAt: number
  origin: 'general-chat-search' | 'deep-research' | 'manual'
  verificationStatus: 'verified' | 'unverified' | 'assumed'
  claimIds: string[] // Optional links to script/storyboard claims
}
```

#### E. Extension Points (Contracts Only in Phase 02–03)

1. **Universal Motion Registry (`src/shared/video-studio/motion-registry-contract.ts`):**
   - Defines `MotionPresetMetadata` (`id`, `version`, `category`, `parameters`, `dependencies`, `executionKind: 'executable' | 'knowledge-only' | 'planned'`, `implementations: Record<string, { status: 'executable' | 'knowledge-only' | 'planned' | 'unsupported'; adapterType?: string }>`), plus a small read-only built-in starter catalog matching common storyboard presets (`camera.smooth_zoom`, `camera.pan`, `typography.counter_up`, `typography.word_highlight`, `object.pop_in`, `diagram.flow_path`, `chart.line_draw`). **Presets whose status is `'knowledge-only'` or `'planned'` MUST NOT be reported as executable (`'executable'`) or runnable until an implementation adapter exists.**
2. **OpenMotion Motion Package Adapter Interface (`src/main/video-studio/extensions/motion-package-contract.ts`):**
   - Defines TypeScript types & Zod boundary for `motion-package.json` v0.2 (`name`, `version`, `license`, `entry`, `dependencies`, `hashedInventory`, `inputsSchemaPath`, `elementsDir`, `materialsDir`, `presetsDir`) and an adapter interface (`inspectPackage`, `validateManifest`, `mapToStyleAndAssets`) to be implemented when OpenMotion source modules are extracted in Phase 04.

---

## 7. Typed Runtime RPC Contracts

All methods live in `src/shared/video-studio/video-studio-rpc-contract.ts`, register in `src/main/runtime/rpc/methods/video-studio/video-studio-methods.ts`, use `import * as z from 'zod'`, never accept or return raw host filesystem paths, and route via explicit `RuntimeClientTarget`.

### Complete Method Inventory (Existing + New)

| Method                                                                           | Purpose                                                                                                                                                                                                                | Optimistic Lock / Guard                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `videoStudio.listProjects` / `createProject` / `updateProject` / `deleteProject` | Project catalog CRUD + directory cleanup                                                                                                                                                                               | Atomic catalog lane                                                         |
| `videoStudio.probeEngines`                                                       | Capabilities + `EnvironmentReport` (with pinned `0.9.94` diagnostics)                                                                                                                                                  | Safe read-only probe                                                        |
| `videoStudio.getCompositionState`                                                | Mounted compositions, file list, planned-vs-actual drift summary, active preview                                                                                                                                       | Read-only inspect                                                           |
| `videoStudio.scaffoldComposition`                                                | Non-destructive modular scaffold (`overwrite?: boolean`, optional `styleProfileId`)                                                                                                                                    | Per-project mutation queue                                                  |
| `videoStudio.openCompositionWorkspace`                                           | Open/reuse `FolderWorkspace` for Coding Workspace editing                                                                                                                                                              | Host folder workspace lookup                                                |
| `videoStudio.checkComposition`                                                   | Runs `VideoEngineAdapter.validate()`, returns 5-state `ValidationReport` + `productionGate`                                                                                                                            | Single active check/render per project                                      |
| `videoStudio.startPreview` / `stopPreview`                                       | Preview Session Manager lifecycle (`forceNew?: boolean`)                                                                                                                                                               | Process identity + port ownership verified                                  |
| `videoStudio.startRender` / `cancelRender`                                       | Render execution (`quality`, optional `startSeconds`/`endSeconds`), progress stream                                                                                                                                    | Single active check/render per project                                      |
| `videoStudio.subscribeJobs`                                                      | Streaming jobs, preview state, engine probe, and **project file-revision notifications**                                                                                                                               | `RevisionClock` stream                                                      |
| `videoStudio.readRenderOutputChunk`                                              | Bounded base64 MP4 streaming (<= 512 KiB/chunk)                                                                                                                                                                        | Strict `renders/` containment + catalog record check                        |
| **Style Profile Methods**                                                        |                                                                                                                                                                                                                        |                                                                             |
| `videoStudio.listStyleProfiles`                                                  | Lists built-in presets + User Host Library profiles                                                                                                                                                                    | Read-only                                                                   |
| `videoStudio.saveLibraryStyleProfile`                                            | Create/update User Host Library style profile (rejects built-in overwrite)                                                                                                                                             | Host Style Library lock + `expectedRevision`                                |
| `videoStudio.duplicateStyleProfile`                                              | Clones built-in or library style into User Host Library with new ID                                                                                                                                                    | Host Style Library lock                                                     |
| `videoStudio.deleteLibraryStyleProfile`                                          | Removes user library style (does not alter existing project snapshots)                                                                                                                                                 | Host Style Library lock                                                     |
| `videoStudio.getProjectStyleState`                                               | Returns `styles/style-profile.json`, token revision, and Markdown drift flag                                                                                                                                           | Project read                                                                |
| `videoStudio.applyStyleProfileToProject`                                         | Snapshots built-in/library style to project (`style-profile.json`, `frame.md`, `DESIGN.md`, `MOTION.md`)                                                                                                               | Multi-file TX + `expectedRevisions`                                         |
| `videoStudio.updateProjectStyleTokens`                                           | Updates canonical `style-profile.json` and syncs managed frontmatter/headers                                                                                                                                           | Multi-file TX + `expectedRevisions`                                         |
| `videoStudio.getStyleReconciliationDiff`                                         | Compares `style-profile.json` tokens vs Markdown tokens (`frame.md`/`DESIGN.md`/`MOTION.md`)                                                                                                                           | Read-only diff                                                              |
| `videoStudio.reconcileProjectStyle`                                              | Resolves drift (`'import-from-markdown'` or `'reapply-json'`)                                                                                                                                                          | Multi-file TX + `expectedRevisions`                                         |
| **Brief, Storyboard & Research Methods**                                         |                                                                                                                                                                                                                        |                                                                             |
| `videoStudio.getProjectDocuments`                                                | Parsed `BRIEF.md`, `STORYBOARD.md`, `SCRIPT.md`, `references/sources.json`, `research-notes.md` + `revisions` map + trust state                                                                                        | Read-only                                                                   |
| `videoStudio.updateProjectBrief`                                                 | Updates `BRIEF.md` frontmatter/sections (`expectedRevision`)                                                                                                                                                           | Project TX                                                                  |
| `videoStudio.updateProjectScript`                                                | Updates `SCRIPT.md` narration/voiceover markdown (`expectedRevision`)                                                                                                                                                  | Project TX                                                                  |
| `videoStudio.upsertResearchSource`                                               | Adds or edits a verified/manual source in `references/sources.json` & syncs `research-notes.md` (`expectedRevision`)                                                                                                   | URL/schema validation + Project TX                                          |
| `videoStudio.deleteResearchSource`                                               | Removes a source from `references/sources.json` (`expectedRevision`)                                                                                                                                                   | Project TX                                                                  |
| `videoStudio.approveProjectExecution`                                            | Records explicit user execution approval (`trustState: 'approved-preview'                                                                                                                                              | 'approved-render'`) bound to current `inputFingerprint`                     | Project TX + Audit state |
| `videoStudio.addStoryboardFrame`                                                 | Appends/inserts a frame with new permanent `scene_id` into `STORYBOARD.md`                                                                                                                                             | Project TX + `expectedRevision`                                             |
| `videoStudio.patchStoryboardFrame`                                               | Patches one frame by `scene_id` (title, status, duration, transition, engine, src, assets, voiceover, motion_presets, camera, narrative)                                                                               | Project TX + `expectedRevision`                                             |
| `videoStudio.deleteStoryboardFrame`                                              | Removes a frame by `scene_id` (does not delete `compositions/*.html` on disk)                                                                                                                                          | Project TX + `expectedRevision`                                             |
| `videoStudio.reorderStoryboardFrames`                                            | Reorders frames by `scene_id[]` while preserving every `scene_id` and `## Locked`                                                                                                                                      | Project TX + `expectedRevision`                                             |
| **Master Asset Registry Methods**                                                |                                                                                                                                                                                                                        |                                                                             |
| `videoStudio.listLibraryAssets` / `listProjectAssets`                            | Lists Host Asset Library and project `asset-registry.json` (plus invariant/dependency warnings)                                                                                                                        | Read-only                                                                   |
| `videoStudio.registerOrImportAsset`                                              | Imports uploaded/base64-bounded or workspace-relative asset into project or immutable Host Library `v1`, validates invariants, writes SHA-256 & metadata                                                               | Containment validation + Host Asset Lock -> Project TX + `expectedRevision` |
| `videoStudio.updateAssetMetadata`                                                | Updates asset name, type, tags, **asset state CRUD** (`add/update/remove` in `states` + `defaultState`), structured `components`, dependencies, provenance, license, and consistency locks (validating all invariants) | Project TX + `expectedRevision`                                             |
| `videoStudio.applyLibraryAssetToProject`                                         | Copies immutable versioned library asset (`v<n>`) + state files + verified dependencies into project `assets/`                                                                                                         | Host Asset Library Lock -> Project TX                                       |
| `videoStudio.saveProjectAssetToLibrary`                                          | Publishes a project asset + state files + verified dependencies into Host Asset Library as immutable new version (`v1` or `v<n+1>`) without mutating prior library versions                                            | Host Asset Library Lock -> Project TX                                       |
| `videoStudio.removeProjectAsset`                                                 | Removes asset from registry (and optionally unreferenced files); blocks if referenced unless `force: true`                                                                                                             | Dependency scan + Project TX                                                |
| `videoStudio.deleteLibraryAsset`                                                 | Deletes asset from Host Asset Library                                                                                                                                                                                  | Host Asset Library Lock                                                     |
| **Motion Extension Method**                                                      |                                                                                                                                                                                                                        |                                                                             |
| `videoStudio.listMotionPresets`                                                  | Returns read-only Universal Motion Registry entries for Inspector/Storyboard selectors                                                                                                                                 | Read-only                                                                   |

### Mobile Routing & Passthrough Codes

- **Mobile Read-Only Allowlist (`runtime-rpc-mobile-video-studio-methods.ts`):** Add `listStyleProfiles`, `getProjectStyleState`, `getProjectDocuments`, `listLibraryAssets`, `listProjectAssets`, `listMotionPresets` for read-only mobile inspection; keep SSH hosts explicitly refused via `mobileRpcSshRefusal`.
- **New Passthrough Error Codes (`runtime-passthrough-codes.ts`):** `video_studio_file_conflict`, `video_studio_tx_recovery_conflict`, `video_studio_invalid_path`, `video_studio_style_not_found`, `video_studio_style_readonly`, `video_studio_asset_not_found`, `video_studio_asset_in_use`, `video_studio_asset_invariant_invalid`, `video_studio_scene_not_found`, `video_studio_invalid_state_file`, `video_studio_preview_session_stale`, `video_studio_execution_approval_required`.

---

## 8. UI Behavior (Native Orca Structured Inspector)

All UI work follows `docs/STYLEGUIDE.md`, `main.css` design tokens, `components/ui/` primitives, Lucide icons, `useTranslate()`, React Compiler compatibility (no `try/finally` inside hooks), and responsive desktop/narrow touch targets (`min-h-11 @lg:min-h-9`).

### Stage-Aware Project Detail Surface (`VideoStudioProjects.tsx`, `VideoStudioWorkflow.tsx`)

Instead of showing only a static metadata form plus `Production` panel, the selected project detail view presents **four explicit workflow stages** (`workflowStage`: `'research' | 'script' | 'style' | 'production'`, preserving backward compatibility for legacy saved projects):

1. **`Research` Stage:**
   - **Brief Editor (`BRIEF.md`):** Message, target audience, language, narrative arc, intent notes.
   - **Research Sources (`references/sources.json`):** Collapsible source cards from General Chat handoff (or manually added/edited URLs via `upsertResearchSource` / `deleteResearchSource`) showing title, domain, `verificationStatus` badge (`verified` / `unverified` / `assumed`), and `research-notes.md` summary.
2. **`Script` Stage (Storyboard, `SCRIPT.md` & Master Assets):**
   - **Structured Storyboard List (`STORYBOARD.md`) & Narration (`SCRIPT.md`):**
     - Ordered `## Frame N — Title` cards keyed by permanent `scene_id` (showing `Frame N`, `scene_id` chip, `status` badge `outline/built/animated`, planned `duration`, `transition_in`, `voiceover`, assigned `assets` & namespaced `motion_presets`).
     - Supports **Add Frame**, **Edit Frame**, **Move Up / Move Down** (reorder), and **Delete Frame** (with confirmation), plus inline **`SCRIPT.md` Editor**.
     - Displays **Planned vs Actual Drift** badge when `compositions/*.html` exists and differs from storyboard duration, target file presence, or referenced assets.
   - **Master Asset Registry Panel (`assets/asset-registry.json`):**
     - Lists project assets with type icon, format, version, `consistency` lock badges, custom `states` pills (e.g. `closed`, `cutaway`, `operating` or `idle`, `walking`), and expandable structured `components` list (`id`, `selector`, `allowedTransforms`).
     - Supports **Import File**, **Add/Edit State**, **Edit Metadata/Components**, **Copy from Host Library**, **Save to Host Library** (creates immutable new version `v<n+1>`), and **Remove** (showing dependency warning dialog if statically/potentially referenced; never deletes disk files without explicit confirmation).
3. **`Style` Stage (Dual-Scope Style Profile & Universal Motion Registry):**
   - **Style Profile Selector & Token Inspector:** Displays active project snapshot (`name`, `version`, `sourceTier`, `visual.palette` swatches, `visual.lighting`/`renderingStyle`, `typography`, `camera`, `motion`, `effects`, `composition`, `subtitle`, `openMotionPackageRef`), dropdown to apply Built-in (`technical-explainer-01`, `clean-editorial-01`) or Host Library profiles, inline token editing (`updateProjectStyleTokens`), **Save / Duplicate to Host Library**, and a **Reconciliation Banner** when `frame.md` / `DESIGN.md` / `MOTION.md` was modified externally by a coding agent.
   - **Universal Motion Registry Inspector:** Browses available namespaced motion presets explicitly labeled as `executable`, `knowledge-only`, or `planned` so unimplemented presets are never misreported as runnable.
4. **`Production` Stage (`VideoStudioProductionPanel.tsx`):**
   - **Engine Readiness & Trust Banner:** Displays `HyperFrames 0.9.94` readiness (`node 22+`, `ffmpeg`, `ffprobe`, `chrome`, exact pinned version check) + **Recheck** button + `Remotion (Phase 06)` status, plus **Execution Trust Approval Prompt** (hosted in `<profileDir>/video-studio/security/trust-store.json`) before spawning Chrome on unapproved external/AI-modified compositions.
   - **Composition Actions:** _Scaffold / Re-scaffold_ (non-destructive `overwrite: false`, filling missing Phase 02–03 files without touching user/agent compositions) + confirmation-gated _Reset entry HTML_ (`overwrite: true`), _Open in Workspace_ (switches to Coding Workspace with the project folder mounted so coding agents can author `compositions/*.html`), _Run Check_ (displays 5-state `ValidationReport` badge, `skippedChecks`, `productionGate` notice, findings with `fixHint`/`suggestedColor`), and _Start / Open / Stop Preview_ managed by Preview Session Manager.
   - **Render & Playback:** Quality (`Draft`, `Looks`, `Delivery`), `Render MP4` (gated by `productionGate.allowed` when required browser checks were skipped unless an explicit override/draft setting is added later), live `@hf-progress` progress bar & bounded logs, render history list, and chunked Blob `<video controls>` playback + _Save MP4_.
5. **External Edit Conflict Handling:**
   - File watcher pushes `projectFilesChanged` events over `videoStudio.subscribeJobs`. If the user has unsaved edits in the Inspector or hits `video_studio_file_conflict`, an inline alert banner offers **Reload from disk** cleanly without overwriting coding-agent changes.

---

## 9. Preview and Rendering Lifecycle

### Preview Mode Progression Roadmap

1. **Phase 02–03 (This Spec):**
   - **External Browser Preview** (local loopback URL opened via validated `shell.openExternal`) + **Chunked MP4 Playback** (`<video controls>` via `readRenderOutputChunk`, working across both local and remote hosts).
2. **Phase 04–05 (Target Native Workspace):**
   - **Embedded Isolated HyperFrames Preview** inside Orca Video Studio (isolated guest view / sandboxed frame with host-tunneled preview access for remote hosts, removing reliance on an external browser window).
3. **Phase 06–08 (Multi-Engine):**
   - **Embedded Remotion Player** + **Unified Multi-Engine Preview**.

### Preview Session Manager (`src/main/video-studio/video-studio-preview-manager.ts`)

- Tracks active preview handles in memory per `(profileDir, projectId)`, stores authoritative session records in host-managed `<profileDir>/video-studio/security/preview-sessions.json`, and mirrors non-authoritative cache state into `.orca/project-state.json`.
- **Startup / Reuse Verification (Six-Factor Process & Ownership Check — Never Trust Raw PID or Generic HTTP 200 Alone):**
  Before reusing or stopping a session:
  1. Verify process existence and OS **process identity + `creationTimeMs`**: on Windows via [windows-process-table.ts](file:///C:/Coding/Project/orca/.worktrees/orca-ai-studio/src/main/windows/windows-process-table.ts); on POSIX via `ps`/process inspection.
  2. Verify resolved **executable path** matches expected Node/HyperFrames runtime (not merely substring `'hyperframes'` anywhere in args).
  3. Verify **project identity** (`projectDirRealpath` in command line args / cwd matches the canonical project root).
  4. Verify **port ownership & loopback server identity**: confirm the listening TCP socket on `127.0.0.1:<port>` is owned by that PID (via OS socket/netstat check or HyperFrames session metadata) AND probe its HTTP response / headers / project title/root marker + recorded `sessionId`.
  5. Only reuse if all identity checks and health pass. If stale or mismatched on any factor, clear the cached entry without touching the unrelated OS process; only pass `--force-new` to HyperFrames CLI when replacing an unhealthy/orphaned session confirmed to belong to that project.
- **Teardown:** Automatically stops preview processes on project deletion, runtime `dispose()`, and app quit.

---

## 10. Security Threat Model and Boundaries

Untrusted HTML/CSS/JS inside `index.html`, `compositions/*.html`, or imported SVG/HTML assets may originate from AI generation or third-party templates.

```text
+-------------------------------------------------------------------+
| Trusted Orca App (Main Process · Credentials · Agent Keys · FS)   |
+---------------------------------+---------------------------------+
                                  | Validated Typed RPC (Zod)
                                  v
+-------------------------------------------------------------------+
| Execution Boundary                                                |
| - Per-host RPC permission & SSH refusal                           |
| - Path traversal / realpath / symlink / junction containment      |
| - Env allowlist (strips API keys/tokens before spawning CLI)      |
| - URL validation (normalizeExternalBrowserUrl + loopback check)   |
| - Timeout, AbortSignal, single-job lock, bounded output sinks     |
+--------------------+------------------------------+---------------+
                     |                              |
                     v                              v
       +---------------------------+  +---------------------------+
       | Preview Server / Browser  |  | Render Worker Subprocess  |
       | Untrusted HTML/JS/CSS     |  | Untrusted HTML/JS + Chrome|
       | Zero Node/Electron APIs   |  | No Orca secrets in env    |
       +---------------------------+  +---------------------------+
```

### Enforced Security Controls & Minimal Execution Trust Policy (Phase 02–03)

1. **Host-Managed Execution Trust Store & Verification Policy (Outside Project Dir):**
   - Authoritative execution approval lives **strictly outside the project directory** in host-managed `<profileDir>/video-studio/security/trust-store.json`, keyed by `(projectId, projectRootRealpath)`. **Project files inside `projects/<projectId>/` (including `.orca/project-state.json`) MUST NEVER be able to grant or persist execution approval to themselves.**
   - Trust record tracks `{ projectId, projectRootRealpath, sourceOrigin: 'orca-scaffold' | 'ai-generated' | 'imported-external', trustState: 'untrusted' | 'approved', approvedFingerprint?: string, approvedAt?: number }`.
   - **`inputFingerprint` Completeness:** The fingerprint MUST hash **all executable sources, dependencies, and runtime config**: `index.html`, `compositions/**/*.html`, `scenes/**/*.html`, any `.js`/`.mjs`/`.css`/`.svg` under `compositions/`, `scenes/`, `assets/`, or project root, `hyperframes.json`, `package.json`, `styles/style-profile.json`, `assets/asset-registry.json`, `engineConfig`, and pinned `runtimeIdentity` (`hyperframes@0.9.94`).
   - Browser-backed `check` (unless `--no-browser` static lint), `preview`, and `render` MUST verify trust against `<profileDir>/video-studio/security/trust-store.json` before spawning Chrome. If `trustState !== 'approved'` or current `inputFingerprint !== approvedFingerprint`, Orca rejects with `video_studio_execution_approval_required` until the user explicitly approves via `videoStudio.approveProjectExecution`.
   - **Pre-Spawn TOCTOU / Execution Snapshot Mitigation:** Orca computes and verifies `inputFingerprint` under host lock right before spawning Chrome, captures a verified temporary/read-only execution snapshot (or re-verifies fingerprint atomically before launch and aborts/invalidates if modified between approval and spawn), and continues to **strictly prohibit unattended execution of untrusted sources** until full sandbox isolation exists in Phase 04–05.
2. **Zero Electron Privilege Exposure:** Generated composition HTML/JS is never injected into Orca's privileged React renderer (`no dangerouslySetInnerHTML`, `no file://` load, `no Node/preload`). External browser preview opens strictly through `normalizeExternalBrowserUrl` ([browser-url.ts](file:///C:/Coding/Project/orca/.worktrees/orca-ai-studio/src/shared/browser/navigation/browser-url.ts#L325)) verified to `http://127.0.0.1:<port>/...` or `http://localhost:<port>/...` with valid port bounds.
3. **Environment Credential Isolation (`host-video-engine-deps.ts`):** Replace full `process.env` inheritance (`copyDefinedProcessEnv()`) with an explicit **allowlist** (`PATH`, `PATHEXT`, `SystemRoot`, `COMSPEC`, `TEMP`, `TMP`, `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `LANG`, `LC_*`, `HYPERFRAMES_*` non-secret flags) so `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, search provider secrets, or Orca tokens are **never** inherited by `hyperframes` preview/render/check subprocesses.
4. **Filesystem Containment:** Every project ID, style ID, asset ID, and relative asset/composition/render path is validated for traversal (`..`, NUL bytes, drive prefixes, UNC paths, mixed `/` & `\` separators) AND verified post-resolution via `realpath()` containment under its canonical root (`projects/<projectId>/`, `styles/`, `assets/`), blocking Windows symlink and directory junction escapes.
5. **RPC Authorization & Input Bounds:** All RPC handlers require valid runtime host authorization (`permission: 'workspace'`), refuse SSH mutations explicitly, cap imported asset payload chunks / file sizes, and disallow raw host paths in RPC responses.
6. **Resource Limits & Process Lifecycle:** Single active check/render per project, bounded 100-line log ring, output byte sinks capped (`DEFAULT_MAX_OUTPUT_BYTES`), hard timeouts (`15s` probe, `120s` check, `1h` render), and process-tree termination on `AbortSignal` / shutdown via `@orca/process-host`.
7. **Untrusted Project File Hygiene:** PIDs, ports, URLs, or `src` paths read from `project.json`, `.orca/project-state.json`, `STORYBOARD.md`, or `asset-registry.json` are never trusted without validation and OS/containment verification.

### Documented Security Limits in Phase 02–03 (Not a Full Sandbox Yet)

- **Not a Full Execution Sandbox:** Environment variable allowlisting, path containment validation, and opening previews in an external system browser are necessary defense-in-depth boundaries, **NOT a full execution sandbox** for arbitrary untrusted HTML/CSS/JavaScript.
- **External Browser Network/Localhost Access:** When preview opens in the user's system browser during Phase 02–03, scripts inside `http://127.0.0.1:<port>` run under the browser's localhost origin — they cannot access Electron/Orca IPC or host files outside the preview server, **but** can attempt outbound HTTP requests or talk to other unauthenticated localhost ports reachable by the user's browser. Strict CSP/request interception inside an isolated embedded guest or `--docker` container is scheduled for Phase 04+.
- **Untrusted Render Network Egress:** Native Chrome launched locally by `hyperframes render` may fetch external CDN URLs (e.g., `cdn.jsdelivr.net` for GSAP/fonts) unless `--docker` or offline asset localization is enforced. Phase 04+ will introduce asset bundling/offline CDN vendoring and strict isolated container rendering.

---

## 11. Multi-File Transaction Queue and Crash Recovery

Because operations such as `applyStyleProfileToProject` and `reconcileProjectStyle` update multiple files (`styles/style-profile.json`, `frame.md`, `DESIGN.md`, `MOTION.md`), single-file atomic rename alone is insufficient.

### Concurrency Architecture & Canonical Lock Order

1. **Canonical Lock Acquisition Order (Deadlock Prevention):**
   Operations spanning both Host Libraries and a Project MUST acquire locks strictly in this global order and **never** invert it (`Project` -> `Host*Library` is forbidden):
   1. `HostStyleLibraryLock` (`<profileDir>/video-studio/styles/`)
   2. `HostAssetLibraryLock` (`<profileDir>/video-studio/assets/`)
   3. `ProjectMutationQueue[projectId]` (`projects/<projectId>/`)
      Operations scoped strictly to a single resource acquire only that resource's lock.
2. **Commit Protocol with Pre-Commit Backup & Staged Hash Verification (`.orca/tx.log`):**
   - **Step 1 (Validate & Backup):** Inside the acquired locks, re-read target files, verify every `expectedRevision` (`sha256` hash) matches disk, write pre-image backups of existing targets into `.orca/.staging/<txId>/backups/...`, and record `{ txId, state: 'preparing', targets: [{ path, existed, beforeSha256, backupPath, afterSha256, stagedPath }] }` into `.orca/tx.log` atomically.
   - **Step 2 (Stage & Verify Before Commit):** Write new contents into `.orca/.staging/<txId>/staged/...` via `durableWriteTempPath`. **Mandatory Gate:** Re-read every staged file and every pre-image backup on disk and verify both existence and exact SHA-256 equality (`staged == afterSha256`, `backup == beforeSha256` for pre-existing files) **before** advancing `.orca/tx.log`.
   - **Step 3 (Commit):** Only after Step 2 verification succeeds, update `.orca/tx.log` state to `'committing'` and atomically rename each staged file onto its target path.
   - **Step 4 (Cleanup):** Mark `'committed'` / unlink `.orca/tx.log` and `.orca/.staging/<txId>/`. Suppress watcher conflict alerts for Orca's own write generations.
3. **Failure & Startup Crash Recovery Rules:**
   - **Failure before `'committing'`:** Discard `.orca/.staging/<txId>/` and delete `.orca/tx.log`; target files remain untouched.
   - **Failure or Crash during `'committing'` (detected on next project open or catalog startup):**
     - Inspect each target file's current `sha256` hash on disk:
       - If every target already matches `afterSha256`, complete cleanup cleanly.
       - If some targets match `afterSha256`, others match `beforeSha256`, and **no target has an unknown external hash**, roll back committed targets from backups (if present) or recover cleanly and delete `.orca/tx.log`.
       - **Critical safety rule:** If any target file has an unknown `sha256` (meaning an external coding agent edited that file between partial commit and recovery), **NEVER blindly rollback and destroy agent edits**. Move `.orca/tx.log` to `.orca/tx-conflict-<txId>.json` and surface an explicit `video_studio_tx_recovery_conflict` report to the user.
   - **External Agent Limitation (Explicit):** External coding agents running in terminals or editors do not acquire Orca's in-process JS queue. Therefore, `expectedRevision` + post-staging hash re-verification narrows the race window and detects conflicts, rather than claiming OS-level mandatory file locks against external tools.

---

## 12. Migration Strategy and Backward Compatibility

- **Stage 1 / Stage 2 Catalog Records (`video-studio-projects.json`):**
  - `VideoStudioProjectSchema` remains backward-compatible via defaults (`engine: 'hyperframes'`, `fps: 30`, `renders: []`, `styleProfileId: undefined`).
- **Existing `projects/<projectId>/` Directories:**
  - Projects created under Stage 2 (containing `scenes/` + monolithic `index.html`, no `.orca/`, `styles/`, `STORYBOARD.md`, or `assets/asset-registry.json`) continue to load, inspect, check, preview, and render without forced migration.
  - `inspectVideoStudioCompositionState` detects `entryExists` from `index.html` and scans both `compositions/**/*.html` and legacy `scenes/**/*.html` for file listing and asset reference checks.
  - **Non-Destructive Upgrade (`videoStudio.scaffoldComposition` with `overwrite: false`):**
    - Creates missing `.orca/schema-version.json` (`schemaVersion: 2`), `BRIEF.md`, `frame.md`, `DESIGN.md`, `MOTION.md`, `STORYBOARD.md`, `styles/style-profile.json`, `assets/asset-registry.json`, `assets/video/`, `references/sources.json`, and `compositions/components/`.
    - Upgrades `hyperframes.json` only if missing or matching the exact legacy Stage 2 `{ id, width, height, fps, durationSeconds }` shape (preserving any custom user config fields and never deleting `scenes/` or overwriting custom `index.html`).

---

## 13. Upstream Feature Integration Roadmap and Matrix

The long-term product target is **mandatory native feature integration** of **HyperFrames** (`Apache 2.0`), **OpenMotion** (`Apache 2.0`), and **Remotion** (License-gated engine adapter) directly inside Orca AI Video Studio — using official packages, direct Apache-2.0 source extraction/refactoring into Orca modules, and unified adapters rather than treating OpenMotion as mere design inspiration or relying on external standalone apps. Because OpenMotion is itself built on HyperFrames, Orca avoids duplicating overlapping editors by consolidating on one Orca UI, one Runtime RPC layer, and unified registries.

| Upstream Repo            | Source Module / Feature                                                                                                                      | Upstream Version / Commit               | License                                                                                                   | Integration Method                                                                          | Shared Dependencies                                              | Target Orca Module                                         | Target Phase                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `heygen-com/hyperframes` | CLI (`doctor`, `check`, `preview`, `render`, `init`)                                                                                         | Pinned `0.9.94`                         | Apache 2.0                                                                                                | Official CLI via `@orca/process-host` adapter                                               | Node 22+, FFmpeg, Chrome                                         | `src/main/video-studio/engines/hyperframes-*`              | **02–03 (Now)**                       |
| `heygen-com/hyperframes` | Modular sub-compositions, `BRIEF.md`, `STORYBOARD.md`, `frame.md`, registry blocks, `media-use` / audio / captions                           | `0.9.94`                                | Apache 2.0                                                                                                | Native file contract + CLI/skill workflow                                                   | GSAP, Three.js, Whisper, FFmpeg                                  | Project layout & Agent Runner                              | **02–05**                             |
| `heygen-com/hyperframes` | Embedded Studio / `<hyperframes-player>`                                                                                                     | `0.9.94` (audit at Phase 04)            | Apache 2.0                                                                                                | Isolated guest frame / official `@hyperframes/player` package                               | Web Components / HTTP preview                                    | `src/renderer/.../video-studio/preview/`                   | **04**                                |
| `nexu-io/openmotion`     | `Motion Package` v0.2 (`motion-package.json`, `DESIGN.md`, `MOTION.md`, manifest/inventory)                                                  | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Contract now -> Source extraction + adapter                                                 | Zod, YAML/JSON parsers                                           | `src/main/video-studio/extensions/` & `Style Profile`      | **03 (Contract) -> 04 (Importer)**    |
| `nexu-io/openmotion`     | `Motion Knowledge Library` (300+ `Motion.md` guides in `library/`)                                                                           | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Source/content indexing + loader module                                                     | Markdown metadata index                                          | `Universal Motion Registry`                                | **04**                                |
| `nexu-io/openmotion`     | `Reference Recreation` skills (`skills/openmotion-recreate`)                                                                                 | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Skill/workflow extraction into Orca agent skills                                            | Vision/LLM, FFmpeg contact sheets                                | `Reference Video Analyzer`                                 | **04–05**                             |
| `nexu-io/openmotion`     | `Template Discovery` & search modules                                                                                                        | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Source extraction & refactoring into Orca Core                                              | Search/index helpers                                             | `Orca Template Registry`                                   | **04**                                |
| `nexu-io/openmotion`     | `Brand Kit` workflow (`BRANDKIT.md`, `openmotion-brandkit`)                                                                                  | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Adapter mapping Brand Kit -> `style-profile.json` + `frame.md`                              | Asset Registry                                                   | `Style Profile Manager`                                    | **04**                                |
| `nexu-io/openmotion`     | `Media Generation Gateway` (image/video/music/TTS providers)                                                                                 | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Provider adapter extraction (reusing Orca encrypted key store)                              | HTTP/API clients                                                 | `Unified Model Gateway`                                    | **04–05**                             |
| `nexu-io/openmotion`     | `Production Skills` (`openmotion-director`, `openmotion-production`)                                                                         | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Skill registry integration with Orca coding agents                                          | Structured Agent Host                                            | `Automated Agent Runner`                                   | **05**                                |
| `nexu-io/openmotion`     | `Asset Versioning`                                                                                                                           | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Feature alignment into `asset-registry.json`                                                | SHA-256 + Host Library                                           | `Master Asset Registry`                                    | **03 (Schema) -> 04 (Versioning UI)** |
| `nexu-io/openmotion`     | `MCP Tools` (`mcp.ts`)                                                                                                                       | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Expose Orca Video Core operations as Orca Agent / MCP tools                                 | Orca MCP & RPC                                                   | `Orca Agent Tool Registry`                                 | **04–05**                             |
| `nexu-io/openmotion`     | Reusable editor/timeline UI components (`src/motion/*`)                                                                                      | Audit upstream `main` at Phase 04 start | Apache 2.0                                                                                                | Selective component adaptation matching `STYLEGUIDE.md`                                     | React 19, Tailwind                                               | `Native Video Studio UI`                                   | **04–08**                             |
| `remotion-dev/remotion`  | Core engine, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/transitions`, `@remotion/captions`, `@remotion/three` | Audit compatible v4.x at Phase 06 start | **Remotion License** (Free `<=3` team; Company License `>=4` / Automators; _exclude_ paid Editor Starter) | Official packages behind `VideoEngineAdapter` (+ optional HF `window.__hfRemotion` interop) | React, esbuild, FFmpeg/compositor binaries (`app.asar.unpacked`) | `src/main/video-studio/engines/remotion-engine-adapter.ts` | **06**                                |

---

## 14. Acceptance Criteria

1. **HyperFrames `0.9.94` Contract Compliance & Exact Version Resolution:**
   - `probe()` resolves an exact pinned `0.9.94` runtime (`detectedVersion === '0.9.94'`, flagging any mismatched version as `unverified`), accurately reports missing `ffmpeg`/`ffprobe`/`node22`/`hyperframes` from real `0.9.94` `doctor --json` `checks[]`, and surfaces `_meta.version`.
   - `validate()` enforces strict precedence (`unsupported` > `error` > `failed` > `partial` > `passed`), keeps `ValidationReport.status` separate from `productionGate`, marks `partial` only when requested checks were skipped AND `errorCount === 0`, and attaches `inputFingerprint` so edited files invalidate cached reports (`stale: true`).
   - `validate()` parses `lint`, `runtime`, `layout`, `motion`, `contrast`, `craft`, `audio`, `hdr`, and unknown finding sections dynamically.
   - `startPreview()` uses `--foreground --json --no-open`, attaches `--force-new` only when replacing an unhealthy/stale session, and opens external preview strictly via validated loopback URL.
   - `render()` tracks non-TTY `@hf-progress` percentage and stage labels accurately.
2. **Engine-Agnostic File-First Layout & Compatibility:**
   - Newly scaffolded projects create modular `compositions/*.html` (`<template>` + `data-composition-src`), valid `hyperframes.json` (`0.9.94`), `meta.json`, `package.json`, `.orca/`, `styles/style-profile.json`, `frame.md`, `DESIGN.md`, `MOTION.md`, `BRIEF.md`, `STORYBOARD.md`, `SCRIPT.md`, `assets/asset-registry.json`, and `references/sources.json`.
   - Stage 1/2 legacy projects continue to load, inspect, check, and render non-destructively.
3. **Dual-Scope Style & General-Purpose Consistency:**
   - Built-in presets (`technical-explainer-01`, `clean-editorial-01`) and User Library styles (`styles/<styleId>/` including `DESIGN.md` when present) can be applied to multiple projects.
   - Published Host Library versions are immutable; updating a style in the User Library creates a new version and does **not** mutate existing project snapshots.
   - Editing managed tokens in `frame.md` / `MOTION.md` externally triggers reconciliation detection (`getStyleReconciliationDiff`) rather than silent overwrite.
4. **Storyboard, Master Asset Registry & RPC Completeness:**
   - Reordering or renaming frames in `STORYBOARD.md` preserves every permanent `scene_id` and `## Locked` sections.
   - `CompositionDriftReport` detects differences between planned storyboard durations/assets and actual `compositions/*.html`.
   - `asset-registry.json` enforces asset invariants (`defaultState` valid, unique `components[].id`, acyclic `parentComponentId` hierarchy, existing dependency/state files, SHA-256 verification), supports arbitrary custom states/types, supports `saveProjectAssetToLibrary` without mutating existing library versions, and blocks unforced removal of assets in use.
   - Every UI/Inspector action (`updateProjectScript`, `upsertResearchSource`/`deleteResearchSource`, asset state management via `updateAssetMetadata`, `saveProjectAssetToLibrary`, `approveProjectExecution`) has a typed RPC contract.
5. **Security, Concurrency & Crash Recovery:**
   - Render/preview/check subprocess environments never receive user API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.). Authoritative execution approval lives in host-managed `<profileDir>/video-studio/security/trust-store.json` (project files cannot self-approve), covers all HTML/JS/CSS/SVG/asset/config/runtime inputs, re-verifies before Chrome spawn against TOCTOU edits, and prohibits unattended untrusted execution in Phase 02–03.
   - Path validation blocks traversal, UNC/drive escapes, symlinks, and Windows junctions outside project/library roots.
   - Multi-file transactions obey canonical lock order (`HostStyleLibraryLock -> HostAssetLibraryLock -> ProjectMutationQueue`), verify staged + backup files and SHA-256 hashes before `.orca/tx.log` transitions to `'committing'`, detect `expectedRevision` conflicts, handle new-file rollback (`existed: false`), tampered logs, missing backups, interrupted recovery, and perform hash-verified startup crash recovery without overwriting post-crash external agent edits.
   - Preview Session Manager verifies OS `pid`, `creationTimeMs`, resolved `executablePath`, `projectDirRealpath`, `port` ownership, and `sessionId` / server identity before reusing or killing a process.
6. **General-Purpose Renderable Consistency Fixtures (`1080×1920`, `30 FPS`, Two-Tier Smoke + Representative Visual Quality):**
   - Three minimal, deterministic renderable project fixtures validate **both** fast smoke checks (~2s) **and** representative multi-scene visual quality fixtures (~8–12s) with **actual end-to-end HyperFrames `render` execution** (`1080×1920`, `30 FPS`, no full AI generation / Agent Runner required):
     - **Fixture A (Technical Explainer — AC Mechanism):** Verifies modular sub-compositions, `## Frame N` transitions (`STORYBOARD.md`), `technical-explainer-01` visual tokens & word-highlight subtitle styling, multi-state animatable SVG asset (`closed` -> `cutaway` -> `operating` with non-360°-congruent `#fan` rotation angles across sample timestamps) without changing asset ID, real MP4 render output (`ffprobe` dimensions/fps/duration), seek determinism, pixel proof that style + asset states affect rendered frames, and golden-frame visual regression.
     - **Fixture B (General Explainer — Inflation):** Verifies the **exact same** `technical-explainer-01` Style Profile applied to a non-technical topic and different assets, zero regressions when Host Library updates, portable directory relocation, real MP4 render output, and golden-frame visual regression.
     - **Fixture C (Alternative Style — Product Showcase):** Verifies `clean-editorial-01` applied cleanly (visually distinct palette/typography/subtitle from `technical-explainer-01`), proving Video Core and UI are not hardcoded to technical explainers, with real MP4 render output and golden-frame visual regression.
   - **Mandatory Gate Semantics:** Actual render smoke & visual regression tests are a **mandatory release gate** wherever prerequisites (`hyperframes 0.9.94`, Chrome, `ffmpeg`, `ffprobe`) exist or `ORCA_REQUIRE_RENDER_SMOKE=1` is set; skipped render checks due to missing local prerequisites MUST be reported as `[PREREQUISITE_MISSING]` and MUST NEVER be counted as passing end-to-end render validation.

---

## 15. Detailed Test Plan

Aligned with `AGENTS.md` (focusing on real code invariants, parsing/round-trips, security boundaries, persistence/crash recovery, cross-platform Windows filesystem invariants, and real render visual fixtures — avoiding low-value UI glue tests):

1. **Upstream CLI `0.9.94` Fixture Contract Tests (`hyperframes-engine-adapter.test.ts`, `hyperframes-cli-parsers.test.ts`):**
   - Capture real outputs from `hyperframes 0.9.94` into `src/main/video-studio/engines/__fixtures__/`: `doctor-ready.json`, `doctor-missing-ffmpeg.json`, `check-passed.json`, `check-failed-contrast-layout.json`, `check-browser-skipped.json`, `check-hdr-unknown-section.json`, `preview-started.json`, `render-progress.txt`.
   - Assert exact `0.9.94` version pinning (rejecting unverified version drift), 5-state `ValidationReport` precedence (`errorCount > 0` + `browserSkipped: true` -> `failed`; `errorCount === 0` + `browserSkipped: true` -> `partial` with `productionGate.allowed = false`), `inputFingerprint` staleness invalidation, and non-TTY `@hf-progress` parsing.
2. **Markdown Round-Trip & Drift Detection Tests (`video-studio-documents.test.ts`):**
   - `STORYBOARD.md`, `SCRIPT.md`, `BRIEF.md`, `references/sources.json` parse -> reorder -> patch -> reparse invariant: `scene_id` immutable, `## Locked` and unknown `extra` keys preserved, CRLF/LF round-trip safe.
   - `frame.md` / `DESIGN.md` / `MOTION.md` targeted frontmatter sync preserves prose; external agent edits to managed colors/fonts trigger `getStyleReconciliationDiff` and both reconciliation paths (`import-from-markdown` and `reapply-json`).
   - Planned-vs-actual composition diff accurately flags duration mismatch (`6s` planned vs `8s` actual) and unmounted scenes.
3. **Asset Registry Invariant Tests (`video-studio-asset-registry.test.ts`):**
   - Reject missing `defaultState` in `states`, duplicate `components[].id`, cyclic `components[].parentComponentId` hierarchies, missing state/dependency files, and corrupted SHA-256 hashes; verify immutable Host Library versioning (`saveProjectAssetToLibrary` creates `v<n+1>`, leaves `v<n>` untouched) and project snapshot isolation.
4. **Multi-File Transaction, Lock Order & Crash Recovery Tests (`video-studio-transactions.test.ts`):**
   - Verify backups + staged files are written and hash-verified before `.orca/tx.log` reaches `'committing'`; failure during staging leaves targets untouched and removes `.orca/tx.log`.
   - New-file rollback (`existed: false` unlinks newly created targets), corrupt/missing backup detection, tampered `.orca/tx.log` journal rejection, and interrupted recovery idempotency.
   - Simulated crash mid-commit (`.orca/tx.log` left on disk): clean hashes recover deterministically; external agent edit after partial commit refuses blind rollback and surfaces `video_studio_tx_recovery_conflict`.
   - `expectedRevision` conflict returns `video_studio_file_conflict`.
   - Concurrent mutations across two projects targeting shared Host Style/Asset Libraries serialize without deadlock under canonical lock order (`HostStyleLibraryLock -> HostAssetLibraryLock -> ProjectMutationQueue`).
5. **Windows-Specific Security & Filesystem Invariant Tests (`video-studio-composition-paths.test.ts`, `video-studio-preview-session.test.ts`, `host-video-engine-deps.test.ts`):**
   - Path traversal (`../`, `..\`, NUL byte, UNC/drive prefix), Windows case-insensitive collisions, and symlink/junction containment bypass attempts (creating real temp symlink/junction pointing outside project root and verifying `realpath` check rejects it).
   - `host-video-engine-deps` env allowlist test: confirm `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `TAVILY_API_KEY` in `process.env` are stripped from child process env.
   - Host-managed Trust Store test (`<profileDir>/video-studio/security/trust-store.json`): confirms project-local files cannot self-approve, tests full fingerprint invalidation (HTML/JS/CSS/SVG/assets/config/runtime), pre-spawn TOCTOU re-check, and `video_studio_execution_approval_required` before Chrome check/preview/render.
   - Preview Session Manager: mock PID reuse (`creationTimeMs` / `executablePath` / `projectDirRealpath` / `port` ownership / `sessionId` mismatch) verifies Orca clears stale state without killing unrelated PIDs, and cleans up verified preview processes on `dispose()`.
6. **General-Purpose Render & Consistency Fixture Tests (`video-studio-consistency-fixtures.test.ts` + actual render smoke & quality suite):**
   - Exercise **Fixture A (AC Technical Explainer)**, **Fixture B (Inflation General Explainer)**, and **Fixture C (Product Showcase Alternative Style)** at `1080×1920`, `30 FPS` across both short smoke (~2s) and representative quality (8–12s) compositions: verify snapshot isolation, permanent `scene_id`, stable `asset_id` across states, asset-in-use delete & dynamic-JS-reference file deletion guard, portable relocation copy, **actual HyperFrames `render` MP4 output + `ffprobe` validation**, seek determinism, non-congruent `#fan` rotation visual progression, pixel proof that style & asset states alter output, and **golden-frame PNG visual regression**. Mandatory release gate whenever prerequisites are installed (`ORCA_REQUIRE_RENDER_SMOKE=1` in CI; never mark prerequisite-missing skips as end-to-end validation pass).
7. **RPC, Mobile Bundle & Static Gates:**
   - `video-studio-methods.test.ts` (all new RPC methods including `updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `saveProjectAssetToLibrary`, `approveProjectExecution`, `expectedRevision`, `removeProjectAsset` dependency check, SSH refusal, passthrough error codes).
   - `pnpm run verify:rpc-params-catalog`, `pnpm run build:mobile-web` (Zod tree-shaking check), `pnpm run sync:localization-catalog`, `pnpm run sync:mobile-localization`.
   - Component fixtures in `VideoStudioPage.fixture.tsx` verified via `pnpm fixtures:shot` (desktop & narrow, light & dark) for `research`, `scriptStoryboard`, `scriptAssets`, `styleConflict`, `validationPartial`, and `production`.
   - Final gates: `pnpm tc:node`, `pnpm tc:web`, mobile typecheck, `pnpm check:react-compiler-compat-ratchet`, and `pnpm check:changed --base=main`.

---

## 16. Definition of Done

- All 15 sections above are implemented cleanly on branch `feature/orca-ai-studio` (no merge to `main` until final review).
- HyperFrames `0.9.94` exact version pinning, CLI contract fixtures, security/trust gates, asset/style invariants, transaction hash-verified recovery, and Windows filesystem tests pass.
- Three consistency fixture projects (Technical Explainer, General Explainer, Alternative Style) verify style reuse, snapshot isolation, permanent `scene_id`, multi-state animatable assets, dependency portability, actual `1080×1920` `30 FPS` MP4 render smoke output, and golden-frame visual regression.
- `pnpm fixtures:shot`, `pnpm run verify:rpc-params-catalog`, `pnpm run build:mobile-web`, localization verification, typechecks, `check:react-compiler-compat-ratchet`, and `pnpm check:changed --base=main` pass with zero errors.
