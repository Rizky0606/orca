# Orca AI Video Studio — Engine-Agnostic Consistency Foundation & HyperFrames `0.9.94` Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 02–03 engine-agnostic, file-first, general-purpose Video Studio consistency foundation inside Orca (`feature/orca-ai-studio`), aligned strictly to pinned HyperFrames `0.9.94`, with Dual-Scope Style Profiles, Universal Motion Registry contracts, Structured Storyboard & `SCRIPT.md`, Master Asset Registry with immutable library versioning, General Chat research handoff, transaction crash recovery, native Structured Inspector UI, and end-to-end `1080×1920` `30 FPS` render verification fixtures.

**Architecture:** File-first dual-actor architecture keeping structured JSON (`styles/style-profile.json`, `assets/asset-registry.json`, `.orca/`) as Orca's canonical tokens paired with bidirectional, targeted Markdown sync (`frame.md`, `DESIGN.md`, `MOTION.md`, `BRIEF.md`, `STORYBOARD.md`, `SCRIPT.md`) and modular `compositions/*.html` files (`<template>` + `data-composition-src`) usable by both Orca's native Structured Inspector and coding agents. Multi-file mutations serialize via canonical lock ordering (`HostStyleLibraryLock -> HostAssetLibraryLock -> ProjectMutationQueue`) and hash-verified `.orca/tx.log` staging/backups.

**Tech Stack:** TypeScript, Electron 43, Node.js 22+, Zod v4 (`import * as z from 'zod'` in `src/shared/`), `yaml` (`^2.9.1` already in `package.json`), `@orca/process-host`, React 19, Tailwind CSS, Vitest, `oxlint`, `oxfmt`, HyperFrames `0.9.94` CLI.

**Approved Specification:** [2026-11-26-video-studio-consistency-foundation-design.md](file:///C:/Coding/Project/orca/.worktrees/orca-ai-studio/docs/superpowers/specs/2026-11-26-video-studio-consistency-foundation-design.md)

**Scope Boundary:** Active primary engine is pinned HyperFrames `0.9.94`. Remotion (`Phase 06`), full OpenMotion upstream importer & AI reference recreation (`Phase 04`), Automated Agent Runner (`Phase 05`), and Multi-Engine Compositor/3D (`Phases 07–08`) are represented only as contracts and non-regression integration seams in this plan. Never merge to `main` during these tasks; stay strictly in worktree `C:\Coding\Project\orca\.worktrees\orca-ai-studio` (`feature/orca-ai-studio`).

---

## Execution Environment & Shell Notes
- **Working directory:** `C:\Coding\Project\orca\.worktrees\orca-ai-studio`
- **PowerShell 5.1:** Chain dependent commands using `; if ($LASTEXITCODE -eq 0) { ... }` (never bash `&&`).
- **Vitest on Windows dev machines without MSVC C++ Build Tools:** `pnpm test` runs `ensure-native-runtime.mjs --runtime=node` which attempts a `node-gyp` build for native addons. Use `pnpm exec vitest run --config config/vitest.config.ts <paths> --maxWorkers=2` for iterating on pure-TS Video Studio suites, and use `pnpm check:changed --base=main` / CI as the full gate.
- **FFmpeg / Chrome Prerequisites:** On Windows dev machines where `ffmpeg`/`ffprobe` are not installed on `PATH`, Task 1 records the baseline gap and Task 10 exercises both structure/invariant fixtures unconditionally and real MP4 render + `ffprobe` + golden-frame visual comparison when `ffmpeg`, `ffprobe`, Chrome, and `hyperframes@0.9.94` are present (blocking release gate if missing in CI).

---

## Dependency Order Overview

```text
Task 1 (Baseline & Upstream 0.9.94 Fixtures)
  ├──> Task 2 (HyperFrames 0.9.94 Engine Adapter, Version Pin, Env Allowlist, Preview Manager)
  └──> Task 3 (Shared Data Contracts, Validation Precedence, RPC Schemas, Passthrough Codes)
          └──> Task 4 (Canonical Lock Order, .orca/tx.log Recovery, Containment, Trust Store)
                  ├──> Task 5 (Modular 0.9.94 Scaffold & Stage 1/2 Non-Destructive Migration)
                  │       ├──> Task 6 (Dual-Scope Style Profiles, Motion Registry, Markdown Sync & Drift)
                  │       └──> Task 7 (Master Asset Registry & Immutable Host Library)
                  └───────────────────────────────────┐
                                                      ▼
                                          Task 8 (Typed Runtime RPC, Watcher, Research Handoff)
                                                      └──> Task 9 (Native Structured Inspector UI, Fixtures & i18n)
                                                              └──> Task 10 (3 Consistency Render Fixtures 1080x1920@30fps, Visual Regression & Final Gates)
```

---

## Task 1: Baseline Verification & Upstream HyperFrames `0.9.94` Fixture Capture

**Dependencies:** None (starting baseline step before any code edits).

**Files:**
- Create: `src/main/video-studio/engines/__fixtures__/doctor-ready.json`
- Create: `src/main/video-studio/engines/__fixtures__/doctor-missing-ffmpeg.json`
- Create: `src/main/video-studio/engines/__fixtures__/check-passed.json`
- Create: `src/main/video-studio/engines/__fixtures__/check-failed-contrast-layout.json`
- Create: `src/main/video-studio/engines/__fixtures__/check-browser-skipped.json`
- Create: `src/main/video-studio/engines/__fixtures__/check-hdr-unknown-section.json`
- Create: `src/main/video-studio/engines/__fixtures__/preview-started.json`
- Create: `src/main/video-studio/engines/__fixtures__/render-progress.txt`

**Acceptance Criteria:**
1. Baseline checks pass cleanly against existing codebase before edits (`vitest` 6 files / 30 tests pass, `pnpm tc:node`, `pnpm tc:web`, `pnpm exec oxlint` on existing Video Studio files).
2. Real installed `hyperframes 0.9.94` CLI outputs (`--version`, `doctor --json`, `check --json`, `preview --foreground --json --no-open`, non-TTY `@hf-progress` output) are captured verbatim as contract fixtures matching upstream `0.9.94` field structure.
3. Environment capability snapshot (`node`, `hyperframes 0.9.94`, `chrome`, `ffmpeg`/`ffprobe` availability) is documented so CI vs local render preconditions are explicit.

**Rollback Considerations:** Purely additive `__fixtures__` directory + baseline logs; roll back via `git checkout -- src/main/video-studio/engines/__fixtures__` or `git reset --hard HEAD` if needed.

- [ ] **Step 1: Run baseline verification tests and static checks BEFORE editing any code**

Run in foreground from `C:\Coding\Project\orca\.worktrees\orca-ai-studio`:
```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-project.test.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts src/main/video-studio/video-studio-job-manager.test.ts src/main/video-studio/video-studio-catalog.test.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts --maxWorkers=2
```
Expected: `Test Files 6 passed (6)`, `Tests 30 passed (30)`.

Then run typecheck & lint baseline:
```powershell
pnpm tc:node; if ($LASTEXITCODE -eq 0) { pnpm tc:web }; if ($LASTEXITCODE -eq 0) { pnpm exec oxlint src/main/video-studio src/shared/video-studio src/renderer/src/components/video-studio src/renderer/src/runtime/video-studio }
```
Expected: exit code `0` with zero errors.

- [ ] **Step 2: Capture live HyperFrames `0.9.94` CLI schema and probe machine prerequisites**

Run against a disposable temp folder (`%TEMP%\hf-probe-cap`) to capture exact CLI shapes without leaving repo clutter:
```powershell
hyperframes --version
hyperframes doctor --json
$tmp = Join-Path $env:TEMP "hf-probe-cap-$(Get-Random)"
hyperframes init $tmp --non-interactive --format json
Push-Location $tmp
hyperframes check --json --no-browser
Pop-Location
Remove-Item -Recurse -Force $tmp
```
Verify `_meta.version` equals `"0.9.94"`, `checks[]` items contain `{ name, ok, detail, hint }`, and `check --json --no-browser` contains `{ ok, strict, browserSkipped, lint, runtime, layout, motion, contrast, craft, audio, hdr, snapshots }` where each section uses `findings: []`.

- [ ] **Step 3: Write the 8 real-shape `hyperframes 0.9.94` CLI contract fixture files**

Write exact captured JSON payloads into `src/main/video-studio/engines/__fixtures__/`:

1. `doctor-ready.json`:
```json
{
  "ok": true,
  "platform": "win32",
  "arch": "x64",
  "checks": [
    { "name": "Node.js", "ok": true, "detail": "v24.18.0" },
    { "name": "FFmpeg", "ok": true, "detail": "ffmpeg version 7.1" },
    { "name": "FFprobe", "ok": true, "detail": "ffprobe version 7.1" },
    { "name": "Chrome", "ok": true, "detail": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
    { "name": "Version", "ok": true, "detail": "0.9.94" }
  ],
  "_meta": { "version": "0.9.94" }
}
```

2. `doctor-missing-ffmpeg.json` (real output from Windows check):
```json
{
  "ok": false,
  "platform": "win32",
  "arch": "x64",
  "checks": [
    { "name": "Node.js", "ok": true, "detail": "v24.18.0" },
    { "name": "FFmpeg", "ok": false, "detail": "ffmpeg not found in PATH", "hint": "Install FFmpeg and add to PATH" },
    { "name": "FFprobe", "ok": false, "detail": "ffprobe not found in PATH", "hint": "Install FFprobe (bundled with FFmpeg)" },
    { "name": "Chrome", "ok": true, "detail": "Google Chrome detected" },
    { "name": "Version", "ok": true, "detail": "0.9.94" }
  ],
  "_meta": { "version": "0.9.94" }
}
```

3. `check-passed.json`:
```json
{
  "ok": true,
  "strict": false,
  "browserSkipped": false,
  "lint": { "findings": [] },
  "runtime": { "findings": [] },
  "layout": { "findings": [] },
  "motion": { "findings": [] },
  "contrast": { "findings": [] },
  "craft": { "findings": [] },
  "audio": { "findings": [] },
  "hdr": { "findings": [] },
  "snapshots": { "count": 3, "verified": true }
}
```

4. `check-failed-contrast-layout.json`:
```json
{
  "ok": false,
  "strict": false,
  "browserSkipped": false,
  "lint": { "findings": [] },
  "runtime": { "findings": [] },
  "layout": {
    "findings": [
      {
        "severity": "error",
        "code": "overflow-clipped",
        "message": "Element .headline-card overflows viewport right edge by 42px",
        "frame": 45,
        "fixHint": "Reduce width or clamp horizontal margin within 1080px canvas"
      }
    ]
  },
  "contrast": {
    "findings": [
      {
        "severity": "error",
        "code": "wcag-contrast-low",
        "message": "Text contrast ratio 2.41:1 below AA minimum 4.5:1",
        "contrastRatio": 2.41,
        "suggestedColor": "#F8FAFC"
      }
    ]
  },
  "motion": { "findings": [] },
  "craft": { "findings": [] },
  "audio": { "findings": [] },
  "hdr": { "findings": [] }
}
```

5. `check-browser-skipped.json`:
```json
{
  "ok": true,
  "strict": false,
  "browserSkipped": true,
  "lint": { "findings": [] },
  "runtime": { "findings": [] },
  "layout": { "findings": [] },
  "motion": {
    "findings": [
      {
        "severity": "warning",
        "code": "linear-ease-default",
        "message": "Consider ease-out deceleration curve on callout entry"
      }
    ]
  },
  "contrast": { "findings": [] },
  "craft": { "findings": [] },
  "audio": { "findings": [] },
  "hdr": { "findings": [] }
}
```

6. `check-hdr-unknown-section.json`:
```json
{
  "ok": false,
  "strict": false,
  "browserSkipped": true,
  "lint": { "findings": [] },
  "hdr": {
    "findings": [
      {
        "severity": "warning",
        "code": "hdr-color-space",
        "message": "Non-sRGB transfer detected without fallback tone map"
      }
    ]
  },
  "captionsAudit": {
    "findings": [
      {
        "severity": "error",
        "code": "caption-overlap",
        "message": "Caption block overlaps lower-third safe zone"
      }
    ]
  }
}
```

7. `preview-started.json`:
```json
{
  "schemaVersion": 1,
  "operation": "start",
  "ok": true,
  "result": {
    "state": "started",
    "mode": "foreground",
    "projectName": "ac-explainer",
    "projectDir": "C:\\Users\\demo\\video-studio\\projects\\ac-explainer",
    "host": "127.0.0.1",
    "port": 43123,
    "pid": 18440,
    "serverUrl": "http://127.0.0.1:43123",
    "studioUrl": "http://127.0.0.1:43123/",
    "ready": true
  }
}
```

8. `render-progress.txt`:
```text
@hf-progress {"stage":"preparing","pct":5,"detail":"Loading composition"}
@hf-progress {"stage":"capturing","pct":42,"frame":38,"totalFrames":90}
@hf-progress {"stage":"encoding","pct":88,"detail":"Muxing MP4 H.264"}
@hf-progress {"stage":"done","pct":100,"output":"renders/render-1.mp4"}
```

- [ ] **Step 4: Commit fixtures**

```powershell
git add "src/main/video-studio/engines/__fixtures__"; if ($LASTEXITCODE -eq 0) { git commit -m "test(video-studio): capture hyperframes 0.9.94 CLI contract fixtures" }
```

---

## Task 2: HyperFrames `0.9.94` Engine Adapter, Exact Version Resolution & Preview/Process Lifecycle

**Dependencies:** Task 1 (fixtures and baseline tests verified).

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
1. `HYPERFRAMES_PINNED_VERSION = '0.9.94'` enforces **exact semver equality** (`detectedVersion === '0.9.94'`, not major/minor match); deterministic binary resolver checks Orca-managed/lockfile runtime binary first before PATH and flags any other version as `compatibility: 'unverified'`.
2. `doctor --json` parser supports real `checks[]` + `_meta.version` (plus legacy fields for transition) and reports missing `ffmpeg`, `ffprobe`, `node22`, `hyperframes`, `chrome`.
3. `check --json` parser discovers sections dynamically (covering `lint`, `runtime`, `layout`, `motion`, `contrast`, `craft`, `audio`, `hdr`, and arbitrary future section objects with `.findings`), evaluates 5-state `ValidationReport` under strict precedence (`unsupported > error > failed > partial > passed`), keeps `ValidationReport.status` separate from `productionGate`, treats `ok: true` with zero skipped checks and zero errors as `passed` (never `partial` solely on CLI exit 0), and attaches `inputFingerprint`.
4. `startPreview()` always passes `--foreground --json --no-open`, conditionally adds `--force-new` only when replacing an unhealthy/orphaned session, and validates loopback preview URLs through `normalizeExternalBrowserUrl`.
5. `VideoStudioPreviewManager` verifies PID + `creationTimeMs` + command line (using [windows-process-table.ts](file:///C:/Coding/Project/orca/.worktrees/orca-ai-studio/src/main/windows/windows-process-table.ts) on Windows and `ps`/process inspect on POSIX) + loopback HTTP health probe before reusing/stopping a cached `.orca/project-state.json` session, clears mismatched stale state without killing unrelated OS PIDs, and cleans up verified active sessions on `dispose()`.
6. `host-video-engine-deps.ts` replaces `copyDefinedProcessEnv()` with an explicit non-secret allowlist so `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `TAVILY_API_KEY`, etc. never leak to child processes.

**Rollback Considerations:** Revert commits on Task 2 files; preserve legacy adapter exports (`createHyperFramesEngineAdapter`, `remotionEngineAdapter`) during step updates so downstream job manager keeps compiling until Task 8.

- [ ] **Step 1: Write failing tests for CLI parsers (`0.9.94` contract + precedence), env allowlist, adapter exact pinning, and Preview Session Manager**

1. Create `src/main/video-studio/engines/hyperframes-cli-parsers.test.ts`:
```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HYPERFRAMES_PINNED_VERSION,
  parseHyperFramesCheckJson,
  parseHyperFramesDoctorJson,
  parseHyperFramesPreviewJson,
  parseHyperFramesProgressLine
} from './hyperframes-cli-parsers'

const fixturesDir = join(import.meta.dirname, '__fixtures__')

describe('hyperframes 0.9.94 CLI parsers', () => {
  it('parses checks[] and _meta.version from real doctor --json output', async () => {
    const missingRaw = await readFile(join(fixturesDir, 'doctor-missing-ffmpeg.json'), 'utf8')
    const missing = parseHyperFramesDoctorJson(missingRaw)
    expect(missing.version).toBe('0.9.94')
    expect(missing.versionCompatibility).toBe('exact')
    expect(missing.ok).toBe(false)
    expect(missing.missingTools).toEqual(['ffmpeg', 'ffprobe'])

    const readyRaw = await readFile(join(fixturesDir, 'doctor-ready.json'), 'utf8')
    const ready = parseHyperFramesDoctorJson(readyRaw)
    expect(ready.ok).toBe(true)
    expect(ready.missingTools).toEqual([])
    expect(HYPERFRAMES_PINNED_VERSION).toBe('0.9.94')
  })

  it('rejects loose major.minor matching and marks non-0.9.94 versions as unverified', () => {
    const minorDrift = parseHyperFramesDoctorJson(
      JSON.stringify({
        ok: true,
        checks: [
          { name: 'FFmpeg', ok: true, detail: 'ok' },
          { name: 'FFprobe', ok: true, detail: 'ok' }
        ],
        _meta: { version: '0.9.95' }
      })
    )
    expect(minorDrift.version).toBe('0.9.95')
    expect(minorDrift.versionCompatibility).toBe('unverified')
  })

  it('applies strict 5-state validation precedence and productionGate separation', async () => {
    const passed = parseHyperFramesCheckJson(
      await readFile(join(fixturesDir, 'check-passed.json'), 'utf8'),
      'fp-1'
    )
    expect(passed.status).toBe('passed')
    expect(passed.productionGate).toEqual({ allowed: true, blockingReasons: [] })
    expect(passed.inputFingerprint).toBe('fp-1')

    const partial = parseHyperFramesCheckJson(
      await readFile(join(fixturesDir, 'check-browser-skipped.json'), 'utf8'),
      'fp-2'
    )
    expect(partial.status).toBe('partial')
    expect(partial.skippedChecks).toContain('browser')
    expect(partial.productionGate.allowed).toBe(false)
    expect(partial.productionGate.blockingReasons).toContain(
      'Required browser layout/contrast audit was skipped'
    )

    const failed = parseHyperFramesCheckJson(
      await readFile(join(fixturesDir, 'check-failed-contrast-layout.json'), 'utf8'),
      'fp-3'
    )
    expect(failed.status).toBe('failed')
    expect(failed.productionGate.allowed).toBe(false)

    // Unknown section + hdr with error finding AND browserSkipped=true => MUST be 'failed' (precedence: failed > partial)
    const hdrAndUnknown = parseHyperFramesCheckJson(
      await readFile(join(fixturesDir, 'check-hdr-unknown-section.json'), 'utf8'),
      'fp-4'
    )
    expect(hdrAndUnknown.status).toBe('failed')
    expect(hdrAndUnknown.sectionStatuses.hdr.warningCount).toBe(1)
    expect(hdrAndUnknown.sectionStatuses.captionsAudit.errorCount).toBe(1)
  })

  it('parses preview --foreground --json --no-open envelope and @hf-progress lines', async () => {
    const previewRaw = await readFile(join(fixturesDir, 'preview-started.json'), 'utf8')
    const preview = parseHyperFramesPreviewJson(previewRaw)
    expect(preview).toMatchObject({
      host: '127.0.0.1',
      port: 43123,
      pid: 18440,
      studioUrl: 'http://127.0.0.1:43123/'
    })

    const progressText = await readFile(join(fixturesDir, 'render-progress.txt'), 'utf8')
    const parsedLines = progressText
      .split(/\r?\n/)
      .map((line) => parseHyperFramesProgressLine(line))
      .filter((entry) => entry !== null)
    expect(parsedLines).toHaveLength(4)
    expect(parsedLines[1]).toMatchObject({ pct: 42, stage: 'capturing' })
    expect(parsedLines[3]).toMatchObject({ pct: 100, stage: 'done' })
  })
})
```

2. Create `src/main/video-studio/engines/host-video-engine-deps.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import { buildSanitizedVideoEngineEnv } from './host-video-engine-deps'

describe('buildSanitizedVideoEngineEnv', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('strips API keys and agent secrets while preserving required runtime paths', () => {
    const env = buildSanitizedVideoEngineEnv({
      PATH: 'C:\\Windows\\System32;C:\\Program Files\\nodejs',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Users\\demo\\AppData\\Local\\Temp',
      HYPERFRAMES_NO_TELEMETRY: '1',
      OPENAI_API_KEY: 'sk-secret-openai',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      GITHUB_TOKEN: 'ghp_secret',
      TAVILY_API_KEY: 'tvly-secret',
      ORCA_INTERNAL_SECRET: 'orca-secret'
    })

    expect(env.PATH).toContain('nodejs')
    expect(env.SystemRoot).toBe('C:\\Windows')
    expect(env.TEMP).toContain('Temp')
    expect(env.HYPERFRAMES_NO_TELEMETRY).toBe('1')
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.GITHUB_TOKEN).toBeUndefined()
    expect(env.TAVILY_API_KEY).toBeUndefined()
    expect(env.ORCA_INTERNAL_SECRET).toBeUndefined()
  })
})
```

3. Create `src/main/video-studio/video-studio-preview-session.test.ts`:
```ts
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoStudioPreviewManager } from './video-studio-preview-manager'

