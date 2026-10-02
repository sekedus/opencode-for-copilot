---
type: bug-fix
id: B-0003
title: "Shuttle re-emits already-emitted tool calls, spinning the host"
status: verified
date: 2026-10-02
task: T-0006
severity: high
---

# Bug Fix — Shuttle re-emits already-emitted tool calls, spinning the host

## Summary

When a provider call arrived with blocked executors but no matching tool
results, the bridge re-emitted the same already-emitted `callId` as a fresh
`ToolCallPart`. The host dedupes repeat callIds, so no result ever returned:
the turn spun (hundreds of "Read" steps to Copilot's max-request limit) until
the 10-minute executor safety timeout fired.

## Affected Area

- `src/provider/octProvider.ts` (turn routing)
- `src/provider/tools.ts` (emitted-call tracking)
- `src/provider/streaming.ts` (paragraph breaks — same verification finding)

## Observed Behavior

EDH verification, agent mode, `C:\Users\warrior\Downloads\test` (2026-10-01):
attempts 1–2 completed tool turns correctly; attempt 3 showed hundreds of
"Read text" entries to the 200-request limit ("Continue" → 301 steps), the
output channel repeating `paused for 1 Copilot tool call(s); executors stay
blocked` ~1/sec with no `Tool result to engine` lines, engine stuck in
`oct__list_dir`, then `Tool call list_dir hit the 10-minute safety timeout;
aborting` after which the next turn recovered and rendered real results.

A second cosmetic finding from the same session: engine text across step
boundaries rendered concatenated (`…what's here.Let me look…`) — no
separators between streamed steps.

## Expected Behavior

A result-less call with nothing new to emit aborts the stuck turn (abort +
interrupt + fresh turn) instead of re-pausing; step boundaries render as
paragraph breaks.

## Reproduction

Steps:

1. EDH, OCT enabled (managed), agent mode, OCT model.
2. Prompt a workspace listing that triggers several Copilot tool calls.
3. On some turns the host returns a provider call without `ToolResultPart`s
   for the blocked call (observed after long multi-call turns / max-request
   "Continue" cycles).

Expected:

Stuck turn aborts once with a `stuck turn (no results…)` log line; next turn proceeds.

Actual:

`paused for 1 … executors stay blocked` repeats until the safety timeout.

## Impact

Any multi-call agent turn could wedge: engine session stuck mid-turn, host
burning request quota to its limit, 10-minute recovery. Attempts 1–2 show the
normal path is unaffected.

## Root Cause

Evidence-based: the tail log shows only `paused` lines (missed-wakeup guard
hit on the still-blocked first call) with zero `Tool result to engine` lines,
at a metronomic ~1/sec — i.e. every new provider call carried no matching
result, and every call re-emitted the identical `callId`. The bridge kept no
memory of what it already emitted, so the host (which dedupes repeat callIds)
never had new work and never answered.

## Fix

- `ToolShuttle` tracks emitted callIds per session (`markEmitted`,
  `unemittedBlocked`); `resolve`/`abortAll` clear them.
- `pauseForTools` marks emitted ids; turn routing logs
  `N result(s), M blocked (K unemitted), J matched` on every call.
- Result-less call with blocked-but-all-emitted → `abortAll` + interrupt +
  fresh turn ("stuck turn" path). Result-less call with unemitted work →
  normal new-turn path (guard emits exactly the new calls).
- `breakParagraph()`: `\n\n` at `step.ended` and pre-tool-call pauses when
  streamed text lacks trailing whitespace (fixes the concatenation).

Do not paste large code blocks here. Link to files, commits, tests, or ADRs instead.

## Security Impact

Non-security fix, but aligned: the stuck path previously held executors (and
their inputs) for 10 minutes; now they abort on the next result-less call.
No permission/auto-approval behavior changed.

## Verification

- [x] `npx tsc --noEmit -p ./` + `npm run compile` exit 0 (2026-10-02).
- [x] EDH attempts 4, 6, 7, 8 (2026-10-01/02): sequential + parallel tool
  turns complete; per-call routing lines; paragraph breaks confirmed in chat;
  no repeat-`paused` spin anywhere since the fix.

Result:

VERIFIED.

## Regression Risk

The stuck-turn abort fires on any result-less call with fully-emitted
blocked state. Normal flow (emit → results) never hits it: results match
first. Slow-host approvals don't emit extra provider calls, so no false
positive. Multi-step parallel batches resolve per call; unemitted remainder
re-emits exactly once via the guard.

## Prevention / Lesson

Never re-emit an idempotent host directive without tracking emission:
cross-call duplicate `callId`s are deduped downstream, turning a retry into
a livelock. Log routing tuples (results/blocked/matched) on every provider
call — the spin was diagnosable only by absence of lines.

## Related Records

- Task: `dev/tasks/T-0006-copilot-tool-bridge.md`
- Commit: `[commit hash]`
- ADRs: `docs/adr/0001-oct-bridge-architecture.md`

## Follow-up

- EDH redo of Step 2 with the same workspace prompt; confirm spin is gone.
- Consider a per-session tool-call budget (abort after N unanswered pauses)
  if host result-less calls recur for other reasons.
