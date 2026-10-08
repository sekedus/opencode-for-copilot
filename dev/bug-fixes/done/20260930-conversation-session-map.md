---
type: bug-fix
id: B-0001
title: "Conversation→session map collision and reload loss"
status: resolved
date: 2026-09-30
task: T-0003
severity: high
---

# Bug Fix — Conversation→session map collision and reload loss

## Summary

Two defects in the 1 conversation = 1 session mapping: different Copilot chats with the same opening text shared one opencode session, and any window reload dropped the map so the same chat forked a new session.

## Affected Area

- `src/provider/sessions.ts`
- `src/provider/octProvider.ts`
- `src/server/client.ts`
- `src/extension.ts`

## Observed Behavior

1. Chat A and chat B (separate Copilot conversations) opened with identical first text reused the same opencode session id in output logs.
2. After a window reload, continuing the same Copilot conversation created a fresh opencode session instead of reusing the prior one.

## Expected Behavior

1. Different Copilot chats map to different opencode sessions.
2. The same Copilot conversation reuses its opencode session across window reloads while that session still exists on the server.

## Reproduction

Collision:

1. Open Copilot chat A with an OCT model, send e.g. `hello`.
2. Note `Turn on <id>` / `Conversation <key> mapped to session <id>` in OCT output.
3. Open a new Copilot chat B, send the same first text.
4. Actual: same session `<id>` reused. Expected: a different session.

Reload loss:

1. In one Copilot chat, send a turn; note the session id.
2. Reload the window.
3. Send a follow-up in the same chat.
4. Actual: a new session created. Expected: the prior session reused.

## Impact

Cross-chat context mixing (one chat saw another chat's server-side history) and session sprawl plus lost continuity after every reload.

## Root Cause

1. `conversationKey()` had no stable chat id, so it fell back to `hash(directory + model + first message)`. Identical openers collide. The public provider API exposes no conversation id, but Copilot routes extension models through `ExtensionContributedChatEndpoint`, which forwards its per-chat id as `modelOptions._conversationId` — that entry was never read.
2. `OctSessionMap` was in-memory only. The provider is reconstructed on `activate()`, so every reload started with an empty map.

## Fix

Commit `7d1e895`:

- `conversationKey()` reads `modelOptions._conversationId` first, then the prior explicit-id candidates, then the message-hash fallback.
- Map persisted to `context.globalState` (`oct.conversationSessions.v1`): save on create/model-switch/evict/404-remap, restore with shape validation under the LRU cap 50.
- Restored entries verified once per window via new `GET /api/session/:id` (`getSession`): 404 drops the entry and creates a fresh session; non-404 keeps the mapping so the turn surfaces the real error instead of forking a duplicate.
- `clear()` drops in-memory state only, so provider dispose does not wipe reload reuse.
- Wiring: `OctChatProvider` accepts `sessionStore`, `activate()` passes `context.globalState`.

Do not paste large code blocks here. Link to files, commits, tests, or ADRs instead.

## Security Impact

No credential or secret handling changed; password never logged. Persisted entries are local `globalState` (same user, same machine) holding opaque session ids and `conv:`/`hash:` keys only. The fix restores the privacy boundary between chats (no cross-chat history mixing).

## Verification

- `npx tsc --noEmit -p ./` exit 0.
- Diff review of `7d1e895` (key order, restore/verify/persist paths, wiring).

Result:

Type-check passes. Live Extension Development Host check (two chats → two sessions; reload → same session; deleted-session → clean remap) not yet recorded.

## Regression Risk

- Stale entry if the server DB was wiped: mitigated by 404-remap on first use.
- Server unreachable/auth failure on verify: mapping kept, turn reports the underlying error, no duplicate fork.
- Corrupt storage payload: skipped entry-by-entry, restore never throws.
- `clear()` semantics changed (storage survives): intended for reload reuse; a true wipe requires clearing `globalState`.

## Prevention / Lesson

- Never use message-text hash as the primary conversation key; an opaque per-chat id (`_conversationId`) must stay first in `conversationKey()`.
- Any future in-memory id map that must survive reloads follows the same pattern: persist to `Memento`, validate on restore, verify server-side existence once before reuse.

## Related Records

- Task: `dev/tasks/T-0003-chat-provider-sessions.md`
- ADR: `docs/adr/0001-oct-bridge-architecture.md`
- Commit: `7d1e895`

## Follow-up

- Record live verification (two-chat isolation, reload reuse, 404 remap) once run in the Extension Development Host.