let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'orca-preview-mgr-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

describe('VideoStudioPreviewManager', () => {
  it('clears stale cached PID state without killing unrelated OS process when creationTimeMs mismatches', async () => {
    await mkdir(join(projectDir, '.orca'), { recursive: true })
    await writeFile(
      join(projectDir, '.orca', 'project-state.json'),
      JSON.stringify({
        preview: {
          pid: 99999,
          creationTimeMs: 111_000,
          commandHint: 'hyperframes',
          port: 43123,
          url: 'http://127.0.0.1:43123/',
          startedAt: 111_000
        }
      }),
      'utf8'
    )

    const killSpy = vi.fn()
    const mgr = new VideoStudioPreviewManager({
      inspectProcess: vi.fn().mockResolvedValue({
        pid: 99999,
        creationTimeMs: 222_000,
        commandLine: 'unrelated-notepad.exe'
      }),
      probeLoopbackHealth: vi.fn().mockResolvedValue(false),
      killProcessTree: killSpy
    })

    const stopped = await mgr.stopProjectPreview(projectDir, 'proj-1')
    expect(stopped.clearedStale).toBe(true)
    expect(killSpy).not.toHaveBeenCalled()
    const rawState = JSON.parse(
      await readFile(join(projectDir, '.orca', 'project-state.json'), 'utf8')
    )
    expect(rawState.preview).toBeUndefined()
  })

  it('passes --force-new only when replacing an unhealthy/orphaned session for the same project', async () => {
    const mgr = new VideoStudioPreviewManager({
      inspectProcess: vi.fn().mockResolvedValue({
        pid: 4444,
        creationTimeMs: 1000,
        commandLine: 'node hyperframes preview'
      }),
      probeLoopbackHealth: vi.fn().mockResolvedValue(false),
      killProcessTree: vi.fn().mockResolvedValue(undefined)
    })

    const startFresh = await mgr.shouldForceNewPreview(projectDir)
    expect(startFresh).toBe(false)

    await mkdir(join(projectDir, '.orca'), { recursive: true })
    await writeFile(
      join(projectDir, '.orca', 'project-state.json'),
      JSON.stringify({
        preview: {
          pid: 4444,
          creationTimeMs: 1000,
          commandHint: 'hyperframes',
          port: 43190,
          url: 'http://127.0.0.1:43190/',
          startedAt: 1000
        }
      }),
      'utf8'
    )

    const replaceUnhealthy = await mgr.shouldForceNewPreview(projectDir)
    expect(replaceUnhealthy).toBe(true)
  })
})
```

4. Add tests in `src/main/video-studio/engines/hyperframes-engine-adapter.test.ts` verifying:
   - `startPreview()` executes with `--foreground`, `--json`, `--no-open`, and includes `--force-new` only when requested via `forceNew: true`.
   - `checkProject()` attaches `inputFingerprint` and returns `unsupported` on `remotionEngineAdapter`.
   - `probeEnvironment()` marks `0.9.93` or `0.9.95` as `compatibility: 'unverified'` while exact `0.9.94` reports `compatibility: 'exact'`, prioritizing pinned binary resolution before PATH.

- [ ] **Step 2: Run the new/updated engine & preview tests to confirm they FAIL**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/engines/hyperframes-cli-parsers.test.ts src/main/video-studio/engines/host-video-engine-deps.test.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts src/main/video-studio/video-studio-preview-session.test.ts --maxWorkers=2
```
Expected: FAIL (`Cannot find module './hyperframes-cli-parsers.test'`, missing `VideoStudioPreviewManager`, missing `buildSanitizedVideoEngineEnv`, old `probe`/`check` parser shapes).

- [ ] **Step 3: Implement `video-render-engine.ts`, `hyperframes-cli-parsers.ts`, `hyperframes-environment-probe.ts`, `hyperframes-engine-adapter.ts`, `remotion-engine-adapter.ts`, `host-video-engine-deps.ts`, and `video-studio-preview-manager.ts`**

Key implementation contracts:
1. `src/main/video-studio/engines/video-render-engine.ts`:
   - Export `ValidationStatus = 'passed' | 'failed' | 'partial' | 'error' | 'unsupported'`, `ValidationFinding`, `ValidationSectionStatus`, `ValidationReport` (with `inputFingerprint`, optional `revisions`, optional `stale`, `skippedChecks`, `sectionStatuses`, `productionGate: { allowed: boolean; blockingReasons: string[] }`).
   - Add `versionCompatibility?: 'exact' | 'unverified'` on engine probe status, `forceNew?: boolean` on preview options, and `inputFingerprint?: string` + `strict?: boolean` on `checkProject` request.
