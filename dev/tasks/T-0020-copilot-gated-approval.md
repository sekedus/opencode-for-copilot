# T-0020 — Copilot-gated approval + attention ping

## Status

COMPLETE

## Objective

Make engine-native approvals (`permission.asked` fallback path) noticeable
when the user is distracted AND follow Copilot's global permission level
with a simplified two-button dialog — client-side only, default-deny
preserved for non-read actions (`read` is always allowed, see below).
Session trust ("Always for This Session") is REMOVED.

## Simplified rule (user 2026-10-07)

- Copilot tools (bridge, `streaming.ts:279` ToolCallPart): untouched,
  host-owned — keep following existing Copilot permissions exactly
  (mode-dependent + per-tool settings like `chat.tools.edits.autoApprove`).
- Opencode tools (engine-native `permission.asked`): follow ONLY the
  global/picker default `chat.permissions.default`, read fresh every time,
  with one exception:
  - `read` (exact action match) → ALWAYS ALLOW silently (auto-`once`, no
    dialog) under every Copilot setting. Rationale: read has no side
    effects; gating it adds friction without protection (the local engine
    already runs with full filesystem access — approval is awareness, not
    a security boundary). Note: this also bypasses the engine's own
    `*.env` read-ask default; accepted per user 2026-10-07 (chat text +
    tool I/O already flow through the bridge; see `dev/security.md` —
    never log content).
  - `default`/missing/unknown/`assisted` → ASK with two buttons:
    **Allow** / **Cancel** (no "Continue Once", no "Always for This
    Session"). Allow replies engine `once` for that one request only.
  - `autoApprove` (Bypass/Allow all) / `autopilot` → ALLOW silently
    (client-side auto-`once` for that one request, no dialog).
  - The ONLY way to auto-allow opencode non-read actions is to set
    Copilot's global or picker permission to Allow-all/Autopilot. No
    per-session trust, no engine `always`, nothing persisted.

## Why

M4 scope (user 2026-10-05): merges the two approval items (both small,
both the approval path in `src/provider/permissions.ts`). User clarified
2026-10-05: "follow Copilot permissions" = the core setting
`chat.permissions.default` — verified real in VS Code source
(`constants.ts:101,143-152`: enum `default|assisted|autoApprove|autopilot`;
registered in `chat.shared.contribution.ts:626` with enum actually
`[default, autoApprove, autopilot]` (labels: Default Permissions /
Bypass Approvals / Autopilot Preview), default `default`). Picker labels per
user screenshot 2026-10-05: Default permissions / **Allow all** (=`
autoApprove`, "Runs tool calls without asking") / Autopilot (Preview).
Any extension can read it via `getConfiguration('chat')` — so yes, it is
possible.
User clarified 2026-10-07: Copilot's `default` is NOT one behavior — it
varies by mode (ask vs agent vs plan, `contribution.ts:664`:
`interactive|plan|autopilot`) and per-tool settings
(`chat.tools.edits.autoApprove` patterns — default allow-all except
sensitive like `**/.vscode/*.json`, `**/.git/**`; plus
`chat.tools.global.autoApprove` YOLO). Different tools can have different
settings. So for opencode tools we deliberately do NOT mirror the per-tool
matrix — we follow ONLY the global default (ask vs allow), keeping the
dialog to Allow/Cancel. Verified in source 2026-10-07.
Bridged Copilot tools already run under the host's own approval UI
(`streaming.ts:279` ToolCallPart); this task changes only the engine-native
dialog. Security-sensitive: auto-approval touches shell/edit — see
`dev/security.md`, default-deny must survive. REMOVING session trust
shrinks the attack surface (no stale trust).

## In Scope

- Attention = dialog (decision) + OS ping (attention-only). Verified
  2026-10-07 against VS Code source (`$TEMP/vscode`, tag 1.135.0):
  `ChatWindowNotifier` (`chatWindowNotifier.ts:57-64`) watches
  `IChatModel.requestNeedsInput`, which derives ONLY from response parts
  (`chatModel.ts:1418-1451`: `toolInvocation`
  WaitingForConfirmation/PostApproval/Auth, `confirmation`,
  `questionCarousel`, `planReview`, `elicitation2`). Our engine-native
  `permission.asked` path blocks in `streamTurn` and shows
  `showWarningMessage` — no such part exists, so the notifier never fires.
  True OS toast is `IHostService.showToast` (`host.ts:182`), internal-only;
  `vscode.d.ts` exposes no OS toast (`showWarningMessage` /
  `ProgressLocation.Notification` stay in-window, never pop over a browser).
  Bridged Copilot tools already emit real `LanguageModelToolCallPart`
  (`streaming.ts:279`) → real `toolInvocation` parts → core may already
  toast; verify in EDH (no code).
- OS ping PARKED 2026-10-07 (user decision; see PL-0006): extension-side
  OS toasts proved undeliverable — `IHostService.showToast` is internal-only
  (main-process Electron `Notification` + startup `setAppUserModelId`,
  unreachable from extensions); WinRT from `powershell.exe` never surfaces
  even under the host AppUserModelId (EDH test-1 + test-2, History-landed
  probes with no banner). Code removed (`src/system/notify.ts`,
  `oct.approvalOsNotify`, translator ping call + all notify tests). The
  `showWarningMessage` dialog is the ONLY approval surface; timeout/dismiss/
  cancel still deny via the dialog path.
- In-window fallback still ranked (EDH, same session): current toast vs
  `modal:true` vs persistent `ProgressLocation.Notification` — pick the
  winner for the focused-window case.
- Follow `chat.permissions.default`: read it fresh on every NON-READ
  approval (no caching, no stale trust; `read` never reaches this mapping —
  always auto-`once`, see Simplified rule). `default`/missing/unknown/
  `assisted` → two-button ASK (**Allow** / **Cancel**);
  `autoApprove`/`autopilot` → silent client-side auto-`once` for that one
  request (no dialog).
  `assisted` (experiment-gated, model-delegated — we cannot delegate) →
  ask with a log line. Missing setting on older VS Code
  (min baseline ^1.125 predates it) reads as unset → ask. This is the
  *global default only* — per-session overrides, per-mode differences
  (ask/agent/plan), per-tool patterns (`chat.tools.edits.autoApprove`,
  `chat.tools.global.autoApprove`) and enterprise clamps stay
  Copilot-side for Copilot tools; opencode tools intentionally ignore
  them. Document that boundary in-code and in README.
- Ignore `opencode.json(c)` (user 2026-10-07): engine default agent
  permissions are allow-all (`agent.ts:46-52`: `{action:"*",resource:"*",
  effect:"allow"}` + only `external_directory`/`.env` ask), so without
  intervention the engine often never emits `permission.asked` and Copilot
  gating cannot apply — and OS/user files may set ask/allow/deny
  inconsistently. Final decision for opencode NON-READ tools comes ONLY from
  Copilot's global/picker default (`read` is always auto-`once`, see
  Simplified rule):
  - Copilot `default`/missing/unknown/`assisted` + opencode
    ask/allow/deny → final ASK (Allow/Cancel dialog).
  - Copilot `autoApprove`/`autopilot` + opencode ask/allow/deny → final
    ALLOW (silent auto-`once`).
  Managed mode enforces this by injecting ask-all
  (`{"permissions":[{"action":"*","resource":"*","effect":"ask"}]}`) into
  `OPENCODE_CONFIG_CONTENT` — content ranks LAST (highest priority) in
  `Config.load` (`Config.ts:230-237`), and rule evaluation is
  last-match-wins (`permission.ts:87-97`), so it overrides global +
  workspace files without touching them. The injected ruleset stays
  ask-ALL (including `read`): the `read` exception is applied in our
  translator (logged + unit-tested), keeping a single decision point.
  Preserve/merge other existing content keys (same pattern as
  `resolvePluginConfig`). External mode
  cannot force it: document that the external server must set
  permissions ask-all, otherwise Copilot Default→ask is unenforceable
  (engine allows silently). README note only (a runtime warning when no
  `asked` event is ever seen for a session is OUT of scope).
