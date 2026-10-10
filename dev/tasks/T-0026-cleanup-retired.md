# T-0026 — Cleanup retired engine sessions

## Status

PLANNED (M5, 2026-10-10)

## Objective

Extend `oct.cleanupOrphans` to also delete engine sessions for retired Copilot chats (dead/dropped marks), 404-checked, behind the same Delete confirmation.

## Why

User-scoped M5 item 2. Graveyard-only cleanup leaves engine sessions for deleted/dropped chats alive. VS Code exposes no Copilot chat list to providers, so retired marks are the gone-signal (user decision 2026-10-10).

## Design

- Candidates = graveyard (`orphanedSessions()`) + engine ids for `isDead`/`isDropped` keys (via `droppedSnapshot()` + mapped snapshot for dead keys).
- Flow stays: `getSession` classify (alive/already-gone/unreached) → dry-run log → Delete/Cancel → `deleteSession` → `clearOrphaned` + prune retired marks only on success-or-404.
- Never touches unmapped CLI sessions; failures/unreachable kept.

## In Scope

- `src/extension.ts` `cleanupOrphansCommand` + thin `OctSessionMap` accessors
- Unit tests for candidate union + clear-on-resolve
- EDH: create → retire (delete/evict) → cleanup deletes engine id

## Out of Scope

- Auto-delete (still opt-in); per-group cap (T-0025)

## Acceptance Criteria

- [ ] Retired-chat engine sessions appear in dry-run and delete on confirm
- [ ] `npm run lint` + `npm test` green + EDH cleanup green

## Evidence

None yet (PLANNED).
