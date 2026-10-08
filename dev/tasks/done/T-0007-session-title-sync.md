# T-0007 — Session title and sync

## Status

COMPLETE (verified 2026-10-02; commit pending)

## Objective

Give every bridged engine session a meaningful title and make the
conversation→session map inspectable: derive the engine title from the
conversation's first user message, allow retitling on topic drift, and extend
`OCT: Show Status` into a session list with existence checks.

## Why

Every session is still created as "OCT Copilot chat" (`OctSessionMap.create`),
so the engine's session list is an undifferentiated wall, and the only map
visibility is a count in the output channel. T-0006 proved long tool turns
work; operators now need to tell sessions apart and confirm reuse.

## In Scope

- Title derivation: first user message text (truncated ~60 chars, whitespace
  collapsed) set at session create; fallback is a unique
  `OCT: <key8> <MM-DD HH:mm>` (8-char conversation-key suffix + create-time
  stamp, e.g. `OCT: 4506f33d 10-02 10:42`) when empty. Retitle via `PATCH /api/session/:id` when a later turn clearly
  starts a new topic? No — keep create-time only (retitle-on-drift is
  guessing; explicit command instead).
- `OCT: Show Status` lists mapped conversations: key prefix, session id,
  engine title, existence (verified lazily as today, no new polling).
- New `src/server/client.ts` helpers: `listSessions` (`GET /api/session`),
  `updateSession` (`PATCH /api/session/:id {title?}`).
- Prune-on-list: 404 entries are dropped from the persisted map during the
  status pass (same remap philosophy as B-0001, operator-initiated).

## Out of Scope

- Background reaper / session deletion (still out; sessions.ts comment stands).
- Retitle-on-topic-drift heuristics.
- Surfacing titles in the Copilot Chat UI (provider API exposes no title
  channel; engine-side titles only).
- Tests for the new helpers (tests are a separate M2 task).

## Dependencies / Inputs

- `src/provider/sessions.ts` (map, create path, first-message extraction).
- `src/server/client.ts`, `src/server/manager.ts` (state shape).
- `src/extension.ts` status command, `src/output.ts`.
- B-0001 record (persistence + 404-remap philosophy).

## Allowed Product Files / Areas

- `src/server/client.ts` (list/update helpers + types)
- `src/provider/sessions.ts` (title derivation, prune helper)
- `src/extension.ts` (status list rendering)
- `package.json` (no config expected; only if a title-length setting proves necessary)

## State Synchronization Files

- `dev/tasks/T-0007-*.md`
- `dev/roadmap.md`
- `dev/now.md`
- `README.md` (one line on session titles if user-visible behavior changes)

## Acceptance Criteria

- [x] New conversation's engine session carries a title derived from its first user message (verified via `GET /api/session/:id` or list).
- [x] Empty/attachment-only first message falls back to a unique `OCT: <key8> <MM-DD HH:mm>` title (no crash, no empty title, distinct per conversation).
- [x] `OCT: Show Status` lists each mapped conversation with session id + engine title; dead (404) entries are pruned with a log line.
- [x] 1:1 reuse untouched (B-0001 map behavior + persistence intact).
- [x] `npx tsc --noEmit -p ./` passes; EDH check (create chat → title set → status lists → reload → map + titles persist).

## Implementation Notes

Engine endpoints (protocol `session.ts` group): `GET /api/session` (list),
`PATCH /api/session/:sessionID` (`{title?}`), both already used in adjacent
forms by `getSession`. Title length: cap ~60 chars; the engine stores it as
`Session.Info.title`. `conversationKey` already extracts the first user
message — reuse that extraction for the title source.

## Verification

Commands:

```text
npx tsc --noEmit -p ./
npm run compile
```

Plus EDH: new chat with a distinctive first message → engine session shows
that title; status lists it; reload window → mapping + titles persist; delete
a session server-side → next status prunes it with a log line.

Expected result: titled sessions, inspectable map, tree clean except task/roadmap/now.md/README bookkeeping.

## Current Progress

- [x] Task started (2026-10-02); engine protocol verified (`session.list` + `session.update`)
- [x] Title derivation + create/update helpers
- [x] Status list + prune pass
- [x] EDH attempt 1 (2026-10-02, `C:\Users\warrior\Downloads\test`): reuse + reload-persist + prune PASS; title derivation FAIL (see Known Issues) → fixed, needs re-verify
- [x] EDH attempt 2 (2026-10-02): #1 title PASS (`"T7 alpha bravo <timestamp>"`); #2 attachment-only FAIL (title leaked `<attachments> <attachment id="oct-test.txt" filePath="c:\Us…`) → fixed, needs re-verify
- [x] EDH attempt 3 (2026-10-02): #1 + #2 PASS (attachment-only → `OCT Copilot chat`, no crash)
- [x] Unique fallback title (follow-up request: `OCT: <key8> <MM-DD HH:mm>` via `fallbackSessionTitle`; script-verified, `tsc` clean)

