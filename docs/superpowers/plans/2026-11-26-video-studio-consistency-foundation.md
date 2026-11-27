# Orca AI Video Studio — Engine-Agnostic Consistency Foundation & HyperFrames `0.9.94` Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 02–03 engine-agnostic, file-first, general-purpose Video Studio consistency foundation inside Orca (`feature/orca-ai-studio`), aligned strictly to pinned HyperFrames `0.9.94` and the Approved Specification, with Dual-Scope Style Profiles (`visual`, `typography`, `camera`, `motion`, `effects`, `composition`, `subtitle`, `provenance`, `openMotionPackageRef`), Universal Motion Registry (`executable` / `knowledge-only` / `planned`), HyperFrames-compatible `STORYBOARD.md` (`## Frame N — Title`), `SCRIPT.md`, Master Asset Registry with immutable Host Library versioning, Host-managed Trust Store outside project directories, crash-safe multi-file transactions, General Chat handoff, 4-stage Native Structured Inspector (`Research`, `Script`, `Style`, `Production`), and two-tier `1080×1920` `30 FPS` render verification fixtures.

**Architecture:** File-first dual-actor architecture keeping structured JSON (`styles/style-profile.json`, `assets/asset-registry.json`) as Orca's canonical tokens paired with targeted Markdown sync (`frame.md`, `DESIGN.md`, `MOTION.md`, `BRIEF.md`, `STORYBOARD.md`, `SCRIPT.md`) and modular `compositions/*.html` files (`<template>` + `data-composition-src`). Host-managed security & runtime state (`security/trust-store.json`, `security/preview-sessions.json`) resides strictly outside project directories. Multi-file mutations serialize via canonical lock order (`HostStyleLibraryLock -> HostAssetLibraryLock -> ProjectMutationQueue`) and hash-verified `.orca/tx.log` staging/backups.

**Tech Stack:** TypeScript, Electron 43, Node.js 22+, Zod v4 (`import * as z from 'zod'` strictly in `src/shared/`), `yaml` (`^2.9.1`), `@orca/process-host`, React 19, Tailwind CSS, Vitest, `oxlint`, `oxfmt`, HyperFrames `0.9.94` CLI.

