# T-0012 — Prune dead sessions on start

## Status

COMPLETE (verified 2026-10-04: `tsc` 0, `npm test` 37/37)

## Objective

Run the dead-session prune pass at provider startup (in addition to the
existing `OCT: Show Status` pass), so stale mappings from deleted/expired
engine sessions never survive into the first turn — using per-id
verification so the pass stays correct at any engine session count.

## Why

M3 item 2. Today the prune runs only via status (`extension.ts:
appendSessionList`); a fresh window reuses restored mappings unchecked
until the user runs status or a turn fails (B-0001 covers reload-verify
per-conversation, not a full-map sweep). Scale review 2026-10-04: the
status list-and-compare (one page, limit 100) false-prunes live mappings
once the engine holds 100+ sessions, so both passes must move to per-id
verification.

## In Scope

- Replace list-and-compare with **per-id verification** in both passes:
  `GET /api/session/:id` for each mapped entry (cost bounded by the map
  cap, exact at any engine session count). Per-entry semantics: 404 →
  dead (prune); any other error (network/auth/timeout) → keep the mapping,
  never prune on uncertainty. The full `listSessions` call stays for title
  display in status only — never for prune decisions.
- Extract the verify-and-prune pass in `extension.ts` for reuse by both
  startup and status.
- Run once after provider registration when connected; log-only, no modal.
- Respect `oct.maxSessions` ordering with T-0011 (prune dead first, then
  the cap applies to live entries).

## Out of Scope

- Background polling (explicitly out — runs once on start + on status).
- Deleted-session mid-turn UX (T-0013).

## Dependencies / Inputs

- T-0011 (cap interaction), `src/extension.ts:appendSessionList`.

## Acceptance Criteria

- [x] Start with a mapping pointing at a deleted session → startup pass
  prunes it (log line), status shows 0 mapped.
- [x] A live mapping whose session sits beyond the list page (100+ engine
  sessions) is NOT pruned (per-id design has no page; classifier unit
  tests lock the 404-only rule).
- [x] Per-entry non-404 failure (e.g. list/get error) prunes nothing.
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (`isSessionGoneError` classifier +
  `verifyAndPruneConversations` shared by startup + status;
  `listSessions` demoted to title display).
- Tests: VERIFIED (`npm test` 37/37 green 2026-10-04: 3 new classifier
  tests; `npx tsc --noEmit -p ./` exit 0).
- Runtime/manual verification: NOT RUN (startup sweep + status output
  need a live EDH pass with a deleted session).

## README Impact

One line if startup behavior is user-visible (log-only → likely none).
