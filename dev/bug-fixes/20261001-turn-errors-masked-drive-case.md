---
type: bug-fix
id: B-0002
title: "Turn errors masked as cancelled; lowercase drive letter poisons sessions"
status: resolved
date: 2026-10-01
task: none (unplanned fix against T-0003-era provider code)
severity: high
---

# Bug Fix — Turn errors masked as cancelled; lowercase drive letter poisons sessions

## Summary

After the engine update from opencode v2.0.18 to v2.0.21, every chat turn failed with `OCT: request cancelled` (plus a Copilot `Client Request Id`). Two layered defects caused it: the provider mistook its own routine SSE close for user cancellation, hiding every real engine error; and once the real errors became visible, sessions in a lowercase-drive workspace (`c:\...`) failed permanently because the engine's instruction discovery recurses forever on case-mismatched paths.

## Affected Area

- `src/provider/streaming.ts`
- `src/provider/octProvider.ts`
- `src/provider/sessions.ts`
- `src/server/client.ts`
- `src/extension.ts`

## Observed Behavior

1. Every turn failed with `Reason: OCT: request cancelled.` pointing at `streamTurn (src/provider/streaming.ts:238)`, although the user never cancelled. Previously (v2.0.18) the same setup worked.
2. After the masking fix, the real error surfaced: `OCT: [unknown] Instruction initialization blocked by unavailable sources: core/instructions`, and the mapped opencode session never produced output. The workspace was `c:\Users\warrior\Downloads\test`.
3. The retry-once recovery surfaced the same failure on the fresh session, proving the cause was per-location, not per-session.

## Expected Behavior

1. Engine failures surface with their real message (e.g. auth, instruction discovery), never as `request cancelled` unless the user (or timeout) actually aborted the turn.
2. A workspace path in any letter case maps to a working session; a session that can never initialize is replaced, not retried forever.

## Reproduction

Masking (live probe against opencode v2.0.21):

1. Start `opencode serve` on a probe port with a password.
2. Create a session, open the SSE event stream, `POST /api/session/:id/prompt`.
3. The engine emits `session.step.failed` + `session.execution.failed` with `provider.auth / PAID_MODEL_AUTH_REQUIRED` and no deltas.
4. Old code threw the extracted message, then the outer `catch` saw the (routinely aborted) controller signal and replaced it with `OCT: request cancelled`.

Drive case (live probe, `--print-logs --log-level debug`):

1. Create a session with `location.directory = "c:\Users\warrior\Downloads\test"` (lowercase drive), prompt it.
2. Server log: `failed to activate instruction source` with `RangeError: Maximum call stack size exceeded`, then `Failed to drain Session` with `Instructions.InitializationBlocked`.
3. Repeat with `"C:\Users\warrior\Downloads\test"` (canonical case): `session.instructions.updated` fires and the turn proceeds to the model.

## Impact

Total outage for affected workspaces: no turn could succeed, and the reported error (`request cancelled`) pointed away from every real cause. The drive-case defect additionally created duplicate engine-side projects (`c:\...` vs `C:\...` canonical rows for the same folder).

## Root Cause

1. `streamTurn` aborted its SSE `AbortController` in a `finally` on every normal turn, then treated `controller.signal.aborted` as evidence of cancellation in the outer `catch`. Since the signal is always aborted by then, any error raised after the terminal event (engine failure text, fallback fetch failure) was replaced with `OCT: request cancelled`. The inner `catch` had the same flaw (silent return). Turns that streamed deltas never hit the path, so the bug stayed hidden until v2.0.21 made turns fail (default kilo model now requires sign-in: `PAID_MODEL_AUTH_REQUIRED`).
2. The extension passed VS Code's workspace path verbatim (`c:\...`) as the engine session location. The engine's instruction plugin walks ancestors with a case-sensitive `===` and no cycle guard, so `c:\...\test` never string-matches the uppercase stop value and recurses at the drive root until the stack overflows. Discovery is then marked unavailable for that location's lifetime, and `Instructions.diff` refuses first-time initialization (`InitializationBlocked`, surfaced with engine type `unknown`). A session in this state can never succeed, so plain retries fail forever.

