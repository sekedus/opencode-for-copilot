# T-0030 — Model-switch regression (exist/dropped/deleted)

## Status

PLANNED (M5, 2026-10-10)

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

- [ ] `npm run lint` + `npm test` green; EDH exist/dropped/deleted switch-back green

## Evidence

None yet (PLANNED).