- REMOVE session trust: delete the `trusted` set, `isTrusted`/`forget`
  trust paths, and the "Always for This Session" button. Dialog becomes
  `showWarningMessage(message, "Allow", "Cancel")`. Existing tests
  referencing "Continue Once"/trust must be updated. `forget()` callers
  (session-gone/dropped paths) become no-ops to remove.
- Invariants kept: the bridge NEVER sends engine `always`, never persists
  a server-side rule; timeout/dismiss/cancel still deny wherever a dialog
  is shown; every decision (incl. silent `read`/auto-allow) logged (action
  + resources only); unit tests for the mapping incl. unknown-values-ask;
  EDH for both halves.

## Out of Scope

- Per-session permission overrides / per-mode differences / per-tool
  patterns / enterprise clamps for OPENCODE tools (Copilot-side concepts;
  we follow the global default only). Copilot tools keep all of them
  (host-owned — untouched).
- Engine-side permission rulesets / `always` replies (never).

## Dependencies / Inputs

- `src/provider/permissions.ts` (`confirm`, `ask`), `src/server/manager.ts`
  (`resolvePluginConfig` ask-all merge), `dev/security.md`
  (auto-approval attack surface review before widening), T-0006/B-0005
  precedents (chat-text denial, no error dumps).

## Allowed Product Files / Areas