## Fix

Worktree (uncommitted at record time):

- `streaming.ts`: explicit abort-reason flags (`cancelRequested` / `timedOut` / `admissionFailed`); `signal.aborted` is never read as cancel evidence. Timeouts throw `OCT: turn timed out`; prompt-admission failures exit the stream loop instead of hanging to the turn timeout; `errorOf` keeps informative engine types (`[provider.auth]`) and omits the noise `[unknown]` prefix; new exported classifier `isInstructionBlockedError()`.
- `client.ts`: `requestJson` timeouts throw `opencode request timed out: METHOD path (ms)` instead of a bare `AbortError`.
- `sessions.ts`: new `forget(key)` drops a poisoned conversation mapping (same principle as the existing 404-remap) so the next turn creates a fresh session.
- `octProvider.ts`: on an instruction-blocked turn, forget the mapping and retry once on a fresh session (heals transient discovery failures); if the retry also blocks, throw an actionable message naming the directory (check existence/readability, reload the window to restart the managed engine).
- `extension.ts`: new `canonicalDirectory()` — on-disk spelling via `realpathSync.native`, fallback to an uppercased drive letter — applied in `workspaceCwd()` so every engine session location is case-canonical.

Do not paste large code blocks here. Link to files, commits, tests, or ADRs instead.

## Security Impact

No credential or secret handling changed; passwords never logged. `canonicalDirectory` only normalizes path spelling (no file content read). The retry path creates at most one extra failed-idle session per blocked turn; no extra model spend occurs because blocked turns never reach the model.

## Verification

- `npx tsc --noEmit -p ./` exit 0; `npm run compile` exit 0.
- Live v2.0.21 probes: old path demonstrably maps `[provider.auth]` to `request cancelled`; new path surfaces `OCT: [provider.auth] You need to sign in to use this model.` Classifier check true/false/false against blocked/auth/cancel messages.
- Live drive-case probes: lowercase reproduces the exact user error with engine `RangeError`; canonical case reaches `session.instructions.updated`.

Result:

Static + probe verification passes. Live Extension Development Host check (real chat turn through the fixed build) not yet recorded.

## Regression Risk

- `forget()` + retry adds one extra session creation per blocked turn; bounded (single retry, only on the blocked signature).
- `canonicalDirectory` changes the hash-fallback conversation key for lowercase-drive folders once (one fresh session); `conv:`-keyed chats are unaffected. Same-folder-different-case windows now unify to one session.
- Blocked turns that previously (mis)reported `request cancelled` now report engine text; callers matching on the old string would need updating (none in-repo).

## Prevention / Lesson

- Never use a shared abort signal as cancel evidence when the same signal is raised on the success path; track cancellation/timeout with explicit flags.
- Never pass host paths to a case-sensitive engine verbatim on Windows; canonicalize once at the boundary.
- A session whose baseline state can never initialize must be abandoned (forget/remap), never retried — same rule as the 404-remap.

## Related Records

- Task: `dev/tasks/T-0003-chat-provider-sessions.md`
- Bug fix: `dev/bug-fixes/20260930-conversation-session-map.md` (mapping + 404-remap precedent)
- Upstream engine bug to file: `ancestorDirectories` in `packages/core/src/config/plugin/instruction.ts` needs a root/cycle guard and case-insensitive comparison (sibling `fs.up` already guards).

## Follow-up

- Record live Extension Development Host verification (failing turn shows real error; lowercase-drive workspace chats work after reload).
- File the upstream opencode issue with the probe log evidence.
- Consider `DELETE`-ing poisoned sessions on forget to avoid server-side clutter (background reaper still out of scope).
