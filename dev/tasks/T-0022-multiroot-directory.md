# T-0022 — Per-folder workspace directory (PL-0003, multi-root)

## Status

COMPLETE (2026-10-07: implemented + unit/live verified + EDH green)

## Objective

Resolve the workspace directory per chat (not `workspaceFolders[0]`) so
multi-root chats map under their own folder and the T-0017 status groups
split correctly.

## Why

M4 scope; promotes PL-0003. T-0017 EDH Step 3 proved it: `Add Folder to
Workspace` kept all chats in one group because `workspaceCwd()`
(`src/extension.ts:19-22`) always uses the first folder.

## In Scope

- Per-chat folder resolution at turn time (decide: Copilot message
  context vs active editor vs first folder fallback) — needs a short
  design note in the task before implementing.
- Single-folder behavior byte-identical (existing tests + EDH).
- Map `directory` + status grouping follow the resolved folder; old
  entries keep their stored directory.
- Unit tests for resolution fallback chain; multi-root EDH (two groups).

## Out of Scope

- Workspace-scoped map storage (still needs its ADR — unchanged).
- Anything in the tool bridge or approvals.

## Dependencies / Inputs

- PL-0003, `src/extension.ts` (`workspaceCwd`), `src/provider/sessions.ts`
  (`Entry.directory`, T-0017 grouping), T-0011 cap semantics.

## Design (proposed 2026-10-07, awaiting confirm)

Resolution chain per turn (first hit wins; only values from
`workspace.workspaceFolders` are ever returned, so traversal is impossible
by construction — see `dev/constraints.md`):

1. **Message context** — extract `filePath="..."` from Copilot message text
   (`<attachment>` blocks, same markup `extractUserPromptText` already
   strips in `src/provider/sessions.ts:349-377`). First path falling inside
   a known open folder wins (longest-prefix, case-insensitive drive,
   separator-boundary). Rationale: an explicit attachment is the strongest
   intent signal — beats ambient editor when the user chats about folder B
   while editing folder A.
2. **Active editor** — `window.activeTextEditor.document.uri.fsPath` mapped
   via the same folder-prefix match. Rationale: reflects where the user
   works; available every turn even with no attachments.
3. **First-folder fallback** — `workspaceFolders[0]`, canonicalized via the
   existing `canonicalDirectory` (`src/extension.ts:33-47`, B-0002 drive-case
   fix). Single-folder workspaces land here (or steps 1–2 return the same
   folder) → byte-identical behavior. No open folder → `process.cwd()`
   (current `workspaceCwd` last resort); empty → `undefined` (entry without
   directory, group `unknown` — current T-0017 compat).

Pinning: the resolved directory is used for `conversationKey` (hash fallback
input) + `sessionDeps` at **create time only**. Reused turns ignore it
(`getOrCreate` never rewrites `Entry.directory`) — switching editors
mid-chat must not move a live mapping. Old entries keep their stored
directory (no migration).

Purity/testability: `resolveChatDirectory({ messagePaths, activeEditorPath,
workspaceFolders })` (pure) + `extractMentionedPaths(messages)` (scans
`messageText` for `filePath="([^"]+)"`) live in `sessions.ts` (directory
source only); thin VS Code glue (`resolveTurnDirectory(messages)`) lives in
`extension.ts` next to `workspaceCwd`. Server manager `cwd` stays
`workspaceCwd()` (process-wide); only session-create `location.directory`
goes per-chat. `listModels` keeps the static directory (server-wide list).

Wiring needs one `octProvider.ts` turn-path edit (resolve → key +
sessionDeps + instruction-blocked error names the resolved dir) — requests
adding it to Allowed below.

Tests: resolver (message > editor > fallback; single-folder identical;
no-folder → undefined; case-insensitive/longest-prefix/garbage ignored);
extractor (attachment-only, mixed text+attachment, none); one provider
round-trip (two `_conversationId`s in different folders create with
different directories — fetch-capture pattern from T-0021).

EDH: two-folder workspace (`Add Folder`): chat on a file from A → group A,
chat on a file from B → group B (`OCT: Show Status` shows two groups);
single-folder rerun unchanged.

## Allowed Product Files / Areas

- `src/extension.ts`
- `src/provider/sessions.ts` (directory source only)
- `src/provider/octProvider.ts` (turn wiring only: resolve per turn → key +
  sessionDeps + instruction-blocked dir; requested by design — per-chat is
  impossible without touching the turn path)
- `test/...`

## Acceptance Criteria

- [x] Two-folder EDH: chats group under their own folders.
- [x] Single-folder behavior unchanged (tests + EDH).
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (2026-10-07: `resolveChatDirectory` + `extractMentionedPaths` + `canonicalDirectory` in `sessions.ts`; `resolveTurnDirectory` glue in `extension.ts`; per-turn wiring in `octProvider.ts` incl. instruction-blocked dir; B-0002 drive-colon fallback fixed `slice(2)` → `slice(1)`)
- Tests: TESTED (`tsc` 0, `npm test` 128/128 incl. 3 extractor + 7 resolver + 1 provider multi-root round-trip with reuse-pinning)
- Runtime/manual verification: VERIFIED (2026-10-07, user-run two-folder EDH: chat A → `[C:\Users\warrior\Downloads\test]` 1 conv `ses_eeae4a…` age 57s; chat B → `[C:\Users\warrior\Downloads\test3]` 1 conv `ses_eeadf6…` age 30s; same-chat re-turn reuses `ses_eeae4a…` with no fork and no move. Single-folder covered by unit fallback tests + step-3 single-group run.)

## README Impact

Status-grouping note gains the multi-root sentence.

## Commit Checkpoint

Suggested commit message:

```text
feat: per-chat workspace directory for multi-root
```

Commit status:

```text
UNCOMMITTED
```