- `src/provider/permissions.ts`
- `src/server/manager.ts` (`resolvePluginConfig` → also merge ask-all
  `permissions`; preserve existing content keys)
- `src/config.ts` (no new settings; `oct.approvalOsNotify` removed with the parked ping)
- `package.json` (no new settings after ping removal)
- `test/...` (translator unit tests)
- `README.md` (approval section: setting-following + picker limit)

## Acceptance Criteria

- [ ] PARKED (PL-0006): distracted-user attention ping. In-window dialog
      still decides (EDH: rank current toast vs `modal:true` vs persistent
      `ProgressLocation.Notification` for the focused-window case).
- [x] `read` action → silent auto-`once` under EVERY Copilot setting
      (unit test: `default` + `autoApprove` + `autopilot` all skip the
      dialog for `read`; non-read actions unaffected).
- [x] `chat.permissions.default=default`/missing/unknown/`assisted` →
      two-button ASK (**Allow**/**Cancel**) for non-read actions;
      `autoApprove`/`autopilot` → silent auto-`once`, no dialog
      (unit test the mapping).
- [x] No "Continue Once" / "Always for This Session" strings remain in
      product code or tests; no session-trust state (`trusted` set gone).
- [x] Setting-driven auto-`once` (Copilot Bypass/Autopilot) and `read`
      auto-`once` never emit engine `always`, never persist anything
      (unit test: reply is `once`, no config/state write on those paths;
      no session-trust state exists).
- [x] Deny paths (timeout/dismiss/cancel) hold wherever a dialog is shown
      (non-read actions under Copilot Default), under every setting value.
- [x] EDH with the setting on Bypass/Autopilot: non-read engine action
      proceeds without a dialog; on Default: non-read dialog appears, `read`
      proceeds silently (EDH test-3/4/5 GREEN 2026-10-07). EDH on a stock engine
      (no `permissions` in opencode.json): managed mode still asks on
      Default (test-3 dialogs prove the injected ask-all); opencode.json
      with explicit allow STILL asks on Default (user-tested 2026-10-07 —
      injected ask-all wins via last-match-wins, never honored).
- [x] External mode README: server must set permissions ask-all, else
      Copilot Default→ask is unenforceable (engine allows silently).
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED 2026-10-07 (translator mapping + trust
  removal `src/provider/permissions.ts`, ask-all inject
  `src/server/manager.ts`, `forget` callers removed
  `src/provider/octProvider.ts`, README). OS ping REMOVED same day (user
  decision; parked PL-0006 — `src/system/notify.ts`, `oct.approvalOsNotify`
  setting, translator ping call, and all notify tests deleted).
- Tests: TESTED 2026-10-07 (`test/permissions.test.ts`: mapping
  incl. unknown-values-ask, read-silent under every setting, Allow/Cancel
  dialog, timeout/dismiss/cancel deny, never-`always` + no trust state,
  ask-all merge; `tsc` 0, `npm test` green).
- Runtime/manual verification: EDH test-1 PARTIAL 2026-10-07 (Default ask/X-dismiss/Cancel/Allow + Copilot-tool create_file + read-silent all correct; TWO bugs filed):
  - Toast never appeared on ask path. Root cause FOUND + fixed: the PS
    script never loaded the `Windows.Data.Xml.Dom.XmlDocument` WinRT type,
    so it died silently (stdio ignored); probe script confirmed
    `TOAST_ACCEPTED` once the load line was added. Fix in
    `buildApprovalScript` + regression test. Needs EDH re-verify.
  - Picker Allow-all/Autopilot still asked. Root cause FOUND in VS Code
    source: the chat-view picker NEVER writes `chat.permissions.default` —
    it sets per-session in-memory state (`permissionLevel` session option,
    seeded from the default at session creation; `permissionPicker*.ts`,
    `chatInputPart.setPermissionLevel`, `copilotChatSessionsProvider`).
    The session level is NOT forwarded to `registerLanguageModelChatProvider`
    providers (`extHostLanguageModels $startChatRequest`, `modelOptions`
    carries no permission keys; public `ProvideLanguageModelChatResponseOptions`
    has no level field). So the picker is INVISIBLE to extensions — the task
    premise "follow the picker via getConfiguration" is disproven for picker
    changes (global Settings change of `chat.permissions.default` DOES flow).
    Awaiting user decision: global-setting-only vs own OCT auto-allow toggle.
  - DECIDED 2026-10-07: global-setting-only (no new code; picker limit
    documented in README; EDH retest drives auto-allow via the global
    `chat.permissions.default` setting, not the picker).
  - How core/Copilot toast (source-verified 2026-10-07): renderer
    `IHostService.showToast({title, body, actions?})` → IPC → main-process
    Electron `new Notification({title, body, silent, actions}).show()`
    (`nativeHostMainService.ts:1351-1392`); attribution comes from
    `app.setAppUserModelId(win32AppUserModelId)` at startup (`app.ts:684`)
    paired with the same id in the installed shortcut — an extension host
    process cannot replicate this path (no API). Screenshot A
    (`Chat: …` / `New chat response.`) is `chatAccessibilityService.ts:128`;
    screenshot B (`Session: …` / `Allow edits to sensitive files?` /
    `[Allow]`) is Copilot's `createEditConfirmation` title surfaced via
    `requestNeedsInput` → `chatWindowNotifier` Allow action (which DOES
    approve in place — ours deliberately has no buttons). Our WinRT +
    host-AUMID approach is the closest extension-side equivalent; probe
    toasts land in History under `VSCodium.VSCodium`.
  - EDH test-2 2026-10-07: ask/deny/Allow + Copilot-tool + read-silent all
    correct, but toast STILL absent. Investigation (missing WinRT type load,
    then host-AUMID attribution with History-landed probes) still produced
    no banner across two sessions. SUPERSEDED: ping removed per user
    decision, parked PL-0006 (module, setting, call, and notify tests all
    deleted — see In Scope).
  - EDH test-3/4/5 GREEN 2026-10-07 (no `permissions` in opencode.json(c),
    picker untouched throughout):
    - test-3 (`default`): turn 1 Allow→created, turn 2 X→denied unedited,
      turn 3 Cancel→denied unedited, turn 4 Allow→edited, turn 5 Copilot
      tool `replace_string_in_file` with no dialog→edited; `read` silent
      throughout. Dialogs on a stock engine also prove the managed ask-all
      inject (engine defaults are allow-all and would never emit
      `permission.asked` otherwise).
    - test-4 (global `autoApprove`): edit + shell turns silent with
      `auto-continued (Copilot autoApprove)`; `read` silent. Picker had
      auto-selected Allow-all as the new-session seed — picker itself
      untouched (PL-0005).
    - test-5 (global `autopilot`): edit turns silent with
      `auto-continued (Copilot autopilot)`; `read` silent. Same picker
      note as test-4.
  - OPEN: one EDH micro-test to close the stock-engine criterion fully —
    opencode.json with an explicit allow rule must STILL ask on Default
    (injected ask-all wins via last-match-wins, never honored).
  - CLOSED 2026-10-07: user-tested, dialog still appears with explicit
    allow in opencode.json. T-0020 COMPLETE (`tsc` 0, `npm test` 99/99,
    EDH test-3/4/5 + override proof GREEN).

## README Impact

Tool-bridge approval paragraph: opencode tools follow ONLY the global
default (`read` always allowed; other actions Default→Allow/Cancel ask,
Bypass/Autopilot→allow); session trust removed; `opencode.json(c)`
permissions ignored (managed mode forces ask-all; external servers must set
ask-all); Copilot tools unchanged (host permissions incl. per-tool patterns).

## Commit Checkpoint

Suggested commit message:

```text
feat: approval attention surface and Copilot-style levels
```

Commit status:

```text
UNCOMMITTED
```