**Approved Specification (Single Source of Truth):** [2026-11-26-video-studio-consistency-foundation-design.md](file:///C:/Coding/Project/orca/.worktrees/orca-ai-studio/docs/superpowers/specs/2026-11-26-video-studio-consistency-foundation-design.md)

**Scope Boundary:** Active primary engine is pinned HyperFrames `0.9.94`. Full OpenMotion upstream extractor (`Phase 04`), Automated Agent Runner (`Phase 05`), Remotion runtime (`Phase 06`), and Multi-Engine Compositor/3D (`Phases 07–08`) are represented strictly as contracts and extension seams. All work remains on `feature/orca-ai-studio` inside `C:\Coding\Project\orca\.worktrees\orca-ai-studio`; NEVER merge to `main`.

---

## Global Constraints & Execution Rules

- **Windows PowerShell 5.1:** Chain dependent shell commands using `; if ($LASTEXITCODE -eq 0) { ... }` (never `&&`).
- **Vitest Invocation on Windows without MSVC C++ Build Tools:** `pnpm test` triggers `ensure-native-runtime.mjs --runtime=node`; iterate cleanly via `pnpm exec vitest run --config config/vitest.config.ts <paths> --maxWorkers=2`, run `pnpm tc:node` / `pnpm tc:web` / `pnpm run verify:rpc-params-catalog` / `pnpm run build:mobile-web` / `pnpm check:react-compiler-compat-ratchet`, and run `pnpm check:changed --base=main` as the final repository gate.
- **Zod Mobile Tree-Shaking:** Every file under `src/shared/` MUST use `import * as z from 'zod'` cleanly.
- **React Compiler Ratchet:** Zero `try/finally` blocks inside React hooks or components.
- **File Naming (`AGENTS.md`):** Zero vague names (`helpers`, `utils`, `common`, `misc`).
- **Rollback Discipline:** Every task's rollback touches ONLY files created or modified by that specific task (e.g., `git restore --source=HEAD -- <task-files>` or removing task-created untracked paths). NEVER run `git reset --hard` or destructive broad cleanup.

---

## Dependency Order Overview

```text
Task 1 (Baseline Verification & Authentic HyperFrames 0.9.94 Capture + Scaffold Alignment)
  └──> Task 2 (HyperFrames 0.9.94 Engine Adapter, Version Pin, Env Allowlist & 6-Factor Preview Manager)
          └──> Task 3 (Approved Shared Contracts, StyleProfile Schema, Motion Registry, RPC & Error Codes)
                  └──> Task 4 (Containment, Canonical Locks, Hash-Verified TX Journal & Host Trust Store)
                          ├──> Task 5 (Modular 0.9.94 Scaffold & Stage 1/2 Non-Destructive Migration)
                          │       ├──> Task 6 (Dual-Scope Style Presets, Motion Registry, Frame-Based STORYBOARD.md & Drift)
                          │       └──> Task 7 (Master Asset Registry, Dynamic JS Scan Caveat & Immutable Host Library)
                          └──────────────────────────────────────────────────────────────┐
                                                                                         ▼
                                                                             Task 8 (Runtime RPC, Watcher & Handoff)
                                                                                         └──> Task 9 (4-Stage Native Inspector UI)
                                                                                                 └──> Task 10 (Two-Tier Render Fixtures 1080x1920@30fps, Visual Quality & Gates)
```

---

## Task 1: Baseline Verification, Live HyperFrames `0.9.94` Capture & Upstream Scaffold Check

**Dependencies:** None (must execute before any production code edit).

**Files:**

- Create (Real CLI Captures): `src/main/video-studio/engines/__fixtures__/captured/hyperframes-version.txt`
- Create (Real CLI Captures): `src/main/video-studio/engines/__fixtures__/captured/doctor-actual.json`
- Create (Real CLI Captures): `src/main/video-studio/engines/__fixtures__/captured/init-check-no-browser.json`
- Create (Real CLI Captures): `src/main/video-studio/engines/__fixtures__/captured/init-check-browser.json` (when Chrome passes/fails locally — captured verbatim, whether `ok: true` or browser error)
- Create (Real CLI Captures): `src/main/video-studio/engines/__fixtures__/captured/preview-start-actual.json` (started and stopped against disposable temp project)
- Create (Real CLI Captures): `src/main/video-studio/engines/__fixtures__/captured/render-actual-probe.txt` (captured real `hyperframes render` CLI output / missing-ffmpeg diagnostic on current host)
- Create (Real CLI Captures): `src/main/video-studio/engines/__fixtures__/captured/upstream-scaffold-report.md` (verbatim comparison of `hyperframes init` files: `meta.json`, `hyperframes.json`, `package.json`, `index.html`, `compositions/*`, timeline registration)
- Create (Explicitly Synthetic Edge Cases): `src/main/video-studio/engines/__fixtures__/synthetic/doctor-ready.json`
- Create (Explicitly Synthetic Edge Cases): `src/main/video-studio/engines/__fixtures__/synthetic/check-failed-contrast-layout.json`
- Create (Explicitly Synthetic Edge Cases): `src/main/video-studio/engines/__fixtures__/synthetic/check-hdr-unknown-section.json`
- Create (Explicitly Synthetic Edge Cases): `src/main/video-studio/engines/__fixtures__/synthetic/render-progress.txt`

**Acceptance Criteria:**

1. Worktree state is clean before Task 1 code starts; baseline Vitest (existing Video Studio suite), `tc:node`, `tc:web`, and `oxlint` pass before any code edit.
2. Live outputs from installed `hyperframes 0.9.94` (`doctor --json`, `init`, `check --json --no-browser`, `check --json`, `preview --foreground --json --no-open`, `render`) are executed against a temporary directory and stored verbatim under `captured/`, strictly separated from `synthetic/` edge-case fixtures.
3. Exact differences or confirmations vs Approved Spec (scaffold files `meta.json`, `hyperframes.json`, `package.json`, root `<template>`/`data-composition-src`, `window.__timelines` / `hyperframes` registration, `preview` JSON shape) are documented in `upstream-scaffold-report.md`.

**Rollback Considerations:** Revert only `src/main/video-studio/engines/__fixtures__` (`Remove-Item -Recurse` or `git checkout -- ...`).

- [ ] **Step 1: Verify clean worktree baseline, Vitest baseline, Typechecks, and `oxlint` BEFORE touching code**

Run in `C:\Coding\Project\orca\.worktrees\orca-ai-studio`:

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
git status --short
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-project.test.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts src/main/video-studio/video-studio-job-manager.test.ts src/main/video-studio/video-studio-catalog.test.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts --maxWorkers=2
if ($LASTEXITCODE -eq 0) { pnpm tc:node }
if ($LASTEXITCODE -eq 0) { pnpm tc:web }
if ($LASTEXITCODE -eq 0) { pnpm exec oxlint src/main/video-studio src/shared/video-studio src/renderer/src/components/video-studio src/renderer/src/runtime/video-studio }
```

Expected: All baseline checks exit `0`.

- [ ] **Step 2: Capture authentic `hyperframes 0.9.94` CLI outputs and inspect scaffold structure against a disposable temp folder**

Run in PowerShell:

```powershell
$capDir = "C:\Coding\Project\orca\.worktrees\orca-ai-studio\src\main\video-studio\engines\__fixtures__\captured"
$synDir = "C:\Coding\Project\orca\.worktrees\orca-ai-studio\src\main\video-studio\engines\__fixtures__\synthetic"
New-Item -ItemType Directory -Force -Path $capDir, $synDir | Out-Null

hyperframes --version | Out-File -Encoding utf8 "$capDir\hyperframes-version.txt"
hyperframes doctor --json | Out-File -Encoding utf8 "$capDir\doctor-actual.json"

$tmp = Join-Path $env:TEMP "hf-cap-$(Get-Random)"
hyperframes init $tmp --non-interactive --format json | Out-Null
Push-Location $tmp
hyperframes check --json --no-browser | Out-File -Encoding utf8 "$capDir\init-check-no-browser.json"
hyperframes check --json | Out-File -Encoding utf8 "$capDir\init-check-browser.json"
Pop-Location

# Capture live preview JSON by spawning hyperframes preview --foreground --json --no-open until first JSON line prints, then stopping it cleanly:
$psi = New-Object System.Diagnostics.ProcessStartInfo("cmd.exe", "/c hyperframes preview `"$tmp`" --foreground --json --no-open")
$psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false
$proc = [System.Diagnostics.Process]::Start($psi)
$line = $proc.StandardOutput.ReadLine()
$line | Out-File -Encoding utf8 "$capDir\preview-start-actual.json"
hyperframes preview $tmp --stop | Out-Null
if (-not $proc.HasExited) { $proc.Kill() }

# Capture actual render attempt / prerequisite diagnostic cleanly:
cmd /c "hyperframes render `"$tmp`" -o `"$tmp\out.mp4`" --quiet 2>&1" | Out-File -Encoding utf8 "$capDir\render-actual-probe.txt"

# Record verbatim tree + key scaffold file shapes (meta.json, hyperframes.json, package.json, index.html, compositions/*) into upstream-scaffold-report.md
Remove-Item -Recurse -Force $tmp
```

Verify every captured file contains real output from `hyperframes 0.9.94` before proceeding (no BOM issues; normalize UTF-8 without BOM cleanly if needed).

- [ ] **Step 3: Write clearly labeled synthetic edge-case fixtures under `synthetic/`**

Create ONLY the 4 documented synthetic edge-case test payloads inside `src/main/video-studio/engines/__fixtures__/synthetic/` (`doctor-ready.json`, `check-failed-contrast-layout.json`, `check-hdr-unknown-section.json`, `render-progress.txt`) with an internal comment/meta field marking `"fixtureSource": "synthetic-edge-case"` so parsers never confuse them with captured CLI output.

- [ ] **Step 4: Commit Task 1**

```powershell
git add "src/main/video-studio/engines/__fixtures__"; if ($LASTEXITCODE -eq 0) { git commit -m "test(video-studio): capture authentic hyperframes 0.9.94 CLI fixtures and baseline scaffold report" }
```

---

## Task 2: HyperFrames `0.9.94` Engine Adapter, Exact Pinning, Env Allowlist & 6-Factor Preview Manager

**Dependencies:** Task 1 (verified CLI payloads).

**Files:**

- Modify: `src/main/video-studio/engines/video-render-engine.ts`
- Modify: `src/main/video-studio/engines/hyperframes-cli-parsers.ts`
- Modify: `src/main/video-studio/engines/hyperframes-environment-probe.ts`
- Modify: `src/main/video-studio/engines/hyperframes-engine-adapter.ts`
- Modify: `src/main/video-studio/engines/host-video-engine-deps.ts`
- Modify: `src/main/video-studio/engines/remotion-engine-adapter.ts`
- Create: `src/main/video-studio/video-studio-preview-manager.ts`
- Create: `src/main/video-studio/engines/hyperframes-cli-parsers.test.ts`
- Create: `src/main/video-studio/engines/host-video-engine-deps.test.ts`
- Modify: `src/main/video-studio/engines/hyperframes-engine-adapter.test.ts`
- Create: `src/main/video-studio/video-studio-preview-session.test.ts`

**Acceptance Criteria:**

1. `HYPERFRAMES_PINNED_VERSION = '0.9.94'` enforces **exact string semver equality** (`detectedVersion === '0.9.94'`); deterministic runtime resolution checks Orca-managed/pinned executable before PATH (`versionCompatibility: 'exact' | 'unverified' | 'missing'`).
2. `parseHyperFramesDoctorJson` handles actual `captured/doctor-actual.json` (`checks[]` + `_meta.version`) plus `synthetic/doctor-ready.json`.
3. `parseHyperFramesCheckJson` handles `captured/init-check-no-browser.json`, `captured/init-check-browser.json`, and `synthetic/check-*.json`, dynamically discovering sections (`lint`, `runtime`, `layout`, `motion`, `contrast`, `craft`, `audio`, `hdr`, plus unknown sections with `findings[]`), evaluating strict precedence `unsupported > error > failed > partial > passed`, keeping `status` independent of `productionGate`, and attaching full `inputFingerprint`.
4. `startPreview()` executes `--foreground --json --no-open`, attaches `--force-new` ONLY when replacing an unhealthy/orphaned session confirmed to belong to that project, validates returned URL via `normalizeExternalBrowserUrl`, and records a **6-factor session record** in host-managed `<profileDir>/video-studio/security/preview-sessions.json`.
5. `VideoStudioPreviewManager` verifies **all six factors** before reusing or stopping a session:
   - `pid` exists
   - `creationTimeMs` matches OS process table ([windows-process-table.ts](file:///C:/Coding/Project/orca/.worktrees/orca-ai-studio/src/main/windows/windows-process-table.ts) on Windows; `ps` on POSIX)
   - Resolved `executablePath` matches expected Node/HyperFrames runtime executable (never generic substring `'hyperframes'`)
   - Canonical `projectDirRealpath` in command line args/cwd matches the project directory
   - `port` ownership confirmed on loopback PID + HTTP response/headers/project identity check (never generic `HTTP 200` alone)
   - `sessionId` matches stored session identity
6. `buildSanitizedVideoEngineEnv` enforces explicit non-secret allowlist (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `TAVILY_API_KEY`, etc. stripped).

**Rollback Considerations:** Revert only the modified/created files in `src/main/video-studio/engines/` and `video-studio-preview-manager.ts` (`git restore --source=<pre-task2-sha> -- ...` + remove newly created Task 2 files).

- [ ] **Step 1: Write failing tests covering real `captured/` + `synthetic/` fixtures, exact `0.9.94` pin, 6-factor preview identity verification, and env allowlist**

1. Create `src/main/video-studio/engines/hyperframes-cli-parsers.test.ts` reading verbatim from BOTH `__fixtures__/captured/` (`doctor-actual.json`, `init-check-no-browser.json`, `preview-start-actual.json`) and `__fixtures__/synthetic/` (`doctor-ready.json`, `check-failed-contrast-layout.json`, `check-hdr-unknown-section.json`, `render-progress.txt`). Assert exact `0.9.94` match (`0.9.95` & `0.9.93` return `versionCompatibility: 'unverified'`), strict precedence (`failed` > `partial` when `errorCount > 0` AND `browserSkipped: true`), and zero false `partial` when `ok: true` + `browserSkipped: false` + 0 errors.
2. Create `src/main/video-studio/engines/host-video-engine-deps.test.ts` testing `buildSanitizedVideoEngineEnv` strips `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `TAVILY_API_KEY`, `ORCA_*` secrets while preserving `PATH`, `SystemRoot`, `TEMP`, non-secret `HYPERFRAMES_*` flags.
3. Create `src/main/video-studio/video-studio-preview-session.test.ts` verifying ALL 6 verification mismatch cases (stale `creationTimeMs`, wrong `executablePath`, wrong `projectDirRealpath`, port owned by another PID / wrong project marker, mismatched `sessionId`, and dead PID) clear stale state WITHOUT killing unrelated OS processes, and `--force-new` triggers ONLY when replacing a confirmed unhealthy session for that same project.
4. Update `src/main/video-studio/engines/hyperframes-engine-adapter.test.ts` to assert pinned `0.9.94`, `--foreground --json --no-open`, conditional `--force-new`, `RemotionEngineAdapter.checkProject()` returning `status: 'unsupported'`.

- [ ] **Step 2: Run the failing Task 2 test files**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/engines/hyperframes-cli-parsers.test.ts src/main/video-studio/engines/host-video-engine-deps.test.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts src/main/video-studio/video-studio-preview-session.test.ts --maxWorkers=2
```

Expected: FAIL.

- [ ] **Step 3: Implement `hyperframes-cli-parsers.ts`, `hyperframes-environment-probe.ts`, `hyperframes-engine-adapter.ts`, `host-video-engine-deps.ts`, `remotion-engine-adapter.ts`, `video-render-engine.ts`, and `video-studio-preview-manager.ts`**

Ensure `VideoStudioPreviewManager` stores authoritative state inside `<profileDir>/video-studio/security/preview-sessions.json` using `AtomicSnapshotWriter` and verifies OS socket ownership + HTTP project identity + executablePath + creationTimeMs + projectDirRealpath + sessionId cleanly.

- [ ] **Step 4: Run Task 2 tests and `pnpm tc:node`**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/engines/hyperframes-cli-parsers.test.ts src/main/video-studio/engines/host-video-engine-deps.test.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts src/main/video-studio/video-studio-preview-session.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/main/video-studio/engines/ src/main/video-studio/video-studio-preview-manager.ts src/main/video-studio/video-studio-preview-session.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): align hyperframes 0.9.94 CLI adapter, env allowlist, and 6-factor preview manager" }
```

---

## Task 3: Approved Shared Data Contracts, `StyleProfile` Schema, Motion Registry & Complete RPCs

**Dependencies:** Task 2.

**Files:**

- Modify: `src/shared/video-studio/video-studio-project.ts` (expand `workflowStage` enum to `['research', 'script', 'style', 'production']` while keeping defaults/backwards compatibility)
- Create: `src/shared/video-studio/video-studio-validation-contract.ts`
- Modify: `src/main/video-studio/engines/video-render-engine.ts` (re-export `ValidationStatus` / `ValidationReport` from `src/shared/video-studio/video-studio-validation-contract.ts`)
- Create: `src/shared/video-studio/video-studio-style-contract.ts` (EXACT Approved Spec `StyleProfile`: `visual`, `typography`, `camera`, `motion`, `effects`, `composition`, `subtitle`, `provenance`, `openMotionPackageRef`)
- Create: `src/shared/video-studio/video-studio-storyboard-contract.ts` (`SceneSpec` matching `## Frame N — Title`, `duration`, `transitionIn`, `engine`, `src`, `assets`, `voiceover`, `motionPresets`, `camera`, `narrativeRole`, `lockedSections`, `extra` + `VideoStudioResearchSource`)
- Create: `src/shared/video-studio/video-studio-asset-contract.ts` (`validateMasterAssetInvariants` + `dynamicReferenceWarning`)
- Create: `src/shared/video-studio/motion-registry-contract.ts` (`MotionPresetMetadata` with `executionKind: 'executable' | 'knowledge-only' | 'planned'`, `implementations` status `'executable' | 'knowledge-only' | 'planned' | 'unsupported'`)
- Create: `src/main/video-studio/extensions/motion-package-contract.ts` (OpenMotion v0.2 contract seam matching Spec Section 6.E.2)
- Modify: `src/shared/video-studio/video-studio-rpc-contract.ts` (EXACT Approved Spec RPC names + `updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `saveProjectAssetToLibrary`, `approveProjectExecution`)
- Modify: `src/main/runtime/rpc/runtime-passthrough-codes.ts`
- Modify: `src/shared/video-studio/video-studio-project.test.ts`
- Create: `src/shared/video-studio/video-studio-contracts.test.ts`

**Critical Constraint:** All `src/shared/` modules MUST strictly use `import * as z from 'zod'`.

**Acceptance Criteria:**

1. `StyleProfileSchema` includes all 9 approved blocks verbatim: `visual`, `typography`, `camera`, `motion`, `effects`, `composition`, `subtitle`, `provenance`, `openMotionPackageRef`.
2. `MotionPresetMetadataSchema` enforces `executionKind: 'executable' | 'knowledge-only' | 'planned'` and prevents reporting `knowledge-only` or `planned` presets as `executable`.
3. `VideoStudioProjectSchema.workflowStage` supports `'research' | 'script' | 'style' | 'production'`.
4. `video-studio-rpc-contract.ts` uses EXACT Spec RPC names (`saveLibraryStyleProfile`, `duplicateStyleProfile`, `deleteLibraryStyleProfile`, `getProjectStyleState`, `applyStyleProfileToProject`, `updateProjectStyleTokens`, `getStyleReconciliationDiff`, `reconcileProjectStyle`, `getProjectDocuments`, `updateProjectBrief`, `updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `approveProjectExecution`, `addStoryboardFrame`, `patchStoryboardFrame`, `deleteStoryboardFrame`, `reorderStoryboardFrames`, `listLibraryAssets`, `listProjectAssets`, `registerOrImportAsset`, `updateAssetMetadata`, `applyLibraryAssetToProject`, `saveProjectAssetToLibrary`, `removeProjectAsset`, `deleteLibraryAsset`, `listMotionPresets`).
5. `validateMasterAssetInvariants` rejects invalid `defaultState`, duplicate `components[].id`, unknown or cyclic `components[].parentComponentId`.

**Rollback Considerations:** Revert only Task 3 files (`git restore` modified files + delete newly created contract files).

- [ ] **Step 1: Write failing contract tests (`src/shared/video-studio/video-studio-contracts.test.ts`)**

Test:

- Full `StyleProfileSchema` validation with `visual`, `typography`, `camera`, `motion`, `effects`, `composition`, `subtitle`, `provenance`, `openMotionPackageRef`.
- `MotionPresetMetadataSchema` cleanly distinguishes `executable` vs `knowledge-only` vs `planned`.
- `validateMasterAssetInvariants` checks `defaultState`, unique IDs, and acyclic `parentComponentId`.
- Zod validation of ALL new RPC param schemas (`updateProjectStyleTokens`, `saveLibraryStyleProfile`, `addStoryboardFrame`, `patchStoryboardFrame`, `reorderStoryboardFrames`, `updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `saveProjectAssetToLibrary`, `approveProjectExecution`).
- `VideoStudioProjectSchema` accepting `'style'` stage while preserving Stage 1 defaults in `video-studio-project.test.ts`.

- [ ] **Step 2: Run the failing Task 3 tests**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-contracts.test.ts src/shared/video-studio/video-studio-project.test.ts --maxWorkers=2
```

Expected: FAIL.

- [ ] **Step 3: Implement all approved shared schemas, OpenMotion contract seam, RPC contracts, and passthrough codes**

Keep `import * as z from 'zod'` in every `src/shared/` file. Verify no duplicate `ValidationReport` type between `src/shared/video-studio/video-studio-validation-contract.ts` and `src/main/video-studio/engines/video-render-engine.ts`.

- [ ] **Step 4: Run Task 3 tests, `verify:rpc-params-catalog`, `tc:node`, and `build:mobile-web` check**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-contracts.test.ts src/shared/video-studio/video-studio-project.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm run verify:rpc-params-catalog }; if ($LASTEXITCODE -eq 0) { pnpm tc:node }; if ($LASTEXITCODE -eq 0) { pnpm run build:mobile-web }
```

Expected: All pass and mobile Zod tree-shaking passes.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/shared/video-studio/ src/main/video-studio/extensions/ src/main/video-studio/engines/video-render-engine.ts src/main/runtime/rpc/runtime-passthrough-codes.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): align shared StyleProfile, MotionRegistry, Storyboard, Asset, and RPC contracts with spec" }
```

---

## Task 4: Containment, Canonical Lock Order, Hash-Verified Transactions & Host-Managed Trust Store

**Dependencies:** Task 3.

**Files:**

- Create: `src/main/video-studio/video-studio-path-containment.ts`
- Create: `src/main/video-studio/video-studio-transactions.ts`
- Create: `src/main/video-studio/video-studio-trust-store.ts`
- Modify: `src/main/video-studio/video-studio-composition-paths.ts`
- Modify: `src/main/video-studio/video-studio-composition-paths.test.ts`
- Create: `src/main/video-studio/video-studio-transactions.test.ts`

**Acceptance Criteria:**

1. Path containment rejects traversal (`..`), NUL, UNC/drive prefixes, mixed separators, symlinks, and Windows directory junctions escaping project/style/asset canonical roots.
2. **Host-Managed Trust Store (`<profileDir>/video-studio/security/trust-store.json`):**
   - Stores authoritative trust decisions strictly OUTSIDE project directories, keyed by `(projectId, projectRootRealpath)`.
   - **Project files (including `.orca/project-state.json`) can NEVER approve themselves.**
   - `computeProjectInputFingerprint` hashes ALL executable HTML (`index.html`, `compositions/**/*.html`, `scenes/**/*.html`), referenced/present `.js`/`.mjs`/`.css`/`.svg` under project/assets/compositions, `hyperframes.json`, `package.json`, `styles/style-profile.json`, `assets/asset-registry.json`, `engineConfig`, AND `runtimeIdentity` (`hyperframes@0.9.94`).
   - Enforced before Chrome-based `check`, `preview`, AND `render`, including **pre-spawn TOCTOU re-verification / verified execution snapshot capture** right before spawning Chrome.
   - Preserves strict prohibition against unattended execution of untrusted sources in Phase 02–03.
3. **Canonical Lock Order & TX Journal (`.orca/tx.log`):**
   - Enforces `HostStyleLibraryLock -> HostAssetLibraryLock -> ProjectMutationQueue[projectId]` strictly (throws internal invariant error if caller attempts inverted nesting).
   - Writes backups + staged files -> **verifies existence & SHA-256 of ALL staged files AND backups on disk BEFORE `.orca/tx.log` advances to `'committing'`**.
   - Startup `recoverPendingProjectTransaction` handles: (a) clean commit/rollback, (b) new-file rollback (`existed: false` unlinks newly created targets), (c) missing/corrupt backup refusal -> `video_studio_tx_recovery_conflict`, (d) tampered/corrupt `.orca/tx.log` refusal -> `video_studio_tx_recovery_conflict`, (e) interrupted recovery idempotency, and (f) external agent post-crash edits preserved cleanly (`tx-conflict-<txId>.json`).

**Rollback Considerations:** Revert only Task 4 files (`git restore` + unlink Task 4 newly created modules).

- [ ] **Step 1: Write failing containment, host-managed trust store, full fingerprint, and comprehensive TX recovery tests**

Create `src/main/video-studio/video-studio-transactions.test.ts` testing:

1. Symlink & Windows junction containment bypass rejection.
2. Transaction phases `'preparing' -> 'staged-verified' -> 'committing' -> 'committed'` + `expectedRevision` rejection (`video_studio_file_conflict`).
3. New-file TX rollback (`existed: false` unlinks partially created file cleanly on failure).
4. Missing or corrupt backup file refusal -> `video_studio_tx_recovery_conflict` without corrupting targets.
5. Tampered/malformed `.orca/tx.log` detection -> `video_studio_tx_recovery_conflict`.
6. Interrupted recovery idempotency (calling `recoverPendingProjectTransaction` twice after interruption produces clean consistent result without losing files) AND preserving external agent edits untouched.
7. Concurrent cross-project shared Host Library + Project lock serialization without deadlock (verifying inverted lock request fails deterministically).
8. **Host-Managed Trust Store (`<profileDir>/video-studio/security/trust-store.json`):**
   - Writing `{ trustState: 'approved' }` directly inside `projects/<projectId>/.orca/project-state.json` STILL throws `video_studio_execution_approval_required`!
   - Changing a `.js`, `.css`, `.svg`, `hyperframes.json`, or `runtimeIdentity` invalidates `inputFingerprint` and revokes execution until re-approved via host store.
   - Pre-spawn verification catches TOCTOU file modification after approval (`video_studio_execution_approval_required`).

- [ ] **Step 2: Run the failing Task 4 test**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-transactions.test.ts --maxWorkers=2
```

Expected: FAIL.

- [ ] **Step 3: Implement `video-studio-path-containment.ts`, `video-studio-transactions.ts`, `video-studio-trust-store.ts`, and update `video-studio-composition-paths.ts`**

Include `resolveHostVideoSecurityDir(profileDir)` and `withExecutionVerifiedSnapshot` helper ensuring TOCTOU safety before Chrome launch.

- [ ] **Step 4: Run Task 4 tests + `pnpm tc:node`**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/video-studio-transactions.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add src/main/video-studio/video-studio-path-containment.ts src/main/video-studio/video-studio-transactions.ts src/main/video-studio/video-studio-trust-store.ts src/main/video-studio/video-studio-composition-paths.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/video-studio-transactions.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): implement host-managed trust store, hash-verified TX journal, and containment" }
```

---

## Task 5: Modular HyperFrames `0.9.94` Project Scaffold & Stage 1/2 Non-Destructive Migration

**Dependencies:** Task 4 (containment & TX journal) & Task 1 (`upstream-scaffold-report.md`).

**Files:**

- Modify: `src/main/video-studio/video-studio-hyperframes-template.ts`
- Modify: `src/main/video-studio/video-studio-composition-paths.ts`
- Modify: `src/main/video-studio/video-studio-catalog.ts`
- Modify: `src/main/video-studio/video-studio-composition-paths.test.ts`

**Acceptance Criteria:**

1. Fresh scaffolding matches Approved Spec Section 6 verbatim AND passes `hyperframes check --json --no-browser` from installed `0.9.94`:
   - `meta.json`, `hyperframes.json` (`paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }`), `package.json`, `.gitignore`, `.orca/schema-version.json` (`schemaVersion: 2`), `BRIEF.md`, `frame.md`, `DESIGN.md`, `MOTION.md`, `STORYBOARD.md` (with `## Frame 1 — Opening`), `SCRIPT.md`, `styles/style-profile.json`, `assets/asset-registry.json`, `assets/{objects,characters,environments,graphics,models,audio,video}/`, `references/sources.json`, `references/research-notes.md`, `index.html` (`<template>` + `data-composition-src`), `compositions/01-opening.html`, `compositions/components/`.
2. Stage 2 non-destructive upgrade (`overwrite: false`) NEVER deletes `scenes/` and NEVER overwrites custom `index.html`; upgrades `hyperframes.json` only when missing or matching exact legacy Stage 2 5-key object.
3. `inspectVideoStudioCompositionState` scans both `compositions/**/*.html` and `scenes/**/*.html`.

**Rollback Considerations:** Revert only `video-studio-hyperframes-template.ts`, `video-studio-composition-paths.ts`, `video-studio-catalog.ts`, and `video-studio-composition-paths.test.ts`.

- [ ] **Step 1: Add failing modular scaffold, Stage 2 migration, and HyperFrames `0.9.94` lint/check compatibility tests in `video-studio-composition-paths.test.ts`**

Test fresh scaffold files (`compositions/01-opening.html`, `assets/models/`, `STORYBOARD.md` containing `## Frame 1 —`), Stage 2 legacy upgrade preserving `scenes/` & custom `index.html`, and XSS escaping in HTML/Markdown seeds.

- [ ] **Step 2: Run the failing Task 5 test**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts --maxWorkers=2
```

Expected: FAIL.

- [ ] **Step 3: Implement modular scaffold & non-destructive legacy migration**

Update `video-studio-hyperframes-template.ts`, `video-studio-composition-paths.ts`, and `video-studio-catalog.ts` cleanly using real HyperFrames `0.9.94` verified template structure (`<template>` + `data-composition-src` + `window.__timelines` registration) observed in Task 1.

- [ ] **Step 4: Verify against Task 5 tests AND live `hyperframes check --json --no-browser` on a scaffolded project**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/video-studio-catalog.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/main/video-studio/video-studio-hyperframes-template.ts src/main/video-studio/video-studio-composition-paths.ts src/main/video-studio/video-studio-catalog.ts src/main/video-studio/video-studio-composition-paths.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): scaffold 0.9.94 modular compositions with safe Stage 2 migration" }
```

---

## Task 6: Dual-Scope `StyleProfile` Presets, Universal Motion Registry, `## Frame N` Storyboard & Drift

**Dependencies:** Task 4 & Task 5.

**Files:**

- Create: `src/main/video-studio/style/builtin-style-presets.ts` (`technical-explainer-01` + `clean-editorial-01` using FULL approved schema!)
- Create: `src/main/video-studio/style/video-studio-style-store.ts`
- Create: `src/main/video-studio/motion/builtin-motion-presets.ts`
- Create: `src/main/video-studio/documents/video-studio-markdown-sync.ts`
- Create: `src/main/video-studio/documents/video-studio-composition-drift.ts`
- Create: `src/main/video-studio/documents/video-studio-documents.test.ts`

**Acceptance Criteria:**

1. `technical-explainer-01` faithfully encodes: warm cream/beige (`#F7F3E9` / `#EFE7D6`), charcoal `#1E242B`, blue `#2563EB` / orange `#EA580C` accents, yellow `#FACC15` highlight, `2.5d-semi-realistic`, bold sans-serif (`Space Grotesk` / `Inter` / `JetBrains Mono`), `orthographic` camera (`pan`, `zoom`, `match-cut`), `word-highlight` black-pill subtitles (`#111827`, `#FFFFFF`, `#FACC15`), plus full `effects`, `composition`, `provenance` fields.
2. `clean-editorial-01` encodes distinct general-purpose visual tokens (`flat-editorial`, `2d-flat`, `anchor-rail` subtitles, warm paper `#FAF9F6`, cobalt `#1D4ED8`).
3. `STORYBOARD.md` round-trips strictly via HyperFrames-compatible `## Frame N — Title` + snake_case bullets (`scene_id`, `status`, `duration`, `transition_in`, `engine`, `src`, `assets`, `motion_presets`, `camera`, `narrative_role`, `voiceover`), preserving `## Locked`, CRLF/LF, unknown keys, and permanent `scene_id` across frame reorders/renames; internally exposes clean camelCase `SceneSpec` objects.
4. Every `motion_presets` item in default templates & presets resolves cleanly to a registered namespaced ID in `UniversalMotionRegistry` (`camera.smooth_zoom`, `camera.pan`, `typography.counter_up`, `typography.word_highlight`, `object.pop_in`, `diagram.flow_path`, `chart.line_draw`), explicitly distinguishing `executable`, `knowledge-only`, and `planned` statuses (never reporting `knowledge-only`/`planned` as `executable`).
5. Style reconciliation (`getStyleReconciliationDiff` + `reconcileProjectStyle`), `expectedRevision` checks across all mutation methods (`updateProjectBrief`, `updateProjectScript`, `addStoryboardFrame`, `patchStoryboardFrame`, `deleteStoryboardFrame`, `reorderStoryboardFrames`, `updateProjectStyleTokens`, `saveLibraryStyleProfile`), and Host Library snapshot isolation pass.

**Rollback Considerations:** Remove/restore only `style/`, `motion/`, and `documents/` subdirectories.

- [ ] **Step 1: Write failing round-trip, full-StyleProfile, Motion Registry status, reconciliation, and drift tests in `src/main/video-studio/documents/video-studio-documents.test.ts`**

Test verbatim HyperFrames `## Frame 1 — Remote Temperature Trigger` fixture parsing -> reorder -> rename -> reparse (permanent `scene_id`, `## Locked`, `extra` YAML, CRLF), full 9-block `StyleProfile` snapshot isolation + `DESIGN.md` preservation in Host Style Library, external `frame.md` token drift detection + both reconciliation modes, Motion Registry separating `executable` vs `knowledge-only` vs `planned`, and `computeCompositionDrift`.

- [ ] **Step 2: Run the failing Task 6 test**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/documents/video-studio-documents.test.ts --maxWorkers=2
```

Expected: FAIL.

- [ ] **Step 3: Implement Style Presets, Style Store, Motion Registry, `## Frame N` Markdown Sync, and Composition Drift**

Use `yaml` (`parse`/`stringify`) for targeted frontmatter sync while preserving prose bodies below frontmatter cleanly.

- [ ] **Step 4: Run Task 6 tests + `pnpm tc:node`**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/documents/video-studio-documents.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/main/video-studio/style/ src/main/video-studio/motion/ src/main/video-studio/documents/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): implement full StyleProfile presets, Motion Registry, Frame-based Storyboard sync, and drift" }
```

---

## Task 7: Master Asset Registry, Dynamic JS Scan Caveat & Immutable Host Library

**Dependencies:** Task 4 & Task 6 (`parseStoryboardMarkdown`).

**Files:**

- Create: `src/main/video-studio/assets/video-studio-asset-invariants.ts`
- Create: `src/main/video-studio/assets/video-studio-asset-store.ts`
- Create: `src/main/video-studio/assets/video-studio-asset-registry.test.ts`

**Acceptance Criteria:**

1. Validates all invariants (`defaultState`, unique `components[].id`, acyclic `parentComponentId`, containment + existence + SHA-256 of state files and `dependencies[]`) on every import, update, library publish, and project apply.
2. Immutable Host Library versioning (`assets/<assetId>/v1/`, `v2/`, ...), `saveProjectAssetToLibrary` under `HostAssetLibraryLock -> ProjectMutationQueue`, portable copies into projects updating `snapshotRevision`.
3. Every mutation checks `expectedRevision` (`video_studio_file_conflict` on mismatch).
4. Dependency scanner checks `STORYBOARD.md`, HTML, CSS, SVG AND flags dynamic/evaluated JS expressions (`dynamicReferenceWarnings`, e.g., computed string concatenation/template literals in `.js`/`.html` scripts). Never deletes asset files from disk during `removeProjectAsset` unless explicit confirmation `forceDeleteFiles: true` is passed after warning inspection!

**Rollback Considerations:** Remove/restore only `src/main/video-studio/assets/`.

- [ ] **Step 1: Write failing Asset Registry tests covering invariants, immutable v1/v2 library isolation, portable copy, `expectedRevision` guard, and dynamic JS delete caveat**

Ensure a test case places a template-literal dynamic reference `` `assets/objects/${id}/operating.svg` `` in a composition `<script>` where static literal string match is ambiguous, confirming `removeProjectAsset` warns cleanly and refuses deleting the file on disk without `forceDeleteFiles: true`!

- [ ] **Step 2: Run the failing Task 7 test**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/assets/video-studio-asset-registry.test.ts --maxWorkers=2
```

Expected: FAIL.

- [ ] **Step 3: Implement `video-studio-asset-invariants.ts` and `video-studio-asset-store.ts`**

Keep bounded base64 limits, strict SHA-256 verification, and safe non-destructive registry removal vs confirmed disk unlink.

- [ ] **Step 4: Run Task 7 tests + `pnpm tc:node`**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/assets/video-studio-asset-registry.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```powershell
git add src/main/video-studio/assets/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): add Master Asset Registry, invariant checker, dynamic ref guard, and Host Library" }
```

---

## Task 8: Typed Runtime RPC, File Watcher, Host Trust Gate Enforcement & General Chat Handoff

**Dependencies:** Tasks 2, 4, 5, 6, 7.

**Files:**

- Modify: `src/main/video-studio/video-studio-job-manager.ts`
- Modify: `src/main/video-studio/video-studio-job-runner.ts`
- Create: `src/main/video-studio/video-studio-file-watcher.ts`
- Modify: `src/main/runtime/rpc/methods/video-studio/video-studio-methods.ts`
- Modify: `src/main/runtime/rpc/server/runtime-rpc-mobile-video-studio-methods.ts`
- Modify: `src/main/general-chat/research/general-chat-video-handoff.ts`
- Modify: `src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts`
- Create: `src/main/general-chat/research/general-chat-video-handoff.test.ts`

**Acceptance Criteria:**

1. `VideoStudioJobManager` enforces Host Trust Store (`<profileDir>/video-studio/security/trust-store.json`) with pre-spawn fingerprint re-verification before Chrome `checkProject` (`browser` mode), `startPreview`, AND `renderProject` (`video_studio_execution_approval_required` on unapproved/modified inputs).
2. `video-studio-methods.ts` implements ALL RPC methods in `video-studio-rpc-contract.ts` using exact Spec names, `expectedRevision` checks, SSH mutation refusal, and zero raw host paths returned in RPC errors/payloads.
3. `video-studio-file-watcher.ts` suppresses self-writes during TX commits and pushes `projectFilesChanged` events over `videoStudio.subscribeJobs`.
4. `runtime-rpc-mobile-video-studio-methods.ts` exposes read-only Studio inspection methods cleanly while maintaining SSH refusal.
5. `general-chat-video-handoff.ts` scaffolds modular v2 project (`## Frame N — Title` draft `STORYBOARD.md`, `BRIEF.md`, `references/sources.json`, `research-notes.md`, optional `styleProfileId` snapshot).

**Rollback Considerations:** Revert only Task 8 files cleanly (`git restore` modified + unlink newly created watcher/handoff test).

- [ ] **Step 1: Write failing RPC integration, Trust Store enforcement, `expectedRevision`, mobile read-only, and General Chat handoff tests**

Cover `updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `applyStyleProfileToProject`, `updateProjectStyleTokens`, `saveLibraryStyleProfile`, `addStoryboardFrame`, `reorderStoryboardFrames`, `saveProjectAssetToLibrary`, `approveProjectExecution`, and TOCTOU file modification rejection before Chrome execution.

- [ ] **Step 2: Run the failing Task 8 tests**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts src/main/general-chat/research/general-chat-video-handoff.test.ts --maxWorkers=2
```

Expected: FAIL.

- [ ] **Step 3: Implement Watcher, JobManager Trust/Preview integration, RPC Handlers, Mobile allowlist & Handoff**

Wire all methods strictly against Approved Spec signatures and verify `video-studio-job-manager.test.ts` passes cleanly.

- [ ] **Step 4: Run Task 8 tests + `verify:rpc-params-catalog` + `tc:node`**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-job-manager.test.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts src/main/general-chat/research/general-chat-video-handoff.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm run verify:rpc-params-catalog }; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```powershell
git add src/main/video-studio/video-studio-job-manager.ts src/main/video-studio/video-studio-job-runner.ts src/main/video-studio/video-studio-file-watcher.ts src/main/runtime/rpc/methods/video-studio/ src/main/runtime/rpc/server/runtime-rpc-mobile-video-studio-methods.ts src/main/general-chat/research/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): wire Studio RPC handlers, Host Trust enforcement, watcher, and v2 handoff" }
```

