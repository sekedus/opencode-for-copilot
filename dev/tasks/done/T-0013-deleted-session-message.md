# T-0013 — Deleted session mid-turn tells user to start a new chat

## Status

COMPLETE (verified 2026-10-04: `tsc` 0, `npm test` 39/39; EDH live test
confirmed the sentence + surfaced 2 defects, both fixed)

## Objective

When a turn hits a dead engine session (404 on prompt/stream) in the same
Copilot conversation, fail the turn with one clear sentence telling the
user the session was deleted and to start a new Copilot chat — instead of
the current cryptic error + every later turn failing the same way.

## Why

M3 item 3 (user decision 2026-10-03: no silent recreate, no history
replay — the user starts over). Today mid-window 404s are unhandled:
`streaming.ts` has no 404 path, the mapping is kept, and all later turns
fail identically until reload/prune.

## In Scope

- Detect session-gone (`error instanceof OctHttpError && error.status === 404`,
  caught at the `turn()` level in `octProvider.ts` — this covers prompt
  admission, the message-list fallback, and permission replies in one place)
  and `forget(key)` the mapping so nothing retries the dead id. Note: with
  the mapping dropped, a user who keeps chatting anyway gets a fresh
  amnesiac session — accepted per the new-chat decision, not a silent fix.
- Throw a single user-facing sentence, e.g. `OCT: the opencode session
  for this chat was deleted — start a new Copilot chat and try again.`
  (exact wording at implementation; one sentence, no error dump).
- Log the session id + key for diagnostics (output channel, not chat).

## Out of Scope

- Auto-recreate / history replay (explicitly rejected by user).
- Ask-user-to-choose modal (rejected — no modal fatigue).
- Prune-on-start (T-0012).

## Dependencies / Inputs

- `src/provider/streaming.ts`, `src/server/client.ts` (`OctHttpError`),
  `src/provider/octProvider.ts` turn path, `src/provider/sessions.ts`
  (`forget`).

## Acceptance Criteria

- [x] Turn on a deleted session → chat shows exactly the one sentence;
    mapping dropped (next turn creates fresh, per T-0012/startup state).
- [x] Repeat turns in the same dead chat repeat the notice (no silent
  amnesiac session; persisted dead-conversation marker).
- [x] Non-404 errors unchanged (real error still surfaces).
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (typed 404 preserved through admission in
  `streaming.ts`; gone-branch with `forget` + one-sentence chat report in
  `octProvider.ts`; `DELETED_SESSION_MESSAGE` const).
- Tests: VERIFIED (`npm test` 39/39 green 2026-10-04: message-shape test +
  admission-failure race test at 60ms; `npx tsc --noEmit -p ./` exit 0).
- Runtime/manual verification: VERIFIED (EDH user-run 2026-10-04: sentence
  rendered, mapping dropped. Two follow-up defects from that run, both
  fixed + tested: (1) admission failure parked the turn on a quiet stream
  until timeout — prompt admission now joins the event race, exits fast;
  (2) throwing rendered the sentence twice with a stack trace — the branch
  now reports the sentence as chat text, B-0005 denial precedent).
- Follow-up (EDH user-run 2026-10-04): retrying in the same dead chat
  silently opened a fresh amnesiac session, and "try again" wrongly implied
  retry could work. Fixed: `markDead`/`isDead` persisted marker repeats the
  notice on every later turn; message shortened to end at "new Copilot
  chat". `npm test` 42/42. User-verified live 2026-10-04 (delete → notice
  → retry → same notice).

## README Impact

None expected (chat-visible sentence, no setup change).