2. `src/main/video-studio/engines/hyperframes-cli-parsers.ts`:
   - `export const HYPERFRAMES_PINNED_VERSION = '0.9.94' as const`.
   - Implement exact version comparator `comparePinnedHyperFramesVersion(detected?: string): 'exact' | 'unverified' | 'missing'` checking exact equality (`detected?.trim() === HYPERFRAMES_PINNED_VERSION`).
   - Update `parseHyperFramesDoctorJson`: extract `checks[]` (case-insensitive matching `'ffmpeg'`, `'ffprobe'`, `'chrome'`, `'node.js'`, `'version'`), read `_meta.version` (falling back to top-level `version` only for backwards-compatible fixtures), and compute `missingTools`.
   - Update `parseHyperFramesCheckJson(stdout, inputFingerprint, revisions?)`:
     - Inspect all top-level object properties having array `findings` (`lint`, `runtime`, `layout`, `motion`, `contrast`, `craft`, `audio`, `hdr`, plus any unknown section names dynamically) and optional top-level legacy `.errors`/`.warnings`.
     - Evaluate strict precedence:
       - If payload unparseable / non-object -> `'error'`
       - Else if total error findings > 0 -> `'failed'`
       - Else if `browserSkipped === true` or `skippedChecks.length > 0` -> `'partial'` (note: never emit `'partial'` solely because `ok === true`)
       - Else if `ok === false` with zero findings -> `'failed'`
       - Else -> `'passed'`.
     - Compute `productionGate`: `allowed: status === 'passed'`, adding `'Required browser layout/contrast audit was skipped'` when `browserSkipped === true`, and error summary when `errorCount > 0`.
   - Update `parseHyperFramesPreviewJson`: parse `{ schemaVersion, operation, ok, result: { host, port, pid, studioUrl, serverUrl } }` via Zod and validate URL with `normalizeExternalBrowserUrl`.
3. `src/main/video-studio/engines/host-video-engine-deps.ts`:
   - Export `buildSanitizedVideoEngineEnv(sourceEnv = process.env)`: strict allowlist (`PATH`, `PATHEXT`, `SystemRoot`, `WINDIR`, `COMSPEC`, `TEMP`, `TMP`, `TMPDIR`, `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, `LANG`, `LC_*`, `NO_COLOR`, `CI`, and non-secret `HYPERFRAMES_*` flags excluding keys matching `/TOKEN|KEY|SECRET|PASSWORD|AUTH|COOKIE/i`).
   - Add deterministic pinned binary resolution order in `resolveCommand('hyperframes')`: first check `<appRoot>/node_modules/.bin/hyperframes(.cmd)` / `<profileDir>/runtimes/hyperframes/0.9.94/node_modules/.bin/hyperframes(.cmd)`, then system PATH, never auto-installing `latest` via `npx`.
4. `src/main/video-studio/engines/hyperframes-environment-probe.ts` & `hyperframes-engine-adapter.ts` & `remotion-engine-adapter.ts`:
   - Check Node `>= 22`, exact `hyperframes --version === '0.9.94'`, `ffmpeg`, `ffprobe`, and `doctor --json`; mark non-`0.9.94` versions `compatibility: 'unverified'`.
   - Pass `['preview', projectDir, '--foreground', '--json', '--no-open', ...(options.forceNew ? ['--force-new'] : [])]` (omitting deprecated host/port flags unless supported and validated).
   - `remotionEngineAdapter.checkProject()` returns `{ status: 'unsupported', engine: 'remotion', inputFingerprint, findings: [], skippedChecks: [], sectionStatuses: {}, productionGate: { allowed: false, blockingReasons: ['Remotion engine validation is planned for Phase 06'] }, summary: 'Unsupported by Remotion stub', checkedAt: Date.now() }`.
5. `src/main/video-studio/video-studio-preview-manager.ts`:
   - Read/write `.orca/project-state.json` preview record `{ pid, creationTimeMs, commandHint, port, url, startedAt }` atomically (without leaking raw filesystem details to RPC callers).
   - On `stopProjectPreview` or reuse verification: inspect OS process via injected `inspectProcess` (defaulting to [windows-process-table.ts](file:///C:/Coding/Project/orca/.worktrees/orca-ai-studio/src/main/windows/windows-process-table.ts) snapshot on `win32`, `ps -p <pid> -o lstart=,args=` via `@orca/process-host` on POSIX). Require `pid` + matching `creationTimeMs` (when available) + command line mentioning `hyperframes` or matching preview port.
   - Probe loopback `http://127.0.0.1:<port>/` with short timeout (`1200ms`).
   - Never kill unrelated PIDs; clear stale `.orca/project-state.json` entry safely. Provide `shouldForceNewPreview(projectDir)` and `disposeAll()`.

- [ ] **Step 4: Run Task 2 tests and typecheck to verify everything passes**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/engines/hyperframes-cli-parsers.test.ts src/main/video-studio/engines/host-video-engine-deps.test.ts src/main/video-studio/engines/hyperframes-engine-adapter.test.ts src/main/video-studio/video-studio-preview-session.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```
Expected: All tests in the 4 files pass; `pnpm tc:node` exits 0.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/main/video-studio/engines/ src/main/video-studio/video-studio-preview-manager.ts src/main/video-studio/video-studio-preview-session.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): align hyperframes 0.9.94 CLI contracts, env allowlist, and preview session verification" }
```

---

## Task 3: Shared Data Contracts (Schemas, Invariant Validators, RPC Contracts & Error Codes)

**Dependencies:** Task 2 (`ValidationReport` types aligned).

**Files:**
- Modify: `src/shared/video-studio/video-studio-project.ts`
- Create: `src/shared/video-studio/video-studio-validation-contract.ts`
- Create: `src/shared/video-studio/video-studio-style-contract.ts`
- Create: `src/shared/video-studio/video-studio-storyboard-contract.ts`
- Create: `src/shared/video-studio/video-studio-asset-contract.ts`
- Create: `src/shared/video-studio/video-studio-extension-contract.ts`
- Modify: `src/shared/video-studio/video-studio-rpc-contract.ts`
- Modify: `src/main/video-studio/engines/video-render-engine.ts` (re-export `ValidationStatus` and `ValidationReport` from `src/shared/video-studio/video-studio-validation-contract.ts` to keep a single canonical type definition)
- Modify: `src/main/runtime/rpc/runtime-passthrough-codes.ts`
- Modify: `src/shared/video-studio/video-studio-project.test.ts`
- Create: `src/shared/video-studio/video-studio-contracts.test.ts`

**Critical Constraint:** Every file under `src/shared/` MUST use `import * as z from 'zod'` (NOT `import { z } from 'zod'`) so `pnpm run build:mobile-web` stays tree-shaken.

**Acceptance Criteria:**
1. Distinct schemas exist for `StyleProfile` (`built-in` | `library` | `snapshot`, `id`, `schemaVersion: 1`, `version`, `snapshotRevision`), `StyleReconciliationDiff`, `StoryboardDocument` (`scene_id`, `lockedSections`, unknown `extra`), `MasterAssetRecord` (`type`, `format`, `defaultState`, `states`, `components` with `parentComponentId`, `dependencies`, `provenance`, `license`, `consistency`), `AssetInstanceRef`, `MotionPresetRecord`, `ValidationReport` (with `inputFingerprint`, `stale`, `productionGate`), and `ProjectTrustState` (`untrusted` | `approved`, `approvedFingerprint`).
2. `validateMasterAssetInvariants(record)` synchronously enforces: `defaultState` key exists in `states`, `components[].id` values are unique, `components[].parentComponentId` references an existing component ID and forms an acyclic DAG (rejecting self-loops and multi-hop cycles).
3. `video-studio-rpc-contract.ts` defines complete typed RPC parameter/result contracts for every Studio action: Style (`getProjectStyleState`, `applyStyleProfileToProject`, `updateProjectStyle`, `saveStyleProfileToLibrary`, `reconcileProjectStyle`), Documents & Research (`getProjectDocuments`, `updateProjectBrief`, `updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `updateStoryboard`, `computeCompositionDrift`), Master Assets (`listLibraryAssets`, `listProjectAssets`, `registerOrImportAsset`, `updateAssetMetadata`, `applyLibraryAssetToProject`, `saveProjectAssetToLibrary`, `removeProjectAsset`, `deleteLibraryAsset`), Motion (`listMotionPresets`), and Execution Trust (`approveProjectExecution`), plus `projectFilesChanged` event in job subscription.
4. `runtime-passthrough-codes.ts` registers all 12 new Video Studio error codes.

**Rollback Considerations:** Additive shared schemas and RPC definitions; backwards compatibility for Stage 1/2 `VideoStudioProject` defaults (`styleProfileId?: string`, `engine: 'hyperframes'`, `fps: 30`, `renders: []`) guarantees zero breaking parse failures on existing `video-studio-projects.json`.

- [ ] **Step 1: Write failing invariant & contract tests in `src/shared/video-studio/video-studio-contracts.test.ts`**

Create `src/shared/video-studio/video-studio-contracts.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  MasterAssetRecordSchema,
  validateMasterAssetInvariants
} from './video-studio-asset-contract'
import { StyleProfileSchema } from './video-studio-style-contract'
import {
  VideoStudioApproveProjectExecutionParams,
  VideoStudioSaveProjectAssetToLibraryParams,
  VideoStudioUpdateProjectScriptParams,
  VideoStudioUpsertResearchSourceParams
} from './video-studio-rpc-contract'

const baseAsset = {
  id: 'ac_indoor_001',
  schemaVersion: 1 as const,
  version: 1,
  name: 'AC Indoor Split Unit',
  type: 'object' as const,
  format: 'svg' as const,
  tags: ['hvac', 'explainer'],
  defaultState: 'closed',
  states: {
    closed: { file: 'assets/objects/ac_indoor_001/closed.svg', sha256: 'a'.repeat(64) },
    cutaway: { file: 'assets/objects/ac_indoor_001/cutaway.svg', sha256: 'b'.repeat(64) }
  },
  components: [
    { id: 'housing', animatable: false },
    { id: 'fan', selector: '#fan', parentComponentId: 'housing', animatable: true }
  ],
  supportedEngines: ['hyperframes' as const],
  dependencies: [],
  provenance: { source: 'imported' as const },
  consistency: { lockGeometry: true, lockProportions: true, lockMaterials: false },
  createdAt: 1000,
  updatedAt: 2000
}

describe('Shared Video Studio consistency contracts', () => {
  it('enforces asset defaultState, unique component IDs, and acyclic component hierarchy', () => {
    expect(validateMasterAssetInvariants(MasterAssetRecordSchema.parse(baseAsset))).toEqual({
      valid: true,
      errors: []
    })

    const missingDefault = { ...baseAsset, defaultState: 'missing_state' }
    expect(validateMasterAssetInvariants(missingDefault).valid).toBe(false)

    const duplicateComp = {
      ...baseAsset,
      components: [
        { id: 'fan', animatable: true },
        { id: 'fan', animatable: false }
      ]
    }
    expect(validateMasterAssetInvariants(duplicateComp).valid).toBe(false)

    const cycleComp = {
      ...baseAsset,
      components: [
        { id: 'a', parentComponentId: 'b', animatable: true },
        { id: 'b', parentComponentId: 'a', animatable: true }
      ]
    }
    expect(validateMasterAssetInvariants(cycleComp).valid).toBe(false)
  })

  it('validates style profile schemaVersion=1 and all new RPC contracts', () => {
    const parsedStyle = StyleProfileSchema.parse({
      schemaVersion: 1,
      id: 'technical-explainer-01',
      version: 1,
      tier: 'built-in',
      name: 'Technical Explainer',
      palette: {
        background: '#0B1220',
        surface: '#111A2E',
        textPrimary: '#F8FAFC',
        textMuted: '#94A3B8',
        primary: '#38BDF8',
        accent: '#F59E0B',
        danger: '#EF4444'
      },
      typography: {
        displayFont: 'Space Grotesk',
        bodyFont: 'Inter',
        monoFont: 'JetBrains Mono',
        titleScale: 1.4
      },
      motion: {
        defaultPresetId: 'camera-orbit',
        defaultEase: 'power3.out',
        pacing: 'measured'
      },
      safeArea: { topPx: 140, bottomPx: 220, horizontalPx: 64 }
    })
    expect(parsedStyle.id).toBe('technical-explainer-01')

    expect(
      VideoStudioUpdateProjectScriptParams.parse({
        projectId: 'p1',
        scriptMarkdown: '# Narration\nLine 1',
        expectedRevision: 'rev-1'
      }).projectId
    ).toBe('p1')

    expect(
      VideoStudioUpsertResearchSourceParams.parse({
        projectId: 'p1',
        source: {
          id: 'src-1',
          url: 'https://example.com/report',
          title: 'HVAC Thermodynamic Cycle',
          domain: 'example.com',
          snippet: 'Evaporator absorbs indoor heat.',
          origin: 'manual'
        }
      }).source.id
    ).toBe('src-1')

    expect(
      VideoStudioSaveProjectAssetToLibraryParams.parse({
        projectId: 'p1',
        assetId: 'ac_indoor_001',
        versionNote: 'Added operating fan state'
      }).assetId
    ).toBe('ac_indoor_001')

    expect(
      VideoStudioApproveProjectExecutionParams.parse({
        projectId: 'p1',
        expectedFingerprint: 'c'.repeat(64)
      }).expectedFingerprint
    ).toHaveLength(64)
  })
})
```

- [ ] **Step 2: Run the failing contract test**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-contracts.test.ts --maxWorkers=2
```
Expected: FAIL (`Cannot find module './video-studio-asset-contract'`).

- [ ] **Step 3: Implement shared contracts, RPC schemas, and passthrough error codes**

Write each file using `import * as z from 'zod'` strictly:
1. `src/shared/video-studio/video-studio-validation-contract.ts`:
   - `ValidationStatusSchema = z.enum(['passed', 'failed', 'partial', 'error', 'unsupported'])`
   - `VideoStudioCheckFindingSchema` (preserve existing fields + `fixHint?: string`, `suggestedColor?: string`, `frame?: number`, `contrastRatio?: number`)
   - `ValidationReportSchema` (with `status`, `engine`, `engineVersion?`, `inputFingerprint`, `revisions?`, `stale?`, `findings`, `skippedChecks`, `sectionStatuses`, `productionGate: { allowed, blockingReasons }`, `summary`, `checkedAt`, `durationMs?`)
   - `ProjectTrustStateSchema` (`sourceOrigin: z.enum(['orca-scaffold', 'ai-generated', 'imported-external'])`, `trustState: z.enum(['untrusted', 'approved'])`, `approvedFingerprint?`, `approvedAt?`)
2. `src/shared/video-studio/video-studio-style-contract.ts`:
   - `StyleProfileTierSchema`, `StyleProfileSchema` (including `DESIGN.md` snapshot preservation fields `designNotes?: string`), `StyleReconciliationDiffSchema`.
3. `src/shared/video-studio/video-studio-storyboard-contract.ts`:
   - `SceneSpecSchema` (permanent `scene_id`, `order`, `title`, `durationSeconds`, `visualIntent`, `narration`, `assetsUsed`, `motionPresetId`, `lockedSections`, `extra`), `StoryboardDocumentSchema`, `CompositionDriftReportSchema`, `ProjectResearchSourceSchema` (standalone research source model supporting `'web-search' | 'deep-research' | 'manual'` plus verification notes).
4. `src/shared/video-studio/video-studio-asset-contract.ts`:
   - `AssetTypeSchema`, `AssetFormatSchema`, `AssetStateEntrySchema`, `AssetComponentSpecSchema`, `MasterAssetRecordSchema`, `AssetInstanceRefSchema`, `AssetRegistryDocumentSchema`
   - Export `validateMasterAssetInvariants(asset: MasterAssetRecord): { valid: boolean; errors: string[] }` checking defaultState existence, unique component IDs, valid parentComponentId references, and DFS cycle detection.
5. `src/shared/video-studio/video-studio-extension-contract.ts`:
   - `MotionPresetSchema`, `EngineCapabilitiesSchema`, `StyleTokenTransformerSchema` metadata for HyperFrames (`now`), OpenMotion (`phase-04`), Remotion (`phase-06`).
6. Update `src/shared/video-studio/video-studio-project.ts` (`styleProfileId?: string`, `trustState?: ProjectTrustState`) keeping existing defaults intact.
7. Update `src/shared/video-studio/video-studio-rpc-contract.ts` exporting all 22 new method constants (`VIDEO_STUDIO_GET_PROJECT_STYLE_STATE_METHOD`, ..., `VIDEO_STUDIO_APPROVE_PROJECT_EXECUTION_METHOD`), `ProjectFilesChangedEvent`, and updating `VIDEO_STUDIO_RPC_METHODS` / catalog exports.
8. Update `src/main/runtime/rpc/runtime-passthrough-codes.ts` registering all 12 new `video_studio_*` passthrough codes cleanly.

- [ ] **Step 4: Run shared tests and check `verify:rpc-params-catalog` & `build:mobile-web` imports**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/video-studio-project.test.ts src/shared/video-studio/video-studio-contracts.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }; if ($LASTEXITCODE -eq 0) { pnpm run verify:rpc-params-catalog }
```
Expected: Tests pass; `tc:node` and `verify:rpc-params-catalog` exit 0.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/shared/video-studio/ src/main/runtime/rpc/runtime-passthrough-codes.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): add shared contracts, invariant validators, and Studio RPC schemas" }
```

