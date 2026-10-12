# T-0026 — Cleanup engine sessions of deleted Copilot chats

## Status

CANCELLED (M5, 2026-10-10 — owner decision; blocked upstream, parked as PL-0007; no code changes, no verification required)

## Objective

When running `oct.cleanupOrphans`, if the Copilot chat behind a mapping is deleted, delete the mapped opencode engine session too (behind the same Delete confirmation).

> Goal correction 2026-10-12: the objective as first recorded (delete engine sessions for dead/dropped-marked chats) was the agent's misunderstanding of the user's request. The actual ask is Copilot-chat-deletion-driven cleanup. The dead/dropped retired-mapping semantics from T-0013/T-0019 stand as-is and are a separate concern.

## Why

User-scoped M5 item. Engine sessions whose Copilot chat was deleted stay alive on the server forever; cleanup should reclaim them. (Graveyard-only cleanup covers dropped mappings, not deleted chats.)

## Design

- Candidates = graveyard (`orphanedSessions()`) + mapped engine sessions whose Copilot chat no longer exists (requires a provider-visible chat-deletion/listing signal that VS Code does not currently expose).
- Flow stays: `getSession` classify (alive/already-gone/unreached) → dry-run log → Delete/Cancel → `deleteSession` → clear on success-or-404.
- Never touches unmapped CLI sessions; failures/unreachable kept. Still opt-in, never automatic.

## In Scope

- `src/extension.ts` `cleanupOrphansCommand` + thin `OctSessionMap` accessors
- Unit tests for candidate union + clear-on-resolve
- EDH: create → delete Copilot chat → cleanup deletes engine id

## Out of Scope

- Auto-delete (still opt-in); per-group cap (T-0025)

## Acceptance Criteria

- [ ] Deleted-chat engine sessions appear in dry-run and delete on confirm
- [ ] `npm run lint` + `npm test` green + EDH cleanup green

## Evidence

CANCELLED 2026-10-10 at owner's request; goal corrected 2026-10-12 (see Objective). Blocked upstream: VS Code exposes no Copilot chat list or deletion signal to `LanguageModelChatProvider` providers — the provider only learns a chat exists when a turn is routed to it, so "chat deleted" is undetectable and the cleanup cannot distinguish deleted chats from idle ones. Parked as PL-0007 until such an API exists. Task never entered implementation: no source/test changes, nothing to verify. `oct.cleanupOrphans` keeps its current graveyard-only scope; T-0013/T-0019 retired-mapping semantics (dead/dropped marks + start-a-new-chat notices) are untouched.
