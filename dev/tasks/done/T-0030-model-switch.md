# T-0030 — Model-switch regression (exist/dropped/deleted)

## Status

VERIFIED (M5, 2026-10-12 — owner EDH PASS)

## Objective

Prove switching to a Copilot model mid-chat never forks/deletes/resurrects the OCT mapping: exist reuses, dropped/deleted stay retired.

## Why

User-scoped M5 test item. Switching vendor means no OCT provider call; returning to OCT must see the same guard state.

## Design

- Unit: `isDead`/`isDropped` guards short-circuit before `getOrCreate` (0 fetches, notice text); `ensureModel` only fires on OCT→OCT `modelKey` drift, never on vendor switch.
- EDH: OCT chat → turn (note id) → switch picker to Copilot model → turn → switch back to OCT → turn reuses same id; repeat with dropped-key and dead-key chats (both repeat notice, create nothing).

## In Scope

- Regression tests (provider guard order, no-create-on-retired)
- EDH steps above

## Out of Scope

- Copilot-model behavior itself (host-owned)

## Acceptance Criteria

- [x] `npm run lint` + `npm test` green; EDH exist/dropped/deleted switch-back green (automated green 2026-10-12; EDH PASS 2026-10-12)
- [x] EDH exist/dropped/deleted switch-back green (owner report 2026-10-12: same id, dropped/deleted notices, no new session)

## HDT

REQUIRED — session reuse (1 conversation = 1 session) + session health UX (deleted/dropped notices) are runtime-only per `dev/verification.md`; unit tests cover guards only. PASSED 2026-10-12 (owner EDH reports below).

## Evidence

VERIFIED 2026-10-12:
- `npm run lint` PASS (`check` + `compile-tests`).
- `npm test` PASS 203/203.
- `npm run compile` PASS.
- No `src/`/`test/` changes in worktree for T-0030 (behavior already in `src/provider/octProvider.ts:195-209` guards + `src/provider/sessions.ts:787-794,1105-1206` reuse/`ensureModel`; existing `test/sessions.test.ts` dead/dropped coverage green).
- Owner probe 2026-10-12 (exist memory-split): 5-turn chat (1,2,5 OCT; 3,4 other vendor) — OCT gap confirmed, host transcript full.
- EDH PASS (owner, 2026-10-12): exist switch-back reuses same session id; dropped-key repeats the dropped-link notice; dead-key repeats the deleted-session notice; no new session created in any case.
