---
type: bug-fix
id: B-0005
title: "Denial surfaces engine internals and extension stack in chat"
status: verified
date: 2026-10-02
task: T-0006
severity: medium
---

# Bug Fix — Denial surfaces engine internals and extension stack in chat

## Summary

Denying (or timing out) an engine approval failed the whole provider call
with the raw engine abort text plus the extension's JS stack, rendered in
Copilot Chat as `Reason: OCT: [aborted] Step interrupted … at streamTurn
(d:\htdocs2\…\streaming.ts:…)`. Local paths disclosed; UX hostile and
inconsistent (a turn that had already streamed text ended gracefully while
an empty one errored).

## Affected Area

- `src/provider/streaming.ts` (terminal denial path)

## Observed Behavior

EDH verification 6b/6c (2026-10-01): Cancel/timeout correctly denied (file
not created, `denied (user cancel)` / `denied (timeout default-deny)` logged)
but the chat showed a `Sorry, your request failed … Reason: OCT: [aborted]
Step interrupted: Error: … at streamTurn (d:\…) at processTicks…` error on
empty turns, and nothing on turns that had streamed text.

## Expected Behavior

A denial is a user decision, not a system error: the turn ends with one
clean sentence and no error popup, consistently.

## Reproduction

Steps:

1. Force `ask` for `edit` in the engine config; EDH agent mode.
2. Prompt a file write; click Cancel (or let it time out) before any text streams.

Expected:

Chat reads that the engine stopped for lack of approval; nothing applied.

Actual:

Raw abort text + extension stack (`d:\…`) in the chat error.

## Impact

Every denied/timeout approval on an empty turn leaks dev-machine paths into
the chat transcript and reads as a crash. Denials are routine, so this is
high-visibility despite medium severity.

## Root Cause

`turnError && !streamed` unconditionally threw `new Error(\`OCT: …\`)`; the
thrown stack (our source paths) is rendered by Copilot as the failure
`Reason`. The streamed-text branch already degraded gracefully, hence the
inconsistency.

## Fix

Track `deniedThisTurn` (translator returned `rejected`); when the terminal
error matches `/abort|interrupt|denied|reject/i`, report `The engine stopped
because the request was not approved (denied, timed out, or dismissed).
Nothing was applied.` as normal turn text and return `done`. Genuine errors
after a denial (non-abort terminal text) still throw as before.

## Security Impact

Fixes a minor path-disclosure: extension source paths no longer reach chat
transcripts on the denial path. Other throw paths (admission, provider
errors) still surface messages by design (B-0002 behavior, unchanged).

## Verification

- [x] `npx tsc --noEmit -p ./` + `npm run compile` exit 0 (2026-10-02).
- [x] EDH 2026-10-02: Cancel on empty turn → clean `The engine stopped…`
  sentence, `reported cleanly instead of throwing`, no popup, file absent.
  Partial-text denial stays on the non-fatal path. Step 7 status shows
  `pending approvals: 0`; Step 8 text regression clean (Paris, no tool lines).

Result:

VERIFIED (denial UX). Pre-existing streamed-denial path unchanged.

## Regression Risk

Low: only the post-denial abort-shaped terminal path changes. Approval
Continue, genuine failures, and text-streamed turns are untouched.

## Prevention / Lesson

User decisions (deny/timeout/dismiss) must resolve turns as normal output,
never as thrown errors — thrown Errors carry stacks into surfaces we don't
control.

## Related Records

- Task: `dev/tasks/T-0006-copilot-tool-bridge.md`
- Bug: `dev/bug-fixes/20261002-continuation-starvation-retry-breaker.md` (B-0004)
- Commit: `[commit hash]`

## Follow-up

- None beyond the EDH re-check.
