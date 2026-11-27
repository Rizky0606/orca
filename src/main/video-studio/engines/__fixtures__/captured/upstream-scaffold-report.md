# Upstream HyperFrames `0.9.94` Scaffold & CLI Verification Report

Captured on Windows (`win32 x64`, Node `v24.18.0`) against installed `hyperframes@0.9.94` (`$HOME\AppData\Roaming\npm\node_modules\hyperframes\bin\hyperframes.mjs`).

## 1. CLI Version & `doctor --json`

- `hyperframes --version` (exit `0`): `0.9.94`
- `hyperframes doctor --json` (exit `0` even when `ok: false` due to missing FFmpeg/FFprobe and newer `0.9.96` available):
  - Top-level keys: `{ ok: boolean, platform: string, arch: string, checks: Array<{ name, ok, detail, hint? }>, _meta: { version, latestVersion, updateAvailable, checkedAt, skillsOutdated, skillsMissing } }`
  - Confirmed case-matching check `name` values: `"Version"`, `"CLI binary"`, `"Node.js"`, `"FFmpeg"`, `"FFprobe"`, `"Chrome"`, `"Docker"`, `"Docker running"`.
  - Confirms Approved Spec `doctor --json` parser expectations (`checks[]` + `_meta.version`).

## 2. `hyperframes init` Scaffold Files (Verbatim Comparison vs Approved Spec)

### CLI Flags

- `hyperframes init <dir> --non-interactive --format json` **failed (exit `2`)**: `Unknown flag: --format`.
- Actual non-interactive flags in `0.9.94`: `--non-interactive --skip-skills` (optional `--example <name>`, `--resolution <preset>`, `--tailwind`, `--skill <slug>`).

### Default Blank Scaffold Tree

```text
AGENTS.md
CLAUDE.md
hyperframes.json
index.html
meta.json
package.json
```

- Note: Blank `hyperframes init` does **not** pre-create `compositions/` or `assets/`; sub-compositions under `compositions/` and `assets/` are created when scenes/examples are added (verified with `hyperframes init --example swiss-grid --non-interactive --skip-skills`, which creates `compositions/intro.html`, `compositions/graphics.html`, `compositions/captions.html`, `assets/swiss-grid.svg`, `hyperframes.lock.json`).

### `meta.json` (CONFIRMED)

Verbatim from `hyperframes init`:

```json
{
  "id": "hf-cap-165139268",
  "name": "hf-cap-165139268",
  "createdAt": "2026-11-25T23:35:08.080Z"
}
```

Matches Approved Spec `{ id, name, createdAt }`.

### `hyperframes.json` (CONFIRMED)

Verbatim from `hyperframes init`:

```json
{
  "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
  "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  "paths": {
    "blocks": "compositions",
    "components": "compositions/components",
    "assets": "assets"
  },
  "media": {
    "autoProxy": true
  }
}
```

Matches Approved Spec verbatim (`$schema`, `registry`, `paths.blocks = "compositions"`, `paths.components = "compositions/components"`, `paths.assets = "assets"`, `media.autoProxy = true`).

### `package.json` (DIFFERENCE NOTED)

Verbatim from `hyperframes init`:

```json
{
  "name": "hf-cap-165139268",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx --yes hyperframes@0.9.94 preview",
    "check": "npx --yes hyperframes@0.9.94 check",
    "render": "npx --yes hyperframes@0.9.94 render",
    "publish": "npx --yes hyperframes@0.9.94 publish"
  }
}
```

**Difference vs Approved Spec:** Upstream `0.9.94` does **not** emit an `"engines": { "hyperframes": "0.9.94" }` field; instead it pins `hyperframes@0.9.94` in `scripts` (`dev`, `check`, `render`, `publish`). Orca's scaffold may include both the pinned scripts and `"engines": { "hyperframes": "0.9.94" }` metadata, while still enforcing runtime binary resolution/pinning in `HyperFramesEngineAdapter` rather than trusting `package.json`.

### Root `index.html`, `<template>`, `data-composition-src`, and `window.__timelines`