---

## Task 9: 4-Stage Native Structured Inspector UI, Localization & Component Fixtures

**Dependencies:** Task 8.

**Files:**

- Modify: `src/renderer/src/runtime/video-studio/video-studio-client.ts`
- Modify: `src/renderer/src/components/video-studio/VideoStudioWorkflow.tsx` (4 explicit stages: **Research**, **Script**, **Style**, **Production**)
- Modify: `src/renderer/src/components/video-studio/VideoStudioPage.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioProjects.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioProjectForm.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioProjectList.tsx`
- Modify: `src/renderer/src/components/video-studio/video-studio-draft.ts`
- Modify: `src/renderer/src/components/video-studio/use-video-studio-controller.ts`
- Create: `src/renderer/src/components/video-studio/VideoStudioResearchPanel.tsx`
- Create: `src/renderer/src/components/video-studio/VideoStudioStoryboardPanel.tsx`
- Create: `src/renderer/src/components/video-studio/VideoStudioAssetRegistryPanel.tsx`
- Create: `src/renderer/src/components/video-studio/VideoStudioStyleMotionPanel.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioProductionPanel.tsx`
- Modify: `src/renderer/src/components/video-studio/use-video-studio-production.ts`
- Modify: `src/renderer/src/components/video-studio/video-studio-production-actions.ts`
- Modify: `src/renderer/src/components/video-studio/VideoStudioPage.fixture.tsx`
- Modify: Localization catalogs updated by `pnpm run sync:localization-catalog` & `pnpm run sync:mobile-localization`