---

## Task 4: Persistence, Containment Security & Multi-File Transaction Foundation

**Dependencies:** Task 3 (shared error codes and Zod schemas).

**Files:**
- Modify: `src/main/video-studio/video-studio-composition-paths.ts`
- Create: `src/main/video-studio/video-studio-path-containment.ts`
- Create: `src/main/video-studio/video-studio-transactions.ts`
- Create: `src/main/video-studio/video-studio-trust-store.ts`
- Modify: `src/main/video-studio/video-studio-composition-paths.test.ts`
- Create: `src/main/video-studio/video-studio-transactions.test.ts`

**Acceptance Criteria:**
1. Containment helper rejects traversal (`..`), NUL bytes, drive prefixes, UNC paths, mixed `/` and `\` escape segments, AND post-resolution symlinks / Windows directory junctions outside canonical root (`projects/<projectId>/`, `styles/`, `assets/`).
2. `VideoStudioLockCoordinator` strictly enforces Canonical Lock Order (`HostStyleLibraryLock -> HostAssetLibraryLock -> ProjectMutationQueue[projectId]`), rejecting inverted lock requests programmatically if ever attempted.
3. `VideoStudioTransactionCoordinator` implements 4-step `.orca/tx.log` protocol:
   - Captures `beforeSha256` backups under `.orca/.staging/<txId>/backups/` + validates `expectedRevision`.
   - Writes staged files under `.orca/.staging/<txId>/staged/` via `durableWriteTempPath`.
   - **Verifies all staged files AND backup files exist on disk and match recorded SHA-256 hashes BEFORE advancing `.orca/tx.log` to `'committing'`**.
   - Startup `recoverPendingProjectTransaction(projectDir)` finishes cleanly if hashes are clean and refuses blind rollback with `video_studio_tx_recovery_conflict` (archiving `.orca/tx-conflict-<txId>.json`) if an unknown external hash is found.
4. `computeProjectInputFingerprint(projectDir)` computes deterministic SHA-256 over `index.html`, `compositions/*.html`, `scenes/*.html`, `hyperframes.json`, `styles/style-profile.json`, `assets/asset-registry.json`.
5. `VideoStudioTrustStore` manages `.orca/project-state.json` trust state and refuses Chrome preview/render execution with `video_studio_execution_approval_required` whenever untrusted/modified `inputFingerprint` lacks explicit approval.

**Rollback Considerations:** Additive persistence/containment modules; existing `resolveVideoStudioProjectDir` / `resolveVideoStudioRenderOutputFile` signatures remain backward-compatible.

- [ ] **Step 1: Write failing containment, transaction verification, recovery, and lock-order tests**

Create `src/main/video-studio/video-studio-transactions.test.ts`:
```ts
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertContainedPath, resolveCanonicalContainmentRoot } from './video-studio-path-containment'
import {
  VideoStudioLockCoordinator,
  VideoStudioTransactionCoordinator,
  recoverPendingProjectTransaction
} from './video-studio-transactions'
import { computeProjectInputFingerprint, VideoStudioTrustStore } from './video-studio-trust-store'

let rootDir: string
let projectDir: string
let outsideDir: string

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'orca-tx-'))
  projectDir = join(rootDir, 'project-a')
  outsideDir = join(rootDir, 'outside-secret')
  await mkdir(projectDir, { recursive: true })
  await mkdir(outsideDir, { recursive: true })
  await writeFile(join(outsideDir, 'secret.txt'), 'TOP_SECRET', 'utf8')
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe('Containment & Transaction Crash Recovery', () => {
  it('blocks traversal, UNC/drive escapes, and symlink/junction containment escapes', async () => {
    const canonicalRoot = await resolveCanonicalContainmentRoot(projectDir)
    for (const bad of ['../outside/secret.txt', '..\\outside\\secret.txt', 'C:\\Windows\\win.ini', '\\\\server\\share\\x', 'a\0b.html']) {
      await expect(assertContainedPath(canonicalRoot, bad)).rejects.toThrow('video_studio_invalid_path')
    }

    const linkPath = join(projectDir, 'escaped-link')
    await symlink(outsideDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(assertContainedPath(canonicalRoot, 'escaped-link/secret.txt')).rejects.toThrow(
      'video_studio_invalid_path'
    )
  })

  it('verifies staged files and backups on disk before advancing tx.log to committing', async () => {
    const targetA = join(projectDir, 'a.txt')
    const targetB = join(projectDir, 'b.txt')
    await writeFile(targetA, 'before-a', 'utf8')
    await writeFile(targetB, 'before-b', 'utf8')

    const locks = new VideoStudioLockCoordinator()
    const tx = new VideoStudioTransactionCoordinator(locks)
    const phasesSeen: string[] = []

    await tx.runProjectTransaction(
      projectDir,
      'project-a',
      [
        { relativePath: 'a.txt', content: 'after-a', expectedSha256: sha256('before-a') },
        { relativePath: 'b.txt', content: 'after-b', expectedSha256: sha256('before-b') }
      ],
      {
        onStateChange: async (state) => {
          phasesSeen.push(state)
        }
      }
    )

    expect(phasesSeen).toEqual(['preparing', 'staged-verified', 'committing', 'committed'])
    expect(await readFile(targetA, 'utf8')).toBe('after-a')
    expect(await readFile(targetB, 'utf8')).toBe('after-b')
  })

  it('rejects expectedRevision mismatch with video_studio_file_conflict without modifying targets', async () => {
    await writeFile(join(projectDir, 'a.txt'), 'disk-latest', 'utf8')
    const tx = new VideoStudioTransactionCoordinator(new VideoStudioLockCoordinator())

    await expect(
      tx.runProjectTransaction(projectDir, 'project-a', [
        { relativePath: 'a.txt', content: 'stale-write', expectedSha256: sha256('stale-rev') }
      ])
    ).rejects.toThrow('video_studio_file_conflict')
    expect(await readFile(join(projectDir, 'a.txt'), 'utf8')).toBe('disk-latest')
  })

  it('recovers partial commit cleanly when hashes match, and protects external agent edits on conflict', async () => {
    const file1 = join(projectDir, 'styles', 'style-profile.json')
    const file2 = join(projectDir, 'frame.md')
    await mkdir(join(projectDir, 'styles'), { recursive: true })
    await mkdir(join(projectDir, '.orca', '.staging', 'tx-1', 'backups'), { recursive: true })
    await mkdir(join(projectDir, '.orca', '.staging', 'tx-1', 'staged'), { recursive: true })

    await writeFile(file1, 'new-json', 'utf8') // partially committed!
    await writeFile(file2, 'old-md', 'utf8')   // not yet renamed!
    await writeFile(join(projectDir, '.orca', '.staging', 'tx-1', 'backups', 'styles__style-profile.json'), 'old-json', 'utf8')
    await writeFile(join(projectDir, '.orca', '.staging', 'tx-1', 'backups', 'frame.md'), 'old-md', 'utf8')
    await writeFile(join(projectDir, '.orca', '.staging', 'tx-1', 'staged', 'styles__style-profile.json'), 'new-json', 'utf8')
    await writeFile(join(projectDir, '.orca', '.staging', 'tx-1', 'staged', 'frame.md'), 'new-md', 'utf8')

    const logPayload = {
      txId: 'tx-1',
      state: 'committing',
      targets: [
        {
          relativePath: 'styles/style-profile.json',
          existed: true,
          beforeSha256: sha256('old-json'),
          afterSha256: sha256('new-json'),
          backupRelativePath: '.orca/.staging/tx-1/backups/styles__style-profile.json',
          stagedRelativePath: '.orca/.staging/tx-1/staged/styles__style-profile.json'
        },
        {
          relativePath: 'frame.md',
          existed: true,
          beforeSha256: sha256('old-md'),
          afterSha256: sha256('new-md'),
          backupRelativePath: '.orca/.staging/tx-1/backups/frame.md',
          stagedRelativePath: '.orca/.staging/tx-1/staged/frame.md'
        }
      ]
    }
    await writeFile(join(projectDir, '.orca', 'tx.log'), JSON.stringify(logPayload), 'utf8')

    // Case 1: clean rollback/finish
    const resClean = await recoverPendingProjectTransaction(projectDir)
    expect(resClean.status).toBe('recovered')
    expect(await readFile(file1, 'utf8')).toBe('old-json')
    expect(await readFile(file2, 'utf8')).toBe('old-md')

    // Case 2: external agent edited file2 while tx.log was mid-commit -> MUST NOT overwrite!
    await writeFile(file1, 'new-json', 'utf8')
    await writeFile(file2, 'AGENT_EDITED_FRAME', 'utf8')
    await mkdir(join(projectDir, '.orca', '.staging', 'tx-1', 'backups'), { recursive: true })
    await writeFile(join(projectDir, '.orca', '.staging', 'tx-1', 'backups', 'styles__style-profile.json'), 'old-json', 'utf8')
    await writeFile(join(projectDir, '.orca', 'tx.log'), JSON.stringify(logPayload), 'utf8')

    const resConflict = await recoverPendingProjectTransaction(projectDir)
    expect(resConflict.status).toBe('conflict')
    expect(await readFile(file2, 'utf8')).toBe('AGENT_EDITED_FRAME')
  })

  it('requires fresh approval when workspace inputFingerprint changes', async () => {
    await writeFile(join(projectDir, 'index.html'), '<html><body>v1</body></html>', 'utf8')
    const fp1 = await computeProjectInputFingerprint(projectDir)
    const trustStore = new VideoStudioTrustStore()

    await expect(trustStore.assertApprovedForExecution(projectDir, fp1)).rejects.toThrow(
      'video_studio_execution_approval_required'
    )

    await trustStore.approveFingerprint(projectDir, fp1, 'ai-generated')
    await expect(trustStore.assertApprovedForExecution(projectDir, fp1)).resolves.toBeUndefined()

    await writeFile(join(projectDir, 'index.html'), '<html><body>v2</body></html>', 'utf8')
    const fp2 = await computeProjectInputFingerprint(projectDir)
    expect(fp2).not.toBe(fp1)
    await expect(trustStore.assertApprovedForExecution(projectDir, fp2)).rejects.toThrow(
      'video_studio_execution_approval_required'
    )
  })
})
```

- [ ] **Step 2: Run the failing Task 4 test**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-transactions.test.ts --maxWorkers=2
```
Expected: FAIL (`Cannot find module './video-studio-path-containment'`).

- [ ] **Step 3: Implement containment, canonical lock coordinator, hash-verified TX journal, and trust store**

Implement:
- `src/main/video-studio/video-studio-path-containment.ts`: canonical root resolution + segment traversal / Windows drive / UNC / NUL / `realpath` junction containment validation (`video_studio_invalid_path`), plus `assertSafeRelativePath`.
- `src/main/video-studio/video-studio-transactions.ts`:
  - `VideoStudioLockCoordinator`: async serialized mutex lanes for `'host-styles'`, `'host-assets'`, and per-project `'project:<projectId>'`; `withLocks({ hostStyles?, hostAssets?, projectId? }, fn)` ALWAYS acquires strictly in `hostStyles -> hostAssets -> projectId` order.
  - `VideoStudioTransactionCoordinator`: backup pre-images -> stage new payloads -> **re-read and verify SHA-256 of ALL staged files AND ALL backups BEFORE advancing `.orca/tx.log` to `'committing'`** -> atomic renames (`durableWriteTempPath`) -> cleanup `.orca/tx.log` & `.orca/.staging/<txId>`.
  - `recoverPendingProjectTransaction(projectDir)`: handles `'preparing'` (discard staging/log), `'committing'` (check hashes; rollback if clean; never overwrite external unknown hashes and move log to `.orca/tx-conflict-<txId>.json` returning `{ status: 'conflict', conflictFile }`).
- `src/main/video-studio/video-studio-trust-store.ts`: `computeProjectInputFingerprint(projectDir)` and `VideoStudioTrustStore` (`readTrustState`, `markUntrusted`, `approveFingerprint`, `assertApprovedForExecution`). (Orca's untouched scaffold hashes can initialize as `'orca-scaffold'`/`'approved'` at initial creation and immediately revert to `'untrusted'` whenever `inputFingerprint` changes externally.)
- Update `src/main/video-studio/video-studio-composition-paths.ts`: re-export containment helpers cleanly and resolve Host Library paths (`resolveHostVideoStylesDir`, `resolveHostVideoAssetsDir`).

- [ ] **Step 4: Run Task 4 tests + typecheck**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/video-studio-transactions.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```
Expected: All tests pass; `tc:node` exits 0.

- [ ] **Step 5: Commit Task 4**

```powershell
git add src/main/video-studio/video-studio-path-containment.ts src/main/video-studio/video-studio-transactions.ts src/main/video-studio/video-studio-trust-store.ts src/main/video-studio/video-studio-composition-paths.ts src/main/video-studio/video-studio-transactions.test.ts src/main/video-studio/video-studio-composition-paths.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): add containment checks, hash-verified multi-file transactions, and execution trust store" }
```

---

## Task 5: Modular HyperFrames `0.9.94` Project Scaffold & Stage 1/2 Legacy Migration

**Dependencies:** Task 4 (containment and transaction foundation).

**Files:**
- Modify: `src/main/video-studio/video-studio-hyperframes-template.ts`
- Modify: `src/main/video-studio/video-studio-composition-paths.ts`
- Modify: `src/main/video-studio/video-studio-catalog.ts`
- Modify: `src/main/video-studio/video-studio-composition-paths.test.ts`

**Acceptance Criteria:**
1. Fresh scaffolding (`overwrite: true` or empty dir) creates full Phase 02–03 layout:
   - `.orca/schema-version.json` (`{ "schemaVersion": 2, "engine": "hyperframes", "engineVersion": "0.9.94" }`)
   - `.orca/project-state.json`
   - `hyperframes.json` (`{ "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json", "registry": "https://hyperframes.heygen.com/r", "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" }, "media": { "autoProxy": true } }`)
   - `meta.json` (`{ "name", "width", "height", "fps", "durationSeconds" }`)
   - `package.json` (valid JSON metadata matching project slug)
   - `index.html` using `<template id="tpl-scene-01-intro" data-composition-id="scene-01-intro">` + `<div data-composition-id="scene-01-intro" data-composition-src="./compositions/scene-01-intro.html">` and `window.__timelines` wrapper with safe HTML escaping.
   - `compositions/scene-01-intro.html` + `compositions/components/`
   - `BRIEF.md`, `STORYBOARD.md`, `SCRIPT.md`, `frame.md`, `DESIGN.md`, `MOTION.md`, `styles/style-profile.json`, `assets/asset-registry.json`, `assets/objects/`, `assets/characters/`, `assets/environments/`, `assets/graphics/`, `assets/audio/`, `assets/video/`, `references/sources.json`, `references/research-notes.md`.
2. Non-destructive upgrade (`scaffoldHyperFramesComposition(projectDir, project, { overwrite: false })`) on Stage 2 projects (`scenes/` + legacy `hyperframes.json` `{ id, width, height, fps, durationSeconds }`):
   - Fills only missing Phase 02–03 directories/files, upgrades `hyperframes.json` ONLY if it matches exact legacy Stage 2 shape, **never** deletes `scenes/`, and **never** overwrites custom `index.html`.
3. `inspectVideoStudioCompositionState` scans both `compositions/**/*.html` and legacy `scenes/**/*.html` accurately and triggers startup `.orca/tx.log` recovery cleanly.

**Rollback Considerations:** Stage 2 projects never lose `scenes/` or custom `index.html`; reverting template/paths files restores previous scaffold behavior safely.

- [ ] **Step 1: Add failing modular scaffold and Stage 2 non-destructive upgrade tests in `src/main/video-studio/video-studio-composition-paths.test.ts`**

Append inside `describe('scaffoldHyperFramesComposition', ...)`:
```ts
it('scaffolds modular Phase 02-03 layout cleanly when directory is fresh', async () => {
  const projectDir = resolveVideoStudioProjectDir(userDataPath, mockProject.id)
  const state = await scaffoldHyperFramesComposition(projectDir, mockProject, { overwrite: false })
  expect(state.files).toEqual(
    expect.arrayContaining([
      'hyperframes.json',
      'index.html',
      'meta.json',
      'package.json',
      'compositions/scene-01-intro.html',
      'styles/style-profile.json',
      'assets/asset-registry.json',
      'BRIEF.md',
      'STORYBOARD.md',
      'SCRIPT.md'
    ])
  )
  const hfJson = JSON.parse(await readFile(join(projectDir, 'hyperframes.json'), 'utf8'))
  expect(hfJson.paths).toEqual({
    blocks: 'compositions',
    components: 'compositions/components',
    assets: 'assets'
  })
  const schemaVer = JSON.parse(
    await readFile(join(projectDir, '.orca', 'schema-version.json'), 'utf8')
  )
  expect(schemaVer.schemaVersion).toBe(2)
})

