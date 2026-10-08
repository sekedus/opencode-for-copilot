# T-0016 — Opt-in orphaned engine session cleanup

## Status

COMPLETE (verified 2026-10-05: `tsc` 0, `npm test` 58/58)

## Objective

Add an explicit `OCT: Delete Orphaned Engine Sessions` command that deletes
engine sessions the extension mapped but later dropped (eviction, forget,
prune) — with dry-run preview and confirmation, defaulting to deleting
nothing automatically.

## Why

Scale review 2026-10-04. Every forget/evict/prune path drops the *mapping*
but never deletes the engine session, and opencode has no TTL or auto-prune
(only explicit `DELETE /api/session/:id`). An active dev churning the LRU
cap accumulates dead sessions in `opencode.db` forever.

## In Scope

- **Graveyard**: when a mapping is dropped (eviction in `create`, `forget`,
  `pruneBySessionIds`), remember the session id in a bounded persisted
  list (e.g. cap 200, oldest-first; survives reloads via the same Memento).
  Entries already confirmed gone (404) need no graveyard entry.
- **Command** `oct.cleanupOrphans`: resolve graveyard ids against the
  engine (per-id GET — 404 = already gone, drop silently), show a
  dry-run count/list first, then a VS Code confirmation
  (`showWarningMessage` with explicit Delete action) before issuing
  `DELETE` calls. Remove ids from the graveyard on success or 404.
- Log-only summary (deleted N, already-gone M, failed K with ids).

## Out of Scope

- Automatic deletion of any kind (explicit command only — default off).
- Touching engine sessions that were never in our map (user's own CLI
  sessions are never candidates — graveyard membership is the allowlist).
- Background/scheduled cleanup.

## Dependencies / Inputs

- `src/provider/sessions.ts` (`forget`, `pruneBySessionIds`, create
  eviction), `src/server/client.ts` (needs a `deleteSession` wrapper for
  `DELETE /api/session/:id`), `src/extension.ts` (command registration),
  T-0012 (per-id verify shares the 404-means-gone rule).

## Acceptance Criteria

- [x] Evict/forget/prune adds the session id to the graveyard (unit test).
- [x] Command with an empty graveyard reports nothing to do (no modal).
- [x] Dry-run lists candidates; confirm deletes them engine-side and
  clears the graveyard; cancel deletes nothing.
- [x] A session never mapped by OCT is never listed, even if the engine
  holds thousands of them.
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (`deleteSession` → `"deleted"|"gone"` in
  `src/server/client.ts`; graveyard in `src/provider/sessions.ts`:
  `trackOrphaned` pure helper + `MAX_ORPHANED_SESSIONS` 200,
  `bury` on create-eviction + `forget` (default), `{ gone: true }` skip on
  the T-0013 404 path, no-add on `pruneBySessionIds`/`verify`-404 by
  404-confirmed contract; `orphanedSessions`/`clearOrphaned` accessors;
  `oct.cleanupOrphans` command in `src/extension.ts` with resolve →
  dry-run → Delete/Cancel → log-only summary; provider pass-throughs;
  `package.json` command contribution).
- Tests: VERIFIED (`npx tsc --noEmit -p ./` exit 0; `npm test` 58/58 green
  2026-10-05: 10 new — `trackOrphaned` add/dedupe/cap + graveyard
  forget/gone-skip/prune-skip/clear/persist/garbage. Eviction-*path*
  itself is HTTP-bound (`create()` needs the engine — harness excludes
  HTTP per T-0008); it shares the covered `bury()`, verified by review.
- Runtime/manual verification: VERIFIED (EDH 2026-10-05, user-run).
  Part 1 (empty graveyard): info + no modal.
  Part 2 (cap-churn orphan): `maxSessions: 1`, chat A → `ses_ef5902…`,
  chat B → eviction + `Session ses_ef5902… orphaned (mapping dropped)`.
  Part 3 (dry-run + Cancel): `2 candidate(s): ses_efb08d…, ses_ef5902…`
  (the first is a prior-window mapping legitimately evicted by the cap-1
  churn — OCT-mapped, dropped, never 404-confirmed); Cancel deleted
  nothing.
  Part 4 (Delete): `deleted 2, already-gone 0, failed 0, unreachable 0`;
  chat B's live session survived; re-run → graveyard empty.
  Part 5: cap restored to 50, map normal.
- Pre-existing worktree change (not T-0016): user's status-popup deletion
  in `statusCommand` kept as-is (see Worktree Note).

## README Impact

Short section: what counts as orphaned, the command, dry-run + confirm,
and the guarantee that unmapped sessions are never touched.

## Worktree Note (pre-existing, out of scope)

`src/extension.ts` carries the user's own uncommitted 1-line deletion
(status popup `showInformationMessage` removed from `statusCommand`;
Output-channel logging unchanged). Kept per user 2026-10-05 — not
reverted, not part of T-0016; commit boundary must account for it.