## Evidence

- Implementation: IMPLEMENTED (2026-10-02: `deriveSessionTitle`/`sessionTitleFromMessages` + `titleSeed` through `getOrCreate`; `listSessions`/`updateSession` in client; `snapshot`/`pruneBySessionIds` + status list in `OCT: Show Status`; fix 2026-10-02: unwrap `<userRequest>`, scan newest-first — see Known Issues)
- Tests: NOT RUN (tests are a separate M2 task per scope)
- Runtime/manual verification: VERIFIED (2026-10-02: `npx tsc --noEmit -p ./` + `npm run compile` exit 0; live engine checks against opencode v2.0.21 PASSED; EDH attempt 1: #4 reuse PASS, #5 reload-persist PASS, #3 prune PASS, #1 title FAIL → fixed; EDH attempt 2: #1 title PASS, #2 attachment-only FAIL → fixed via `stripAttachmentBlocks`; EDH attempt 3: #1 + #2 PASS; unique fallback `OCT: <key8> <MM-DD HH:mm>` script-verified — all acceptance criteria met)

## EDH Attempt 2 (2026-10-02, folder `C:\Users\warrior\Downloads\test`)

- #1 `T7 alpha bravo <timestamp>` → `ses_f03cbc34affeHlGV2BFfuoA4IR` titled `"T7 alpha bravo <timestamp>"` (PASS — `<userRequest>` fix confirmed).
- #2 attachment-only (`oct-test.txt`, no text) → `ses_f03c9aca8ffezomab52XVMEfeB` titled `"<attachments> <attachment id="oct-test.txt" filePath="c:\Us…"` (no crash PASS; fallback FAIL — userRequest inner is pure attachment markup, needs stripping).

## EDH Attempt 1 (2026-10-02, folder `C:\Users\warrior\Downloads\test`)

- #1 `T7 alpha bravo <timestamp>` → 1 mapped, but title `"<environment_info> The user's current OS is: Windows </envir"` (FAIL — first user message is Copilot global context, not the query).
- #4 `second turn reuse check` → still 1 mapped, same `ses_` id, title unchanged (PASS).
- Second conversation `T7 charlie delta <timestamp>` → 2 mapped, 65 engine sessions, both titles environment_info (same root cause).
- #5 reload → same 2 mapped with same titles (PASS).
- #3 `curl -X DELETE -u "opencode:t7verify" …/api/session/<id>` → `UnauthorizedError` (expected: managed password is random unless `oct.opencodePassword` is set; curl used a guessed password). Manual delete via opencode terminal → next status showed `(missing — pruned)` + second status dropped to 1 mapped (PASS).
- #2 attachment/empty case: no crash (PASS on crash-freedom; title was environment_info, same root cause).

## Known Issues / Blockers

- Title source bug (found EDH attempt 1, fixed 2026-10-02, needs re-verify): Copilot agent chats put global context (`<environment_info>` + `<workspace_info>` + memory) in the FIRST user message and the query in a LATER message as `<userRequest>…</userRequest>` (`agentPrompt.tsx`: `GlobalAgentContext` vs `AgentUserMessage`, default `userQueryTagName = 'userRequest'`). `sessionTitleFromMessages` used the first user message, so every title was the OS string. Fix: `extractUserPromptText` prefers `<userRequest>` (`user_query`/`userquery` fallbacks), else strips known wrapper blocks; scan user messages newest-first, skip placeholder-only (`[Attachment omitted…]` / `[Tool …]`) candidates. Verified by script (`oct-t7-extract-check.js` in %TEMP%): query unwraps, context-only → default, multiline collapses.
- `conversationKey` hash fallback has the same first-message pollution, but `_conversationId` stays first so it rarely matters; left untouched (scope control).
- Attachment-title leak (found EDH attempt 2, fixed 2026-10-02, needs re-verify): attachment-only turns carry `<attachments><attachment id filePath>…` inside `<userRequest>`, so the unwrapped prompt was raw markup. Fix: `stripAttachmentBlocks` removes `<attachments>…</attachments>` / `<attachment…>` blocks from both extraction paths; text+attachment keeps the text, attachment-only yields "" → default title. Verified by script (attachment-only → default, text+attachment → text).

## README Impact

One line if titles become user-visible behavior (they show in engine-side
listings only; likely a minor note).

## Commit Checkpoint

Suggested commit message:

```text
feat: derive engine session titles and list synced sessions
```

Commit status:

```text
UNCOMMITTED
```

## Handoff Notes

After this task, remaining M2 is tests + VSIX. The `listSessions` helper
added here will serve any future diagnostics UI.