it('preserves Stage 2 legacy scenes/ and custom index.html on non-destructive upgrade', async () => {
  const projectDir = resolveVideoStudioProjectDir(userDataPath, 'legacy-proj')
  await mkdir(join(projectDir, 'scenes'), { recursive: true })
  await writeFile(join(projectDir, 'scenes', 'scene-01.html'), '<div>legacy-scene</div>', 'utf8')
  await writeFile(join(projectDir, 'index.html'), '<!-- CUSTOM AGENT --><div>custom</div>', 'utf8')
  await writeFile(
    join(projectDir, 'hyperframes.json'),
    JSON.stringify({ id: 'legacy-proj', width: 1920, height: 1080, fps: 30, durationSeconds: 30 }),
    'utf8'
  )

  const state = await scaffoldHyperFramesComposition(
    projectDir,
    { ...mockProject, id: 'legacy-proj' },
    { overwrite: false }
  )
  expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toContain('<!-- CUSTOM AGENT -->')
  expect(await readFile(join(projectDir, 'scenes', 'scene-01.html'), 'utf8')).toContain('legacy-scene')
  expect(state.files).toEqual(expect.arrayContaining(['scenes/scene-01.html', 'BRIEF.md', 'STORYBOARD.md']))
  const upgradedHf = JSON.parse(await readFile(join(projectDir, 'hyperframes.json'), 'utf8'))
  expect(upgradedHf.paths.blocks).toBe('compositions')
})
```

- [ ] **Step 2: Run the updated `video-studio-composition-paths.test.ts` to verify FAIL**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts --maxWorkers=2
```
Expected: FAIL (new files `compositions/scene-01-intro.html`, `.orca/schema-version.json`, etc. missing).

- [ ] **Step 3: Implement modular HyperFrames `0.9.94` scaffold, non-destructive upgrade, and legacy scan**

Update `video-studio-hyperframes-template.ts`, `video-studio-composition-paths.ts`, and `video-studio-catalog.ts` cleanly using built-in default `technical-explainer-01` token seed (or selected `project.styleProfileId` when passed) and atomic writes.

- [ ] **Step 4: Run `video-studio-composition-paths.test.ts` + `video-studio-catalog.test.ts` + typecheck**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-composition-paths.test.ts src/main/video-studio/video-studio-catalog.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```
Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/main/video-studio/video-studio-hyperframes-template.ts src/main/video-studio/video-studio-composition-paths.ts src/main/video-studio/video-studio-catalog.ts src/main/video-studio/video-studio-composition-paths.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): scaffold modular 0.9.94 compositions with non-destructive Stage 2 migration" }
```

---

## Task 6: Dual-Scope Style Profile, Universal Motion Registry & Markdown Document / Storyboard Services

**Dependencies:** Task 4 (transactions & canonical lock order) & Task 5 (scaffold layout).

**Files:**
- Create: `src/main/video-studio/style/builtin-style-presets.ts`
- Create: `src/main/video-studio/style/video-studio-style-store.ts`
- Create: `src/main/video-studio/motion/builtin-motion-presets.ts`
- Create: `src/main/video-studio/documents/video-studio-markdown-sync.ts`
- Create: `src/main/video-studio/documents/video-studio-composition-drift.ts`
- Create: `src/main/video-studio/documents/video-studio-documents.test.ts`

**Acceptance Criteria:**
1. Two built-in Style Profile presets (`technical-explainer-01`, `clean-editorial-01`) + User Library storage (`<profileDir>/video-studio/styles/<styleId>/` containing `style-profile.json`, `frame.md`, optional `DESIGN.md`, `MOTION.md`) + Project Snapshot (`styles/style-profile.json`).
2. `saveStyleProfileToLibrary` creates immutable library versions (`v<n+1>`) under `HostStyleLibraryLock` and NEVER mutates existing project snapshots.
3. `applyStyleProfileToProject` & `updateProjectStyle` update `styles/style-profile.json` + managed YAML frontmatter inside `frame.md`, `DESIGN.md`, and `MOTION.md` in one multi-file transaction under `HostStyleLibraryLock -> ProjectMutationQueue` lock order without clobbering user/agent Markdown prose below frontmatter.
4. External agent edits to managed colors/fonts/timing in `frame.md`/`MOTION.md` trigger `getStyleReconciliationDiff` and both resolution paths (`import-from-markdown`, `reapply-json`).
5. `STORYBOARD.md` round-trip parser preserves permanent `scene_id`, `## Locked` sections, unknown YAML `extra` keys, and CRLF/LF line endings cleanly across reorders and title edits.
6. `SCRIPT.md`, `BRIEF.md`, and `references/sources.json` support structured read/write with `expectedRevision`; `computeCompositionDrift` flags planned-vs-actual scene duration/mount mismatches.
7. `UniversalMotionRegistry` provides 6 built-in presets (`camera-orbit`, `stagger-list`, `panel-reveal`, `callout-pointer`, `kinetic-title`, `data-chart-sweep`).

**Rollback Considerations:** Style presets and markdown sync live in standalone `style/`, `motion/`, `documents/` submodules; reversible without altering engine adapters.

- [ ] **Step 1: Write failing round-trip, snapshot isolation, reconciliation, and drift tests in `src/main/video-studio/documents/video-studio-documents.test.ts`**

