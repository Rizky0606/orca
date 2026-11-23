# General Chat Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-independent General Chat destination that reuses Orca native structured-agent chat through a hidden per-host folder workspace.

**Architecture:** A host-side ensure operation mirrors the existing hidden Bots-home pattern and returns a stable folder-workspace identity. The renderer adds a top-level General Chat page, reads the host's native session catalog, and launches ordinary structured sessions against that hidden workspace, so transcripts, attachments, models, recovery, and remote transport remain native Orca behavior.

**Tech Stack:** TypeScript, React 19, Zustand, Orca runtime RPC, native chat, Vitest, fixture screenshots, Electron CDP.

**Spec:** `docs/superpowers/specs/2026-11-23-general-chat-video-studio-design.md`

## Global Constraints

- Preserve support for Windows, macOS, Linux, SSH, paired runtimes, mobile, and non-Git folder workspaces.
- Resolve filesystem paths on the owning host; renderer code must not build paths.
- General Chat must never silently switch hosts or appear in user project/workspace lists.
- Reuse native chat and structured-session persistence; do not create a second message store.
- Follow `docs/STYLEGUIDE.md` and `docs/styleguide/native-chat.md`.
- Do not add unit tests for UI wiring; prove UI with fixtures and hidden Electron CDP.
- Run `pnpm check:changed` once after all implementation edits.

---

### Task 1: Add General Chat to top-level navigation

**Files:**
- Modify: `src/shared/ui-chrome/ui-chrome-types.ts`
- Modify: `src/renderer/src/store/slices/ui/ui-slice-contract-core.ts`
- Modify: `src/renderer/src/store/slices/ui/ui-slice-view-actions.ts`
- Modify: `src/renderer/src/store/slices/ui/ui-slice-hydration-actions.ts`
- Modify: `src/renderer/src/components/app-rail/app-rail-destinations.ts`
- Modify: `src/renderer/src/components/app-rail/AppRail.tsx`
- Modify: `src/renderer/src/app-shell/AppWorkspaceShell.tsx`
- Modify: `src/renderer/src/app-shell/chrome/use-app-chrome-layout.ts`

**Interfaces:**
- Produces: `TopLevelView` member `'general-chat'`.
- Produces: `openGeneralChatPage(): void` and `closeGeneralChatPage(): void` on `UISliceCore`.
- Produces: App Rail destination `general-chat` with `MessageSquare` icon.

- [ ] **Step 1: Extend the shared and renderer view contracts**

Add `'general-chat'` to `TopLevelView` and `UiViewHistory`, add `previousViewBeforeGeneralChat`, and expose open/close actions. Follow the existing Artifacts implementation exactly for history recording and close behavior:

```ts
openGeneralChatPage: () => {
  get().recordViewVisit('general-chat')
  set((state) => ({
    activeView: 'general-chat',
    previousViewBeforeGeneralChat:
      state.activeView === 'general-chat' ? state.previousViewBeforeGeneralChat : state.activeView
  }))
}
```

- [ ] **Step 2: Wire navigation and page mounting**

Add `general-chat` to `APP_RAIL_DESTINATION_IDS`, visibility/open maps, labels, icons, and `ActivePage`. Initially mount a dedicated `GeneralChatPage` module created in Task 4; use a lazy import so native-chat code does not increase initial page cost.

- [ ] **Step 3: Update hydration and layout exhaustiveness**

Update every exhaustive `TopLevelView` switch found with:

```powershell
rg -n "TopLevelView|activeView ===|switch \(.*activeView" src/renderer/src src/shared
```

General Chat hides workspace-only right-sidebar controls and uses normal top-level titlebar/sidebar behavior.

- [ ] **Step 4: Run focused static checks**

Run:

```powershell
pnpm tc:web
pnpm exec oxlint src/shared/ui-chrome/ui-chrome-types.ts src/renderer/src/store/slices/ui src/renderer/src/components/app-rail src/renderer/src/app-shell
pnpm exec oxfmt --write src/shared/ui-chrome/ui-chrome-types.ts src/renderer/src/store/slices/ui src/renderer/src/components/app-rail src/renderer/src/app-shell
```

- [ ] **Step 5: Commit navigation**

```powershell
git add src/shared/ui-chrome src/renderer/src/store/slices/ui src/renderer/src/components/app-rail src/renderer/src/app-shell
git commit -m "feat(chat): add general chat navigation"
```

---

### Task 2: Implement the hidden application workspace

