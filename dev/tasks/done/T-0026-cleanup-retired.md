# T-0026 — Cleanup retired engine sessions

## Status

CANCELLED (M5, 2026-10-10 — owner decision; no code changes, no verification required)

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

CANCELLED 2026-10-10 at owner's request after goal review (retired-chat engine-session cleanup via dead/dropped marks; Copilot chat deletion itself is not observable through the provider API). Reason: the retired-mapping semantics are important and stand as-is — T-0013 (deleted session → dead mark, later turns repeat the start-a-new-chat notice) and T-0019 (dropped link → dropped record + graveyard, later turns repeat the link-dropped notice) deliberately contrast *session-gone* vs *link-gone*; folding retired sessions into the delete path would blur that distinction. Task never entered implementation: no source/test changes, nothing to verify. `oct.cleanupOrphans` keeps its current graveyard-only scope.