Create `src/main/video-studio/documents/video-studio-documents.test.ts`:
```ts
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VideoStudioLockCoordinator, VideoStudioTransactionCoordinator } from '../video-studio-transactions'
import { VideoStudioStyleStore } from '../style/video-studio-style-store'
import { BUILTIN_MOTION_PRESETS } from '../motion/builtin-motion-presets'
import { computeCompositionDrift } from './video-studio-composition-drift'
import {
  formatStoryboardMarkdown,
  parseStoryboardMarkdown,
  patchMarkdownManagedFrontmatter
} from './video-studio-markdown-sync'

let profileDir: string
let projectA: string
let projectB: string

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), 'orca-vs-docs-'))
  projectA = join(profileDir, 'video-studio', 'projects', 'proj-a')
  projectB = join(profileDir, 'video-studio', 'projects', 'proj-b')
  await mkdir(join(projectA, 'styles'), { recursive: true })
  await mkdir(join(projectA, 'compositions'), { recursive: true })
  await mkdir(join(projectB, 'styles'), { recursive: true })
  await mkdir(join(projectB, 'compositions'), { recursive: true })
})

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true })
})

describe('Markdown Sync, Dual-Scope Style & Composition Drift', () => {
  it('preserves permanent scene_id, Locked prose, unknown frontmatter, and CRLF safely on STORYBOARD reorder', () => {
    const original = [
      '---',
      'schemaVersion: 1',
      'customMeta: keep-me',
      '---',
      '',
      '## Locked',
      '- Brand tone must stay concise.',
      '',
      '### Scene 1 <!-- scene_id: sc_01 -->',
      '- title: Hook',
      '- durationSeconds: 6',
      '- assetsUsed: ac_indoor_001@closed',
      '',
      'Agent custom notes here.',
      '',
      '### Scene 2 <!-- scene_id: sc_02 -->',
      '- title: Mechanism',
      '- durationSeconds: 8',
      '- assetsUsed: ac_indoor_001@cutaway',
      ''
    ].join('\r\n')

    const parsed = parseStoryboardMarkdown(original)
    expect(parsed.scenes.map((s) => s.sceneId)).toEqual(['sc_01', 'sc_02'])
    expect(parsed.lockedSections).toContain('Brand tone must stay concise.')

    // Reorder Scene 2 before Scene 1 and rename Scene 2
    const reordered = formatStoryboardMarkdown({
      ...parsed,
      scenes: [
        { ...parsed.scenes[1], order: 1, title: 'Cutaway Reveal' },
        { ...parsed.scenes[0], order: 2 }
      ]
    })
    const reparsed = parseStoryboardMarkdown(reordered)
    expect(reparsed.scenes.map((s) => s.sceneId)).toEqual(['sc_02', 'sc_01'])
    expect(reparsed.scenes[0].title).toBe('Cutaway Reveal')
    expect(reparsed.extra?.customMeta).toBe('keep-me')
    expect(reparsed.lockedSections).toContain('Brand tone must stay concise.')
  })

  it('isolates project snapshots from Host Library updates and detects manual frame.md edits', async () => {
    const locks = new VideoStudioLockCoordinator()
    const tx = new VideoStudioTransactionCoordinator(locks)
    const styles = new VideoStudioStyleStore(profileDir, locks, tx)

    await styles.applyStyleToProject('proj-a', projectA, 'technical-explainer-01')
    await styles.applyStyleToProject('proj-b', projectB, 'technical-explainer-01')

    // Save customized style from proj-a to Host Library (preserves DESIGN.md too)
    await writeFile(join(projectA, 'DESIGN.md'), '# Design Philosophy\n\nCrisp vector cutaways.\n', 'utf8')
    const libEntry = await styles.saveProjectStyleToLibrary('proj-a', projectA, {
      id: 'technical-explainer-custom',
      name: 'Technical Explainer Custom'
    })
    expect(libEntry.version).toBe(1)

    // Modify projectA local palette and verify library + projectB remain untouched
    const snapA = await styles.getProjectStyleState('proj-a', projectA)
    await styles.updateProjectStyle('proj-a', projectA, {
      palette: { ...snapA.profile.palette, primary: '#10B981' },
      expectedRevision: snapA.revisions['styles/style-profile.json']
    })
    const snapB = await styles.getProjectStyleState('proj-b', projectB)
    expect(snapB.profile.palette.primary).not.toBe('#10B981')

    // Simulate external agent editing primary token inside projectA frame.md
    const frameRaw = await readFile(join(projectA, 'frame.md'), 'utf8')
    await writeFile(join(projectA, 'frame.md'), frameRaw.replace('#10B981', '#F97316'), 'utf8')
    const diff = await styles.getStyleReconciliationDiff('proj-a', projectA)
    expect(diff.hasConflict).toBe(true)
    expect(diff.changedFields).toContain('palette.primary')

    // Reapply JSON restores frame.md managed token while preserving prose
    await styles.reconcileProjectStyle('proj-a', projectA, 'reapply-json')
    const afterReapply = await readFile(join(projectA, 'frame.md'), 'utf8')
    expect(afterReapply).toContain('#10B981')
    expect(BUILTIN_MOTION_PRESETS.length).toBeGreaterThanOrEqual(6)
  })

  it('detects composition duration and unmounted scene drift vs STORYBOARD.md', async () => {
    await writeFile(
      join(projectA, 'STORYBOARD.md'),
      [
        '### Scene 1 <!-- scene_id: sc_01 -->',
        '- title: Hook',
        '- durationSeconds: 6',
        '- compositionFile: compositions/scene-01.html',
        '### Scene 2 <!-- scene_id: sc_02 -->',
        '- title: Unmounted Scene',
        '- durationSeconds: 5',
        '- compositionFile: compositions/scene-02.html'
      ].join('\n'),
      'utf8'
    )
    await writeFile(
      join(projectA, 'compositions', 'scene-01.html'),
      '<div data-composition-id="sc_01" data-duration="8"></div>',
      'utf8'
    )
    await writeFile(
      join(projectA, 'index.html'),
      '<div data-composition-id="sc_01" data-composition-src="./compositions/scene-01.html"></div>',
      'utf8'
    )

    const drift = await computeCompositionDrift(projectA)
    expect(drift.hasDrift).toBe(true)
    expect(drift.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sceneId: 'sc_01', kind: 'duration-mismatch', plannedSeconds: 6, actualSeconds: 8 }),
        expect.objectContaining({ sceneId: 'sc_02', kind: 'missing-composition-file' })
      ])
    )
  })
})
```

- [ ] **Step 2: Run the failing document & style tests**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/documents/video-studio-documents.test.ts --maxWorkers=2
```
Expected: FAIL (`Cannot find module '../style/video-studio-style-store'`).

- [ ] **Step 3: Implement Style Presets, Style Store, Motion Presets, Markdown Sync & Composition Drift**

Implement using `yaml` (`parse`/`stringify`) already installed in `package.json`:
- `video-studio-markdown-sync.ts`: frontmatter extraction/patching (`patchMarkdownManagedFrontmatter`), `parseStoryboardMarkdown` / `formatStoryboardMarkdown` preserving permanent `scene_id` comments, `## Locked` sections, prose bodies, unknown YAML keys, and CRLF line-ending tolerance.
- `builtin-style-presets.ts`: define `technical-explainer-01` and `clean-editorial-01` (`StyleProfile`, `frame.md`, `DESIGN.md`, `MOTION.md`).
- `video-studio-style-store.ts`: built-in + host library + project snapshot CRUD, `DESIGN.md` copying in Host Library, `getStyleReconciliationDiff`, `reconcileProjectStyle`.
- `builtin-motion-presets.ts`: 6 presets (`camera-orbit`, `stagger-list`, `panel-reveal`, `callout-pointer`, `kinetic-title`, `data-chart-sweep`) with GSAP/CSS reference metadata.
- `video-studio-composition-drift.ts`: compare parsed `STORYBOARD.md` scenes against mounted `<div data-composition-src>` in `index.html` and `data-duration` attributes in `compositions/*.html` / `scenes/*.html`.

- [ ] **Step 4: Run Task 6 tests + typecheck**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/documents/video-studio-documents.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```
Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/main/video-studio/style/ src/main/video-studio/motion/ src/main/video-studio/documents/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): implement dual-scope style profiles, motion registry, storyboard sync, and drift detection" }
```

---

## Task 7: Master Asset Registry & Host Reusable Asset Library

**Dependencies:** Task 4 (containment, lock coordinator, TX manager) & Task 6 (`parseStoryboardMarkdown` for asset usage reference scanning).

**Files:**
- Create: `src/main/video-studio/assets/video-studio-asset-invariants.ts`
- Create: `src/main/video-studio/assets/video-studio-asset-store.ts`
- Create: `src/main/video-studio/assets/video-studio-asset-registry.test.ts`

**Acceptance Criteria:**
1. Enforces all Asset & Style Snapshot Invariants on disk (`defaultState` in `states`, unique `components[].id`, acyclic `parentComponentId`, containment + existence + SHA-256 hash verification of every `states[state].file` and `dependencies[]`).
2. `saveProjectAssetToLibrary` publishes into immutable Host Asset Library version directories (`assets/<assetId>/v1/`, `v2/`, ...) under strict `HostAssetLibraryLock -> ProjectMutationQueue` order without mutating existing library versions or overwriting other projects' snapshots.
3. `applyLibraryAssetToProject` copies the chosen published version's files and dependencies cleanly into `assets/<category>/<assetId>/...` inside the project so projects stay portable.
4. `updateAssetMetadata` supports name, type, tags, full **asset state management** (add/update/remove custom states & `defaultState`), components, provenance, license, and consistency locks, updating `snapshotRevision` cleanly.
5. `removeProjectAsset` scans both `STORYBOARD.md` `assetsUsed` and HTML `index.html`/`compositions/*.html`/`scenes/*.html` references; blocks deletion with `video_studio_asset_in_use` when referenced unless `force: true`.

**Rollback Considerations:** Isolated under `src/main/video-studio/assets/`; Host Library versions `v<n>` are append-only/immutable so bad edits create `v<n+1>` or stay inside project TX staging.

- [ ] **Step 1: Write failing Asset Registry invariant, immutable library versioning, portability, and in-use guard tests**

Create `src/main/video-studio/assets/video-studio-asset-registry.test.ts`:
```ts
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VideoStudioLockCoordinator, VideoStudioTransactionCoordinator } from '../video-studio-transactions'
import { VideoStudioAssetStore } from './video-studio-asset-store'

let profileDir: string
let projectA: string
let projectB: string

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), 'orca-vs-assets-'))
  projectA = join(profileDir, 'video-studio', 'projects', 'proj-a')
  projectB = join(profileDir, 'video-studio', 'projects', 'proj-b')
  await mkdir(join(projectA, 'assets'), { recursive: true })
  await mkdir(join(projectA, 'compositions'), { recursive: true })
  await mkdir(join(projectB, 'assets'), { recursive: true })
  await mkdir(join(projectB, 'compositions'), { recursive: true })
})

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true })
})

describe('VideoStudioAssetStore', () => {
  it('registers multi-state animatable SVG asset, verifies SHA-256 invariants, publishes immutable v1/v2 library versions, and blocks in-use delete', async () => {
    const locks = new VideoStudioLockCoordinator()
    const tx = new VideoStudioTransactionCoordinator(locks)
    const store = new VideoStudioAssetStore(profileDir, locks, tx)

    await store.registerOrImportAsset('proj-a', projectA, {
      id: 'ac_indoor_001',
      name: 'AC Indoor Split Unit',
      type: 'object',
      format: 'svg',
      tags: ['hvac'],
      defaultState: 'closed',
      files: [
        {
          stateKey: 'closed',
          relativePath: 'assets/objects/ac_indoor_001/closed.svg',
          contentBase64: Buffer.from('<svg id="ac-closed"><rect id="housing"/></svg>').toString('base64')
        },
        {
          stateKey: 'cutaway',
          relativePath: 'assets/objects/ac_indoor_001/cutaway.svg',
          contentBase64: Buffer.from('<svg id="ac-cutaway"><g id="fan"></g></svg>').toString('base64')
        }
      ],
      components: [
        { id: 'housing', selector: '#housing', animatable: false },
        { id: 'fan', selector: '#fan', parentComponentId: 'housing', animatable: true }
      ]
    })

    // Add 'operating' state via updateAssetMetadata while keeping logical id 'ac_indoor_001'
    const listedA = await store.listProjectAssets(projectA)
    expect(listedA.assets[0].id).toBe('ac_indoor_001')

    const v1Lib = await store.saveProjectAssetToLibrary('proj-a', projectA, {
      assetId: 'ac_indoor_001',
      versionNote: 'Initial v1'
    })
    expect(v1Lib.version).toBe(1)

    // Apply v1 into projectB -> portable copy exists inside projectB
    await store.applyLibraryAssetToProject('proj-b', projectB, { assetId: 'ac_indoor_001', version: 1 })
    const bFile = await readFile(join(projectB, 'assets', 'objects', 'ac_indoor_001', 'cutaway.svg'), 'utf8')
    expect(bFile).toContain('id="ac-cutaway"')

    // Corrupt SHA-256 on disk in projectB and verify invariant checker flags hash mismatch
    await writeFile(join(projectB, 'assets', 'objects', 'ac_indoor_001', 'cutaway.svg'), '<svg>tampered</svg>', 'utf8')
    const afterTamper = await store.listProjectAssets(projectB)
    expect(afterTamper.warnings.some((w) => w.code === 'sha256-mismatch')).toBe(true)

    // Reference ac_indoor_001 in STORYBOARD.md -> delete without force MUST fail with video_studio_asset_in_use
    await writeFile(
      join(projectA, 'STORYBOARD.md'),
      '### Scene 1 <!-- scene_id: sc_01 -->\n- assetsUsed: ac_indoor_001@cutaway\n',
      'utf8'
    )
    await expect(store.removeProjectAsset('proj-a', projectA, 'ac_indoor_001', false)).rejects.toThrow(
      'video_studio_asset_in_use'
    )
    await expect(store.removeProjectAsset('proj-a', projectA, 'ac_indoor_001', true)).resolves.toMatchObject({
      removedId: 'ac_indoor_001'
    })
  })
})
```