**Files:**
- Create: `src/main/general-chat/general-chat-home.ts`
- Create: `src/main/general-chat/general-chat-home-workspace.ts`
- Create: `src/main/general-chat/general-chat-home.test.ts`
- Modify: `src/main/runtime/workspaces/catalog/runtime-visible-catalog.ts`
- Modify: `src/main/runtime/construction/runtime-store-contract.ts`

**Interfaces:**
- Produces: `generalChatRootFolder(paths?: GeneralChatRootPaths): string`.
- Produces: `isGeneralChatProjectGroup(group, root?): boolean`.
- Produces: `ensureGeneralChatHome(deps, store): Promise<{ folderWorkspaceId: string; worktreeId: string }>`.

- [ ] **Step 1: Write the failing root and identity invariant tests**

The test must prove standard profiles resolve under `~/.orca/general-chat`, isolated profiles remain under their isolated `userData`, only the local matching group is hidden, and repeated concurrent ensures return one folder workspace:

```ts
it('shares one hidden application workspace across concurrent ensures', async () => {
  const [left, right] = await Promise.all([
    ensureGeneralChatHome(deps, store),
    ensureGeneralChatHome(deps, store)
  ])
  expect(left).toEqual(right)
  expect(store.getFolderWorkspaces()).toHaveLength(1)
})
```

- [ ] **Step 2: Run the test and confirm the intended failure**

Run:

```powershell
pnpm test src/main/general-chat/general-chat-home.test.ts --maxWorkers=2
```

Expected: FAIL because `general-chat-home` and `ensureGeneralChatHome` do not exist.

- [ ] **Step 3: Implement host-owned path resolution**

Mirror `src/main/bots/bot-home.ts` path policy, changing only the owned leaf:

```ts
export function generalChatRootFolder(paths: GeneralChatRootPaths = currentPaths()): string {
  return isStandardProfile(paths)
    ? join(paths.home, '.orca', 'general-chat')
    : join(paths.userData, 'general-chat')
}
```

Keep normalization and shared-home server handling equivalent to Bots so Windows casing and remote profiles remain correct.

- [ ] **Step 4: Implement idempotent workspace acquisition**

Serialize ensure calls per runtime. Reuse an existing matching hidden group/workspace or create the root directory, hidden project group, and one folder workspace named `General Chat`. Return `folderWorkspaceKey(workspace.id)` as `worktreeId`. Never remove an existing directory on ensure failure.

- [ ] **Step 5: Exclude the internal group from visible catalogs**

Extend `runtimeVisibleProjectGroups` and `runtimeVisibleFolderWorkspaces` filtering so the General Chat group/workspace is excluded by the same host-side root predicate used for acquisition. Do not filter by display name.

- [ ] **Step 6: Run the focused test**

Run:

```powershell
pnpm test src/main/general-chat/general-chat-home.test.ts --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 7: Commit application workspace support**

```powershell
git add src/main/general-chat src/main/runtime/workspaces/catalog/runtime-visible-catalog.ts src/main/runtime/construction/runtime-store-contract.ts
git commit -m "feat(chat): add hidden general chat workspace"
```

---

### Task 3: Expose application-workspace acquisition through runtime RPC

**Files:**
- Create: `src/shared/general-chat/general-chat-contract.ts`
- Create: `src/main/runtime/rpc/methods/general-chat/general-chat-methods.ts`
- Create: `src/main/runtime/rpc/methods/general-chat/general-chat-methods.test.ts`
- Modify: `src/main/runtime/rpc/methods/rpc-method-registry.ts`
- Modify: `src/main/runtime/rpc/server/runtime-rpc-mobile-method-routing.ts`
- Create: `src/renderer/src/runtime/general-chat/general-chat-client.ts`

**Interfaces:**
- Produces: `GeneralChatHome = { executionHostId: ExecutionHostId; folderWorkspaceId: string; worktreeId: string }`.
- Produces: RPC method `generalChat.ensureHome` with empty parameters.
- Produces: `ensureGeneralChatHomeForTarget(target: RuntimeClientTarget): Promise<GeneralChatHome>`.

- [ ] **Step 1: Write the failing dispatcher test**

Use `RpcDispatcher` with a runtime fixture and assert two calls return the same workspace and preserve the caller's host identity. Include a refusal assertion when the runtime lacks folder-workspace persistence.

- [ ] **Step 2: Run the test and confirm the intended failure**

```powershell
pnpm test src/main/runtime/rpc/methods/general-chat/general-chat-methods.test.ts --maxWorkers=2
```

Expected: FAIL because the method is unregistered.

- [ ] **Step 3: Add the typed contract and RPC registration**

The contract must use the existing RPC method typing and structured refusal format. The server calls Task 2's ensure operation; the renderer client routes through the supplied `RuntimeClientTarget` rather than assuming local Electron IPC.

- [ ] **Step 4: Authorize paired/mobile reads and mutations**

Add the method to the same authenticated runtime scope used for structured-session creation. Do not expose filesystem paths in the result.

- [ ] **Step 5: Run the dispatcher test**

```powershell
pnpm test src/main/runtime/rpc/methods/general-chat/general-chat-methods.test.ts --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 6: Commit the runtime boundary**