1. **Blank `index.html`:**
   - Loads GSAP CDN (`https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js`).
   - Root element: `<div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1920" data-height="1080">`.
   - **Difference:** Upstream blank `index.html` omits `data-fps` on the root element (`hyperframes render` defaults `--fps` to `data-fps` if present, else `30`). Orca scaffolds should keep `data-fps` when non-30fps or explicit FPS is configured.
   - Timeline registration: `window.__timelines["main"] = tl;` (note: `AGENTS.md` Rule 3 recommends `window.__timelines = window.__timelines || {};` before assignment so the file is safe if opened standalone outside the preview/render harness).
2. **Modular `compositions/*.html` & `data-composition-src` (verified via `--example swiss-grid` — CONFIRMED):**
   - Root `index.html` mounts sub-compositions via:
     ```html
     <div
       id="intro-comp"
       class="overlay-layer"
       data-composition-id="intro"
       data-composition-src="compositions/intro.html"
       data-start="0"
       data-duration="1.86"
       data-track-index="2"
     ></div>
     ```
     and caption tracks use `data-track-kind="captions"`.
   - Each `compositions/*.html` wraps its scene in `<template id="...-template"><div data-composition-id="..." data-width="1920" data-height="1080" data-duration="...">...</div></template>` with scoped `<style>` and `<script>` registering on `window.__timelines`.

## 3. `check --json` vs `--no-browser` & `lint --json` (CRITICAL DIFFERENCE)

- `hyperframes check --json --no-browser` **failed with exit `2`** (`captured/init-check-no-browser.json`):
  ```json
  {
    "ok": false,
    "error": {
      "code": "unknown_flag",
      "message": "Unknown flag: --browser",
      "hint": "Did you mean --browser-gpu? ..."
    }
  }
  ```
  `hyperframes check` in `0.9.94` does **not** accept `--no-browser`. Browser-free static linting is exposed via `hyperframes lint --json` (exits `0`, returns `{ ok, errorCount, warningCount, infoCount, findings, filesScanned, unmountedCompositions, _meta }`), while `hyperframes check --json` always attempts browser verification and reports `browserSkipped: boolean` if browser checks are bypassed/unavailable.
- `hyperframes check --json` (with Chrome available, `captured/init-check-browser.json`, exit `0`):
  - Top-level keys: `ok`, `strict`, `browserSkipped`, `lint`, `runtime`, `layout`, `motion`, `contrast`, `craft`, `audio`, `hdr`, `snapshots`, `saved`, `_meta`.
  - Section shape for `lint`, `runtime`, `layout`, `motion`, `contrast`, `craft`, `audio`: `{ ok, errorCount, warningCount, infoCount, findings: [...] }`.
  - Finding shape includes `code`, `severity` (`error` | `warning` | `info`), `time`, `selector`, `sourceFile`, `bbox`, `rect`, `message`, `fixHint`.
  - `hdr` section shape is `{ autoPromotion: null, inspection: "available" }` (an object WITHOUT `findings[]` / `errorCount`!). Parsers iterating unknown/optional top-level sections MUST guard for section objects that lack `findings`/`errors`/`warnings` (like `hdr` and `snapshots` and `saved` and `_meta`).

## 4. `preview --foreground --json --no-open` (CONFIRMED)

Verbatim stdout first JSON line (`captured/preview-start-actual.json`):

```json
{
  "schemaVersion": 1,
  "operation": "start",
  "ok": true,
  "result": {
    "state": "started",
    "mode": "foreground",
    "projectName": "hf-cap-165139268",
    "projectDir": "C:\\Users\\RIZKYF~1\\AppData\\Local\\Temp\\hf-cap-165139268",
    "host": "127.0.0.1",
    "port": 3002,
    "pid": 11008,
    "serverUrl": "http://127.0.0.1:3002",
    "studioUrl": "http://127.0.0.1:3002/#project/hf-cap-165139268",
    "ready": true
  }
}
```

- Matches Approved Spec `LifecyclePayloadSchema` exactly.
- Note on stopping: `hyperframes preview <dir> --stop` only stops `--background` sessions (`No background preview is running for ...` when started with `--foreground`), so foreground preview processes must be stopped via verified PID/process-tree termination (`VideoStudioPreviewManager`).

## 5. `render` Probe (`captured/render-actual-probe.txt`)

- `hyperframes render "<tmp>" -o "<tmp>\out.mp4" --quiet` exited `1` on this host because `FFmpeg` and `FFprobe` are not installed on `PATH`:
  - `✗  FFmpeg not found`
  - `✗  FFprobe not found`