**Acceptance Criteria:**

1. Exact 4 workflow stages (`Research`, `Script`, `Style`, `Production`) navigate cleanly in desktop & narrow layouts (`min-h-11 @lg:min-h-9`) in both light and dark modes, adhering strictly to `docs/STYLEGUIDE.md`, `main.css` tokens, and `components/ui/` primitives.
2. `Style` panel inspects & edits full approved `StyleProfile` fields (`visual`, `typography`, `camera`, `motion`, `effects`, `composition`, `subtitle`, `openMotionPackageRef`), handles Host Library save/duplicate, displays Markdown Drift Reconciliation banner, and shows Universal Motion Presets explicitly distinguishing `executable`, `knowledge-only`, and `planned`.
3. `Production` panel surfaces Host-managed Trust approval banner before Chrome actions on untrusted/modified inputs, 5-state `ValidationReport` badge, `stale` warning, `productionGate` reasons, and external coding-agent file conflict reload notice.
4. Zero `try/finally` in React hooks; `pnpm run verify:localization-catalog`, `pnpm run verify:mobile-localization`, `pnpm check:react-compiler-compat-ratchet`, `pnpm tc:web`, `pnpm run build:mobile-web`, and `pnpm fixtures:shot VideoStudioPage` pass and fixture screenshots are visually verified via `read_file`.