```powershell
git add src/shared/general-chat src/main/runtime/rpc src/renderer/src/runtime/general-chat
git commit -m "feat(chat): expose general chat workspace acquisition"
```

---

### Task 4: Build the General Chat page from native-chat primitives

**Files:**
- Create: `src/renderer/src/components/general-chat/GeneralChatPage.tsx`
- Create: `src/renderer/src/components/general-chat/GeneralChatConversationList.tsx`
- Create: `src/renderer/src/components/general-chat/GeneralChatEmptyState.tsx`
- Create: `src/renderer/src/components/general-chat/use-general-chat-controller.ts`
- Create: `src/renderer/src/components/general-chat/general-chat-selection-store.ts`
- Create: `src/renderer/src/components/general-chat/GeneralChatPage.fixture.tsx`
- Modify: `src/renderer/src/app-shell/AppWorkspaceShell.tsx`

**Interfaces:**
- Consumes: `ensureGeneralChatHomeForTarget(target)` from Task 3.
- Consumes: `startStructuredAgentLaunch(worktreeId, agent, options)`.
- Produces: `GeneralChatPage` mounted for `activeView === 'general-chat'`.

- [ ] **Step 1: Implement the controller**

The controller owns selected host, selected conversation, ensure state, and launch state. New chat performs:

```ts
const home = await ensureGeneralChatHomeForTarget(target)
const launch = startStructuredAgentLaunch(home.worktreeId, agent, {
  executionHostId: home.executionHostId,
  activate: false,
  promptDelivery: 'draft'
})
selectConversation(launch.sessionId)
```

Use the existing structured-session catalog/subscription APIs for listing and title updates. Do not maintain a duplicate conversation array in persistence.

- [ ] **Step 2: Compose the page**

Desktop uses a narrow recent-conversation column and a flexible transcript. Narrow layouts show either list or transcript with a visible Back action. Mount `NativeChatView` in structured mode using the selected session, host target, and agent.

- [ ] **Step 3: Add explicit states**

Provide deterministic states for no host, host unavailable, provider unavailable, ensuring workspace, ensure failure, no conversations, and selected conversation. Retry must keep the same host.

- [ ] **Step 4: Add the fixture**

Register fixture variants for empty, unavailable host, and active conversation. Use hardcoded fixture data and existing native-chat fixture providers; do not mock button-call assertions.

- [ ] **Step 5: Format and typecheck touched files**

```powershell
pnpm exec oxfmt --write src/renderer/src/components/general-chat src/renderer/src/app-shell/AppWorkspaceShell.tsx
pnpm exec oxlint src/renderer/src/components/general-chat src/renderer/src/app-shell/AppWorkspaceShell.tsx
pnpm tc:web
```

- [ ] **Step 6: Commit the page**

```powershell
git add src/renderer/src/components/general-chat src/renderer/src/app-shell/AppWorkspaceShell.tsx
git commit -m "feat(chat): add project-independent general chat page"
```

---

### Task 5: Validate rendered General Chat

**Files:**
- Modify only files required by issues found during validation.

- [ ] **Step 1: Capture deterministic component fixtures**

Run each registered fixture with an explicit viewport:

```powershell
pnpm fixtures:shot general-chat-empty
pnpm fixtures:shot general-chat-host-unavailable
pnpm fixtures:shot general-chat-active
```

Inspect alignment, focus visibility, truncation, contrast, and narrow layout against `docs/styleguide/ux-review-rubric.md`.

- [ ] **Step 2: Build modified launch-policy code before app validation**

If no launch-policy code changed, skip this step. Otherwise run its targeted build before launching Electron.

- [ ] **Step 3: Validate the hidden Electron flow**

Launch with `ORCA_BACKGROUND_LAUNCH=1`, use an explicit 1440×900 viewport and deterministic profile, and verify through Playwright CDP that App Rail → General Chat → New chat opens the native composer without showing or focusing a window.

- [ ] **Step 4: Run the repository gate once**

```powershell
timeout 900 pnpm check:changed
```

Expected: exit 0 and no failures.

- [ ] **Step 5: Commit validation fixes**

```powershell
git add src
git commit -m "fix(chat): polish general chat foundation"
```
