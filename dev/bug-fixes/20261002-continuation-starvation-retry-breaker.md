---
type: bug-fix
id: B-0004
title: "Continuation starves oldest resolve; model retries image tools forever"
status: verified (breaker short-circuit untriggered live)
date: 2026-10-02
task: T-0006
severity: high
---

# Bug Fix — Continuation starvation + image-tool retry loop

## Summary

Two coupled defects found in EDH attempt 5 (`oct__view_image`, ~230 tool
interactions to Copilot's step caps, 10-minute safety timeout): (1) the
continuation resolved blocked executors only after SSE subscription, so a
guard-pause for a newer call could divert the turn before older calls
resolved — starving them forever; (2) the engine model retried an
image-producing tool indefinitely because image results degrade to a text
placeholder it can never satisfy.

## Affected Area

- `src/provider/octProvider.ts` (resolve timing)
- `src/provider/streaming.ts` (removed deferred `onOpen` resolve)
- `src/provider/tools.ts` (identical-call circuit breaker)

## Observed Behavior

`Turn on ses_…: 230 result(s), 1 blocked (0 unemitted), 138 matched` followed
1ms later by another `paused for 1` — the 138-match continuation never
resolved the 1 blocked call (guard diverted first), while the engine issued
new `view_image` calls with identical input and the host replayed full
history each provider call (counts climbing 12→16→…→230→231).

## Expected Behavior

Matched results resolve synchronously before streaming, so no ordering can
starve them; a 3rd consecutive identical call short-circuits with a
stop-and-proceed instruction instead of blocking.

## Reproduction

Steps:

1. EDH, OCT managed, agent mode, workspace with images.
2. Prompt a workspace summary that leads the model to view images.

Expected:

At most 2 identical image views, then the model proceeds from text.

Actual:

~230 `view_image` executions; one call blocked the full 10 minutes.

## Impact

Runaway request-quota burn (200/240/228-step caps with Continues), 10-minute
wedged session, ever-growing transcript replay per provider call.

## Root Cause

Evidence-based: the 1ms pause-after-match proves the guard beat the deferred
`onOpen` resolve; the climbing result counts prove full-history replay; the
identical repeated input proves a model-level retry loop against a result
shape (image) the text bridge cannot satisfy.

## Fix

- `runContinuation` resolves all matched calls synchronously, then streams
  (LLM round-trip latency exceeds SSE setup, so no textual delta can be
  missed in between). Removed the `onOpen` hook and its readSse parameter.
- `ToolShuttle` circuit breaker: 3rd consecutive identical
  (tool + input JSON) call per session is answered immediately (not blocked)
  with `OCT: '…' was already called Nx in a row… proceed with what you have`.
  Counter resets on any different call and on turn end (`clearPending`).

## Security Impact

Non-security fix. Smaller blast radius as a side effect: runaway loops no
longer hold executors/inputs for 10 minutes.

## Verification

- [x] `npx tsc --noEmit -p ./` + `npm run compile` exit 0 (2026-10-02).
- [x] EDH attempts 6–8 (2026-10-01/02): sequential + parallel `view_image`
  turns resolve every call (sync resolve; `2 blocked → 1 matched → resolve →
  1 blocked → 1 matched → resolve`); no starvation, no step caps, no timeouts.
- [ ] Breaker short-circuit line never observed live: no 3× identical loop
  recurred after the fix (safety net, code-reviewed only).

Result:

VERIFIED (starvation fix; breaker untriggered).

## Regression Risk

Sync-resolve changes continuation timing: resolves now happen before SSE
subscribe rather than after. Textual loss is structurally impossible (next
deltas require a model round-trip), and the T-0006 headless probes showed
`tool.success` content is independent of stream timing. The breaker trips
only on 3 consecutive identical inputs — legitimate repeats separated by
other calls are unaffected.

## Prevention / Lesson

Never defer unblocking behind a subscription that a fast path can preempt;
resolve-then-subscribe when downstream latency dominates. And: any bridge
that degrades a result type (images→text) needs a retry breaker, because the
model will chase the unsatisfiable want forever.

## Related Records

- Task: `dev/tasks/T-0006-copilot-tool-bridge.md`
- Bug: `dev/bug-fixes/20261002-shuttle-duplicate-emit-spin.md` (B-0003, same family)
- Commit: `[commit hash]`

## Follow-up

- EDH redo (Step 2) with the image workspace.
- If image tools matter to users, consider a multimodal follow-up task that
  ferries `LanguageModelDataPart` images back instead of placeholder text.