**Rollback Considerations:** Revert only Task 9 UI/locale files; backend contracts remain unaffected.

- [ ] **Step 1: Extend `video-studio-client.ts` with all Stage & Studio RPC methods + event subscription**
- [ ] **Step 2: Implement 4-stage `VideoStudioWorkflow` and the 4 Inspector panels (`Research`, `Storyboard/Script + Assets`, `Style + Motion`, `Production`) cleanly with `useTranslate` and zero `try/finally` in hooks**
- [ ] **Step 3: Update `VideoStudioPage.fixture.tsx` (`0.9.94` readiness, `research`, `scriptStoryboard`, `scriptAssets`, `styleConflict`, `validationPartial`, `production`) and run i18n sync**
- [ ] **Step 4: Run web typecheck, React compiler ratchet, mobile build, localization verify, and `pnpm fixtures:shot VideoStudioPage`; inspect rendered PNG screenshots visually**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm run sync:localization-catalog; if ($LASTEXITCODE -eq 0) { pnpm run sync:mobile-localization }; if ($LASTEXITCODE -eq 0) { pnpm tc:web }; if ($LASTEXITCODE -eq 0) { pnpm check:react-compiler-compat-ratchet }; if ($LASTEXITCODE -eq 0) { pnpm run build:mobile-web }; if ($LASTEXITCODE -eq 0) { pnpm fixtures:shot VideoStudioPage }
```

Expected: All checks exit 0 and screenshots look balanced in light/dark desktop & narrow viewports.

- [ ] **Step 5: Commit Task 9**

```powershell
git add src/renderer/src/runtime/video-studio/ src/renderer/src/components/video-studio/ locales/ mobile/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): build 4-stage Native Structured Inspector UI, fixtures, and i18n" }
```

---

## Task 10: Two-Tier Consistency & Actual Render Fixtures (`1080×1920`, `30 FPS`), Visual Quality & Final Gates

**Dependencies:** Tasks 1–9.

**Files:**

- Create: `src/main/video-studio/__fixtures__/consistency/fixture-a-ac-explainer/` (short ~2s entry + `8–10s` representative composition `compositions/01-hook.html`, `02-cutaway.html`, `03-operating.html`, `STORYBOARD.md` using `## Frame N — Title`, `assets/objects/ac_indoor_001/{closed,cutaway,operating}.svg` driven directly by `assets/asset-registry.json` + `styles/style-profile.json` CSS tokens)
- Create: `src/main/video-studio/__fixtures__/consistency/fixture-b-inflation-explainer/` (`technical-explainer-01`, ~2s + `8–10s` compositions with `inflation_chart` SVG/HTML driven dynamically from `styles/style-profile.json` tokens)
- Create: `src/main/video-studio/__fixtures__/consistency/fixture-c-product-showcase/` (`clean-editorial-01`, ~2s + `8–10s` compositions driven from `styles/style-profile.json` proving distinct visual output)
- Create: `src/main/video-studio/__fixtures__/consistency/golden-frames/` (deterministic reference PNGs captured when all render prerequisites exist)
- Create: `src/main/video-studio/video-studio-consistency-fixtures.test.ts`
- Create: `src/main/video-studio/video-studio-render-smoke.test.ts`