- [ ] **Step 2: Run the failing Task 7 test**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/assets/video-studio-asset-registry.test.ts --maxWorkers=2
```
Expected: FAIL (`Cannot find module './video-studio-asset-store'`).

- [ ] **Step 3: Implement `video-studio-asset-invariants.ts` and `video-studio-asset-store.ts`**

Ensure:
- Bounded payload decoding (cap uploaded base64 files at safe limit, e.g. `15 MiB` per state asset, rejecting traversal in relative paths via Task 4 `assertContainedPath`).
- Strict SHA-256 verification across every state file and `dependencies[]`.
- Immutable Host Library storage (`<profileDir>/video-studio/assets/<assetId>/v<n>/asset.json` + files).
- Strict lock acquisition order (`hostAssets: true, projectId`) on library apply/save-to-library.

- [ ] **Step 4: Run Task 7 tests + typecheck**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/assets/video-studio-asset-registry.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```
Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```powershell
git add src/main/video-studio/assets/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): add Master Asset Registry, invariant checker, and immutable Host Asset Library" }
```

---

## Task 8: Typed Runtime RPC, File Watcher Conflict Stream & General Chat Research Handoff

**Dependencies:** Tasks 2, 4, 5, 6, 7 (all backend services ready).

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
1. `VideoStudioJobManager` integrates `VideoStudioPreviewManager`, computes `inputFingerprint` on `checkProject`, refuses unattended execution on unapproved `untrusted` projects unless approved (`approveProjectExecution` for current `inputFingerprint`), attaches stale check awareness before final delivery render, and clears active preview/watcher handles on `dispose()`.
2. `video-studio-file-watcher.ts` watches active project directories, suppresses self-inflicted transaction writes (tracked write-generation / TX window), and pushes debounced `projectFilesChanged` events over `videoStudio.subscribeJobs`.
3. `video-studio-methods.ts` exposes EVERY RPC defined in Task 3 (including `updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `saveProjectAssetToLibrary`, `approveProjectExecution`), requires workspace permission, checks containment/revisions, strips host absolute paths from error/result messages where applicable, and propagates passthrough error codes cleanly.
4. `runtime-rpc-mobile-video-studio-methods.ts` registers read-only Studio inspection methods (`listStyleProfiles`, `getProjectStyleState`, `getProjectDocuments`, `listLibraryAssets`, `listProjectAssets`, `listMotionPresets`) and refuses SSH targets identically to existing methods.
5. `general-chat-video-handoff.ts` scaffolds a modular v2 project (`scaffoldHyperFramesComposition`), optionally applies selected `styleProfileId`, seeds `BRIEF.md`, `references/sources.json`, `research-notes.md`, and an initial `STORYBOARD.md` draft from research sources/syntheses without losing source provenance.

**Rollback Considerations:** RPC additions do not change signatures of existing `createProject` / `listProjects` / `renderVideo` calls; mobile read-only additions follow existing `MOBILE_VIDEO_STUDIO_ALLOWED_METHODS` pattern.

- [ ] **Step 1: Add failing RPC, trust gate, and General Chat handoff tests**

Extend `src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts`:
```ts
it('enforces expectedRevision conflicts, completes Studio document/asset RPCs, and blocks unapproved execution', async () => {
  const { dispatcher, profileDir } = await host()
  const created = expectOkResult(
    await dispatcher.dispatch('videoStudio.createProject', {
      title: 'AC Explainers',
      prompt: 'Explain cooling cycle',
      aspectRatio: '9:16',
      durationSeconds: 30
    }),
    z.object({ project: z.object({ id: z.string() }) })
  )
  const projectId = created.project.id

  const docs = expectOkResult(
    await dispatcher.dispatch('videoStudio.getProjectDocuments', { projectId }),
    z.object({ revisions: z.record(z.string(), z.string()), scriptMarkdown: z.string() })
  )

  const scriptUpdated = expectOkResult(
    await dispatcher.dispatch('videoStudio.updateProjectScript', {
      projectId,
      scriptMarkdown: '# Voiceover\nAir flows across the evaporator.',
      expectedRevision: docs.revisions['SCRIPT.md']
    }),
    z.object({ revisions: z.record(z.string(), z.string()) })
  )
  expect(scriptUpdated.revisions['SCRIPT.md']).not.toBe(docs.revisions['SCRIPT.md'])

  // Stale expectedRevision rejected cleanly
  await expect(
    dispatcher.dispatch('videoStudio.updateProjectScript', {
      projectId,
      scriptMarkdown: '# Stale',
      expectedRevision: docs.revisions['SCRIPT.md']
    })
  ).resolves.toMatchObject({ ok: false, error: { code: 'video_studio_file_conflict' } })

  // Manual research source upsert & delete
  await expect(
    dispatcher.dispatch('videoStudio.upsertResearchSource', {
      projectId,
      source: {
        id: 'src-manual-1',
        url: 'https://example.org/ac',
        title: 'Evaporator Spec',
        domain: 'example.org',
        snippet: 'Latent heat absorption',
        origin: 'manual'
      }
    })
  ).resolves.toMatchObject({ ok: true })

  // Untrusted modified composition blocks render without approval
  const projectDir = resolveVideoStudioProjectDir(profileDir, projectId)
  await writeFile(join(projectDir, 'index.html'), '<div>ai modified</div>', 'utf8')
  await expect(
    dispatcher.dispatch('videoStudio.renderVideo', { projectId, quality: 'looks' })
  ).resolves.toMatchObject({ ok: false, error: { code: 'video_studio_execution_approval_required' } })
})
```

Create `src/main/general-chat/research/general-chat-video-handoff.test.ts`:
```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveVideoStudioProjectDir } from '../../video-studio/video-studio-composition-paths'
import { handoffGeneralChatToVideoStudio } from './general-chat-video-handoff'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('handoffGeneralChatToVideoStudio v2', () => {
  it('seeds BRIEF.md, STORYBOARD.md, references/sources.json, and style profile snapshot', async () => {
    const profileDir = await mkdtemp(join(tmpdir(), 'orca-handoff-'))
    dirs.push(profileDir)
    const result = await handoffGeneralChatToVideoStudio(profileDir, {
      title: 'Inflation Explainer',
      prompt: 'Explain CPI cleanly',
      aspectRatio: '9:16',
      durationSeconds: 30,
      styleProfileId: 'technical-explainer-01',
      sources: [
        {
          id: 's1',
          sessionId: 'gc-1',
          query: 'inflation',
          url: 'https://example.com/cpi',
          title: 'CPI Basket Guide',
          domain: 'example.com',
          snippet: 'Consumer basket weighting.',
          provider: 'duckduckgo',
          origin: 'deep-research',
          fetchedAt: 1000
        }
      ],
      notesMarkdown: '# Key Insights\n- Basket tracks monthly price changes.'
    })

    const projectDir = resolveVideoStudioProjectDir(profileDir, result.project.id)
    expect(await readFile(join(projectDir, 'BRIEF.md'), 'utf8')).toContain('Inflation Explainer')
    expect(await readFile(join(projectDir, 'references', 'sources.json'), 'utf8')).toContain('CPI Basket Guide')
    expect(await readFile(join(projectDir, 'STORYBOARD.md'), 'utf8')).toContain('scene_id:')
    expect(await readFile(join(projectDir, 'styles', 'style-profile.json'), 'utf8')).toContain(
      'technical-explainer-01'
    )
  })
})
```

- [ ] **Step 2: Run the failing Task 8 tests**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts src/main/general-chat/research/general-chat-video-handoff.test.ts --maxWorkers=2
```
Expected: FAIL (unregistered RPC handlers and missing v2 handoff seeding).

- [ ] **Step 3: Implement Watcher, JobManager updates, all RPC handlers, Mobile read-only allowlist, and Research Handoff**

Update `video-studio-job-runner.ts`, `video-studio-job-manager.ts`, `video-studio-file-watcher.ts`, `video-studio-methods.ts`, `runtime-rpc-mobile-video-studio-methods.ts`, and `general-chat-video-handoff.ts`.

- [ ] **Step 4: Run Task 8 tests + RPC catalog check + typecheck**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/main/video-studio/video-studio-job-manager.test.ts src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts src/main/general-chat/research/general-chat-video-handoff.test.ts --maxWorkers=2; if ($LASTEXITCODE -eq 0) { pnpm run verify:rpc-params-catalog }; if ($LASTEXITCODE -eq 0) { pnpm tc:node }
```
Expected: PASS and exit 0.

- [ ] **Step 5: Commit Task 8**

```powershell
git add src/main/video-studio/video-studio-job-manager.ts src/main/video-studio/video-studio-job-runner.ts src/main/video-studio/video-studio-file-watcher.ts src/main/runtime/rpc/methods/video-studio/ src/main/runtime/rpc/server/runtime-rpc-mobile-video-studio-methods.ts src/main/general-chat/research/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): wire Studio RPC handlers, file watcher conflicts, and v2 research handoff" }
```

---

## Task 9: Native Structured Inspector UI (4-Step Studio, Conflict Alerts, Localization & Component Fixtures)

**Dependencies:** Task 8 (Typed RPC client contracts & backend methods).

**Files:**
- Modify: `src/renderer/src/runtime/video-studio/video-studio-client.ts`
- Modify: `src/renderer/src/components/video-studio/VideoStudioWorkflow.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioPage.tsx`
- Modify: `src/renderer/src/components/video-studio/use-video-studio-controller.ts`
- Create: `src/renderer/src/components/video-studio/VideoStudioResearchPanel.tsx`
- Create: `src/renderer/src/components/video-studio/VideoStudioStoryboardPanel.tsx`
- Create: `src/renderer/src/components/video-studio/VideoStudioAssetRegistryPanel.tsx`
- Create: `src/renderer/src/components/video-studio/VideoStudioStyleMotionPanel.tsx`
- Modify: `src/renderer/src/components/video-studio/VideoStudioProductionPanel.tsx`
- Modify: `src/renderer/src/components/video-studio/use-video-studio-production.ts`
- Modify: `src/renderer/src/components/video-studio/video-studio-production-actions.ts`
- Modify: `src/renderer/src/components/video-studio/VideoStudioPage.fixture.tsx`
- Modify: Localization catalog files updated by `pnpm run sync:localization-catalog` & `pnpm run sync:mobile-localization`

**Strict UI & Compiler Rules:**
- Follow `docs/STYLEGUIDE.md`, tokens from `src/renderer/src/assets/main.css`, and primitives from `src/renderer/src/components/ui/` (no invented hex palette tokens in UI chrome — semantic UI styles only, while Style Profile preview swatches render user/preset video palette hexes cleanly).
- Wrap all user-facing strings with `useTranslate` from `@/i18n/use-translate` and sync localization catalogs.
- **No `try/finally` inside any React hook or component** (`pnpm check:react-compiler-compat-ratchet` enforces React Compiler rules).
- Keep HTML/JS composition content strictly isolated (no `dangerouslySetInnerHTML`, no `file://` embed).

**Acceptance Criteria:**
1. All 4 Studio steps work natively and bind to real RPCs:
   - Step 1 (`research`): `BRIEF.md` structured editor, verified/manual research source CRUD + provenance list.
   - Step 2 (`script`): Sub-tabs switching **Storyboard & Script** (`STORYBOARD.md` reorder/edit preserving `scene_id` + `SCRIPT.md` editor + `CompositionDriftReport` status pill) and **Master Assets** (project/library assets, custom state manager, structured components tree, dependency warnings, Save-to-Library action, force-delete confirmation dialog on `video_studio_asset_in_use`).
   - Step 3 (`style`): Style Preset/Host Library selector, token/font/safe-area inspector, `Save to Host Library`, **Style Sync Conflict banner** with *Import from Markdown* vs *Reapply JSON* actions, and `Motion Preset` library inspector.
   - Step 4 (`production`): Non-destructive `Scaffold / Re-scaffold`, confirmation-gated `Reset entry HTML`, `Open in Coding Workspace`, **5-state `ValidationReport` badge** + `stale` invalidation notice + `productionGate` notice, **Execution Trust approval prompt** when `video_studio_execution_approval_required`, Preview Session controls, and chunked `<video controls>` playback + *Save MP4*.
2. External coding agent edit banner (`projectFilesChanged` or `video_studio_file_conflict`) offers non-destructive *Reload from disk* without silently wiping external files.
3. `VideoStudioPage.fixture.tsx` uses updated `version: '0.9.94'` and covers states `research`, `scriptStoryboard`, `scriptAssets`, `styleConflict`, `validationPartial`, and `production`, passing `pnpm fixtures:shot` visually in both desktop & narrow, light & dark viewports.

**Rollback Considerations:** Inspector panels plug cleanly into `VideoStudioPage.tsx` by workflow step; reverting UI commit keeps backend contracts untouched.

- [ ] **Step 1: Extend `video-studio-client.ts` with typed RPC wrappers for all new methods and `projectFilesChanged` events**

Update `src/renderer/src/runtime/video-studio/video-studio-client.ts` exposing clean typed methods matching `video-studio-rpc-contract.ts`.

