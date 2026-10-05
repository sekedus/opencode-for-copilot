# T-0015 — Copilot tools primary, engine tools fallback

## Status

COMPLETE (verified 2026-10-05: `tsc` 0, `npm test` 48/48, EDH Parts A/B/C green)

## Objective

Establish the tool priority: VS Code Copilot tools (via the bridge) are
the primary path; opencode engine-native tools are the fallback — and the
text-only dead end disappears.

## Why

M3 item 6 (user decision 2026-10-03). Today when the bridge is unavailable
(external mode without the plugin), turns carrying tool definitions get a
notice and answer text-only (`octProvider.ts:161-166`, `TOOL_NOTICE`);
engine-native tools are gated behind approvals but never offered as the
fallback.

## In Scope

- Bridge available → unchanged (Copilot tools via shuttle stay primary).
- Bridge unavailable → drop the text-only `TOOL_NOTICE` path and let the
  engine use its own tools instead (engine `ask`-policy approvals still
  surface via the existing confirmation flow — fallback does NOT bypass
  default-deny). Note: today's text-only is prompt-instruction only —
  nothing mechanically blocks engine-native tools, so start with an EDH
  probe of actual no-bridge behavior; the change may be notice-rewording,
  not new machinery.
- `imageInput: true` only unlocks the chat attachment UI (verified in
  vscode `chatContext.ts`, `chatAttachmentWidgets.ts`) — transport is NOT
  gated, so attachment/data parts still arrive as placeholders until a
  later task sends them.
- Attachment/image tool results stay placeholders (multimodal deferred —
  unchanged).
- Document the priority in README tool-bridge section.

## Out of Scope

- Sending images (still placeholder).
- Approval-flow changes (permissions.ts untouched unless the fallback
  needs a new reply path — investigate first).

## Dependencies / Inputs

- `src/provider/octProvider.ts` (`TOOL_NOTICE` paths), `src/provider/tools.ts`,
  `src/provider/permissions.ts`, T-0014 (vision is separate).

## Acceptance Criteria

- [x] External mode without plugin + tool-carrying turn → engine tools
  used (approvals surface), no text-only notice.
- [x] Managed/bridged mode behavior unchanged (Copilot tools primary).
- [x] Deny/timeout semantics unchanged (default-deny holds on fallback).
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (`TOOL_NOTICE` removed from
  `src/provider/octProvider.ts:159-183`; bridge-unavailable + tool-parts
  paths now log `engine tools are the fallback` and send the prompt as-is —
  no prompt-instruction blocks engine-native tools; `permissions.ts`
  untouched, bridged path untouched).
- Tests: VERIFIED (`npx tsc --noEmit -p ./` exit 0; `npm test` 48/48 green
  2026-10-05 — no new tests: no `octProvider` harness exists; change is a
  prompt-text deletion, covered by existing `messages`/`streaming` units).
- Runtime/manual verification: VERIFIED (EDH 2026-10-05, user-run).
  Part A (managed, Copilot primary): same `ses_ef6385260ffe1z5s6eAnYj978Q`
  across the tool turn — `carries 47 Copilot tool(s) via the bridge
  (primary)`, engine `list_dir` call → `paused for 1 Copilot tool
  call(s)` → `Tool result to engine: list_dir (394 chars)`. 1:1 reuse
  holds, bridged path unchanged.
  Part B (external no-plugin, engine fallback): fresh
  `ses_ef6263380ffeCAFddgoWGwW5WH` logged `carries tool definitions but
  the bridge is unavailable … engine tools are the fallback`; chat had no
  old text-only sentence; `edit` approval surfaced and Continue Once
  applied.
  Part C (default-deny on fallback, `ses_ef6159628ffeNphFyTD9xkoRq2`):
  Cancel → `denied (user cancel)` + `ended after a denial; reported
  cleanly`, file not created; timeout → `denied (timeout default-deny)`,
  file not created.

## README Impact

Tool-bridge section: document primary/fallback priority.