**Acceptance Criteria:**

1. **Two Render Test Tiers (`1080×1920`, `30 FPS`):**
   - **Tier 1 (Short Automated Smoke ~2s):** Verifies `hyperframes check` + `hyperframes render` MP4 output + `ffprobe` (`1080x1920`, `30 fps`, exact duration) across Fixtures A, B, C.
   - **Tier 2 (Representative Multi-Scene Visual Quality ~8–10s):** Verifies multi-scene `## Frame N` transitions (`cut` / slide), asset state transition (`closed` -> `cutaway` -> `operating`), **non-congruent `#fan` rotation angles** (angular rate `217deg/sec` so sample timestamps `0.5s`, `4.2s`, `7.9s` produce provably distinct visual orientations `108.5deg`, `911.4deg mod 360 = 191.4deg`, `1714.3deg mod 360 = 274.3deg`), deterministic seek comparison (rendering/seeking `t=4.2s` directly matches sequential frame pixel buffer), and golden-frame visual comparison.
2. **Causal Proof of Style & Asset Driving Pixels:** Compositions dynamically read `styles/style-profile.json` (background, surface, accent, subtitle pill colors) and `assets/asset-registry.json` state SVGs so:
   - Mutating Fixture A vs C Style Profile measurably changes background & accent region pixel RGB values in rendered PNGs.
   - Mutating `ac_indoor_001` active state changes rendered cutaway/fan pixels while keeping ID `ac_indoor_001`.