- [ ] **Step 2: Build the Structured Inspector panels (`VideoStudioResearchPanel.tsx`, `VideoStudioStoryboardPanel.tsx`, `VideoStudioAssetRegistryPanel.tsx`, `VideoStudioStyleMotionPanel.tsx`) and update `VideoStudioWorkflow.tsx`, `VideoStudioPage.tsx`, `VideoStudioProductionPanel.tsx`, and hooks**

Verify ZERO `try/finally` inside hooks (`use-video-studio-controller.ts`, `use-video-studio-production.ts`, and any new custom hook — handle loading states cleanly via `.finally()` or local non-try-finally async state transitions), and follow `docs/STYLEGUIDE.md`.

- [ ] **Step 3: Update `VideoStudioPage.fixture.tsx` with all 6 Studio states and sync localization catalogs**

Update `VideoStudioPage.fixture.tsx` (`version: '0.9.94'`, plus `research`, `scriptStoryboard`, `scriptAssets`, `styleConflict`, `validationPartial`, `production`).

- [ ] **Step 4: Run web typecheck, React compiler ratchet, mobile build, localization sync/verify, and component fixture screenshots**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm run sync:localization-catalog; if ($LASTEXITCODE -eq 0) { pnpm run sync:mobile-localization }; if ($LASTEXITCODE -eq 0) { pnpm tc:web }; if ($LASTEXITCODE -eq 0) { pnpm check:react-compiler-compat-ratchet }; if ($LASTEXITCODE -eq 0) { pnpm run build:mobile-web }; if ($LASTEXITCODE -eq 0) { pnpm fixtures:shot VideoStudioPage }
```
Expected: All commands exit 0; fixture screenshots inspected visually (`read_file` on captured PNGs) showing crisp light/dark desktop & narrow layout with zero clipping or contrast bugs.

- [ ] **Step 5: Commit Task 9**

```powershell
git add src/renderer/src/runtime/video-studio/ src/renderer/src/components/video-studio/ locales/ mobile/; if ($LASTEXITCODE -eq 0) { git commit -m "feat(video-studio): build native Structured Inspector UI, fixtures, and localization catalogs" }
```

---

## Task 10: General-Purpose Consistency & Actual Render Fixtures (`1080×1920`, `30 FPS`), Visual Regression & Final Gates

**Dependencies:** Tasks 1–9 (full system complete).

**Files:**
- Create: `src/main/video-studio/__fixtures__/consistency/fixture-a-ac-explainer/` (`index.html`, `hyperframes.json`, `compositions/scene-01-closed.html`, `compositions/scene-02-cutaway.html`, `assets/objects/ac_indoor_001/closed.svg`, `cutaway.svg`, `operating.svg`, `STORYBOARD.md`, `BRIEF.md`)
- Create: `src/main/video-studio/__fixtures__/consistency/fixture-b-inflation-explainer/` (`index.html`, `hyperframes.json`, `compositions/scene-01-cpi.html`, `assets/graphics/inflation_chart/chart.svg`, `STORYBOARD.md`, `BRIEF.md`)
- Create: `src/main/video-studio/__fixtures__/consistency/fixture-c-product-showcase/` (`index.html`, `hyperframes.json`, `compositions/scene-01-hero.html`, `assets/objects/studio_mic/hero.svg`, `STORYBOARD.md`, `BRIEF.md`)
- Create: `src/main/video-studio/__fixtures__/consistency/golden-frames/` (deterministic PNG golden frames for Fixtures A, B, C)
- Create: `src/main/video-studio/video-studio-consistency-fixtures.test.ts`
- Create: `src/main/video-studio/video-studio-render-smoke.test.ts`

**Acceptance Criteria:**
1. **3 Deterministic General-Purpose Fixtures (`1080×1920`, `30 FPS`, short 2–3s seek-safe compositions, no AI generation required):**
   - **Fixture A (AC Mechanism — `technical-explainer-01`):** Modular sub-compositions, `ac_indoor_001` multi-state SVG (`closed` -> `cutaway` -> `operating`) with animatable `#fan` component rotated seek-safely via timestamp/progress, unchanged asset ID across states.
   - **Fixture B (Inflation Explainer — same `technical-explainer-01`):** Completely different topic & graphic asset reusing the exact `technical-explainer-01` snapshot; verified isolated when Host Library style updates to `v2`.
   - **Fixture C (Product Showcase — `clean-editorial-01`):** Different style preset, clean typography/palette contrast passing contrast & layout checks.
2. **Dependency Portability:** Copying any fixture project into an isolated temp folder outside `<profileDir>` preserves valid asset paths, hashes, and composition references (`assertContainedPath` + dependency check pass 100%).
3. **Actual End-to-End HyperFrames Render Smoke Test (`video-studio-render-smoke.test.ts`):**
   - When `hyperframes 0.9.94`, `ffmpeg`, `ffprobe`, and Chrome are available (CI / configured dev box):
     - Runs real `hyperframes check --json` verifying zero error findings.
     - Runs real `hyperframes render` producing `1080×1920`, `30 FPS` MP4 for Fixtures A, B, and C.
     - Verifies MP4 dimensions (`1080x1920`), exact `30/1` frame rate, expected frame count/duration via `ffprobe`.
     - Extracts frames at `t = 0s`, midpoint, and end frame (verifying seek-safe progression where Fixture A midpoint `#fan` rotation differs from `t = 0s`) and compares extracted PNGs against `golden-frames/` within tolerance (recording/reporting clear diagnostic if prerequisites `ffmpeg`/`ffprobe`/`chrome` are missing locally while failing if broken when installed).
4. **Final Repository Quality Gate:** `pnpm check:changed --base=main` passes cleanly with zero errors.

**Rollback Considerations:** Fixtures live cleanly inside `__fixtures__/consistency/`; golden PNGs can be regenerated cleanly via an explicit environment flag (`UPDATE_VIDEO_STUDIO_GOLDENS=1`) rather than auto-updating during normal test runs.

- [ ] **Step 1: Author the 3 deterministic HTML/SVG fixture compositions (`1080×1920`, `30 FPS`, seek-safe CSS/GSAP via `window.__timelines`)**

Ensure every fixture has `<div data-composition-id="main" data-width="1080" data-height="1920" data-fps="30" data-duration="2">` and drives animations deterministically from timeline seek progress (e.g., `ac_indoor_001` `#fan` rotation `0deg -> 720deg` across `t=0..2s`, inflation bar scale `0.2 -> 1.0`, showcase hero card opacity/translate), with `hyperframes.json` (`paths.blocks: "compositions"`), `BRIEF.md`, `STORYBOARD.md`, and `assets/asset-registry.json`.

- [ ] **Step 2: Write `video-studio-consistency-fixtures.test.ts` and `video-studio-render-smoke.test.ts`**

Create `src/main/video-studio/video-studio-consistency-fixtures.test.ts`:
```ts
import { cp, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { VideoStudioAssetStore } from './assets/video-studio-asset-store'
import { computeCompositionDrift } from './documents/video-studio-composition-drift'
import { VideoStudioStyleStore } from './style/video-studio-style-store'
import { VideoStudioLockCoordinator, VideoStudioTransactionCoordinator } from './video-studio-transactions'

const fixturesRoot = join(import.meta.dirname, '__fixtures__', 'consistency')
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('General-purpose consistency fixtures A, B, C', () => {
  it('isolates Fixture A and B style snapshots, keeps portable relocations valid, and applies clean-editorial-01 in Fixture C', async () => {
    const profileDir = await mkdtemp(join(tmpdir(), 'orca-fix-prof-'))
    const relocatedDir = await mkdtemp(join(tmpdir(), 'orca-fix-reloc-'))
    dirs.push(profileDir, relocatedDir)

    const projA = join(profileDir, 'video-studio', 'projects', 'fixture-a')
    const projB = join(profileDir, 'video-studio', 'projects', 'fixture-b')
    const projC = join(profileDir, 'video-studio', 'projects', 'fixture-c')
    await cp(join(fixturesRoot, 'fixture-a-ac-explainer'), projA, { recursive: true })
    await cp(join(fixturesRoot, 'fixture-b-inflation-explainer'), projB, { recursive: true })
    await cp(join(fixturesRoot, 'fixture-c-product-showcase'), projC, { recursive: true })

    const locks = new VideoStudioLockCoordinator()
    const tx = new VideoStudioTransactionCoordinator(locks)
    const styles = new VideoStudioStyleStore(profileDir, locks, tx)
    const assets = new VideoStudioAssetStore(profileDir, locks, tx)

    await styles.applyStyleToProject('fixture-a', projA, 'technical-explainer-01')
    await styles.applyStyleToProject('fixture-b', projB, 'technical-explainer-01')
    await styles.applyStyleToProject('fixture-c', projC, 'clean-editorial-01')

    expect((await computeCompositionDrift(projA)).hasDrift).toBe(false)
    expect((await computeCompositionDrift(projB)).hasDrift).toBe(false)
    expect((await computeCompositionDrift(projC)).hasDrift).toBe(false)

    // Mutate Fixture A primary palette locally -> Fixture B remains untouched
    const snapA = await styles.getProjectStyleState('fixture-a', projA)
    await styles.updateProjectStyle('fixture-a', projA, {
      palette: { ...snapA.profile.palette, primary: '#22C55E' },
      expectedRevision: snapA.revisions['styles/style-profile.json']
    })
    const snapB = await styles.getProjectStyleState('fixture-b', projB)
    expect(snapB.profile.palette.primary).not.toBe('#22C55E')

    // Portable relocation of Fixture A keeps all registered asset SHA-256 checks healthy
    await cp(projA, relocatedDir, { recursive: true })
    const relocatedAssets = await assets.listProjectAssets(relocatedDir)
    expect(relocatedAssets.warnings).toEqual([])
    expect(await readFile(join(relocatedDir, 'assets', 'objects', 'ac_indoor_001', 'operating.svg'), 'utf8')).toContain(
      'id="fan"'
    )
  })
})
```

Create `src/main/video-studio/video-studio-render-smoke.test.ts` executing real `probeEnvironment()` -> `checkProject()` -> `renderProject()` (`1080×1920`, `30 FPS`, MP4 verification via `ffprobe` streams + frame extraction at `0s` & `1s` + golden PNG byte/perceptual diff when `ffmpeg`/`ffprobe`/Chrome exist, failing strictly if `ORCA_REQUIRE_RENDER_SMOKE=1` and reporting `[SKIP missing prerequisite]` transparently on dev workstations lacking `ffmpeg`).

- [ ] **Step 3: Capture golden PNG frames cleanly (on machine with Chrome + FFmpeg) and run all Video Studio suites**

```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm exec vitest run --config config/vitest.config.ts src/shared/video-studio/ src/main/video-studio/ src/main/runtime/rpc/methods/video-studio/video-studio-methods.test.ts src/main/general-chat/research/general-chat-video-handoff.test.ts --maxWorkers=2
```
Expected: All Vitest suites pass with zero failures.

- [ ] **Step 4: Run `pnpm check:changed --base=main` final quality gate**

Run in foreground once edits are complete:
```powershell
Set-Location "C:\Coding\Project\orca\.worktrees\orca-ai-studio"
pnpm check:changed --base=main
```
Expected: Format, lint, typecheck, affected unit tests, RPC params catalog, localization checks, React Compiler ratchet, and mobile web bundle checks all exit `0`.

- [ ] **Step 5: Commit Task 10**

```powershell
git add "src/main/video-studio/__fixtures__/consistency/" src/main/video-studio/video-studio-consistency-fixtures.test.ts src/main/video-studio/video-studio-render-smoke.test.ts; if ($LASTEXITCODE -eq 0) { git commit -m "test(video-studio): add 3 general-purpose consistency fixtures, render smoke suite, and golden frames" }
```

---

## Plan Self-Review Checklist
- Exact HyperFrames `0.9.94` pinning (no major/minor relaxation, deterministic runtime resolution, non-`0.9.94` flagged `unverified`): Covered in Task 2.
- Validation 5-state precedence (`unsupported > error > failed > partial > passed`), strict `partial`, separate `productionGate`, and `inputFingerprint` freshness: Covered in Tasks 2 & 3.
- Minimal project trust & execution approval policy (`approveProjectExecution`), env allowlist, and explicit no-unattended-untrusted execution: Covered in Tasks 2, 3, 4, 8.
- Asset & Style logical ID vs `schemaVersion` vs immutable published `version` vs local `snapshotRevision`, `DESIGN.md` in Host Style Library, plus `defaultState` / unique components / acyclic `parentComponentId` / SHA-256 checks: Covered in Tasks 3, 6, 7.
- Complete RPC coverage (`updateProjectScript`, `upsertResearchSource`, `deleteResearchSource`, `saveProjectAssetToLibrary`, `approveProjectExecution`, state management via `updateAssetMetadata`): Covered in Tasks 3 & 8.
- Pre-committing backup & staged SHA-256 verification + Canonical Lock Order (`HostStyleLibraryLock -> HostAssetLibraryLock -> ProjectMutationQueue`): Covered in Task 4.
- Actual `1080×1920` `30 FPS` render smoke tests + golden frames for Fixtures A, B, C: Covered in Task 10.
- Cross-platform Windows paths, `AGENTS.md` naming conventions, React Compiler ratchet, Zod `import * as z`, mobile read-only allowlist & bundle verification: Covered across Tasks 2–10.