3. **Portability & Mandatory Gate Semantics:** Relocating copied projects outside `<profileDir>` preserves valid asset paths & hashes. When `ORCA_REQUIRE_RENDER_SMOKE=1` or when `ffmpeg`, `ffprobe`, Chrome, and `hyperframes 0.9.94` are present, render tests MUST execute and pass as a **mandatory gate**; if local `ffmpeg`/`ffprobe` is missing, tests log `[PREREQUISITE_MISSING]` explicitly without claiming end-to-end render validation passed!
4. **Final Repository Gate:** `pnpm check:changed --base=main` exits `0`.

**Rollback Considerations:** Remove/restore only `src/main/video-studio/__fixtures__/consistency/` and the two Task 10 test files.

- [ ] **Step 1: Author the two-tier HTML/SVG fixture compositions (`1080×1920`, `30 FPS`) wired dynamically to `styles/style-profile.json` and `assets/asset-registry.json` with non-congruent `#fan` velocity (`217deg/sec`)**
- [ ] **Step 2: Implement `video-studio-consistency-fixtures.test.ts` and `video-studio-render-smoke.test.ts` (including pixel region verification for Style Profile & Asset state swaps + golden frame compare)**
- [ ] **Step 3: Execute consistency fixture tests + actual render smoke suite (reporting `[PREREQUISITE_MISSING]` clearly if FFmpeg absent locally, or full MP4 + golden PNG verification if present)**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/ src/main/video-studio/ src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts src/main/general-chat/research/general-chat-video-handoff.test.ts --maxWorkers=2
```

- [ ] **Step 4: Run `pnpm check:changed --base=main` final quality gate in foreground**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm check:changed --base=main
```

Expected: Format, lint, typecheck, changed tests, RPC catalog, localization checks, React Compiler ratchet, and mobile web bundle pass with zero errors.

- [ ] **Step 5: Commit Task 10**

```powershell
git add "src/main/video-studio/__fixtures__/consistency/" src/main/video-studio/video-studio-consistency-fixtures.test.ts src/main/video-studio/video-studio-render-smoke.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "test(video-studio): add two-tier consistency & actual render fixtures with visual proof" }
```
