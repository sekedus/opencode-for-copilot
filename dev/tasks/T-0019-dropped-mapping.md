# T-0019 — Dropped-mapping completeness (PL-0002 + PL-0004)

## Status

COMPLETE (2026-10-05: implementation + units + EDH replay green)

## Objective

Close both dropped-mapping gaps with one persisted record: every dropped
mapping is remembered (conversation key → engine session id) so the
graveyard stays complete AND a returning chat is told the link was dropped
and to start a new Copilot chat — T-0013 shape (block, no silent
amnesiac fork).

## Why

M4 scope; merges PL-0002 + PL-0004 (both small, both the
same drop paths in `OctSessionMap`). T-0017 EDH proved the gaps: charlie
(`ses_ef4577…`) and test2 (`ses_ef456a…`) leaked untracked past the
restore-cap, and charlie's capped-out chat silently forked to a history-less
session.

## In Scope

- One persisted bounded record (e.g. `oct.droppedConversations.v1`,
  oldest-first, capped by `maxEntries`): written on create-eviction,
  `forget`, restore-cap drop, and prune. Kept for repeat notice (never
  auto-cleared — the retired chat keeps answering with the notice, same
  as `dead`).
- PL-0002 half: dropped ids join the orphan graveyard exactly like
  create-eviction/`forget` (nothing 404-confirmed is buried).
- PL-0004 half (user decision 2026-10-05: T-0013-like, not
  announce-and-continue): a turn for a recorded key reports one in-chat
  line (B-0005 precedent — chat text, not a throw) stating the session
  link for this chat was dropped and to start a new Copilot chat — and
  creates NOTHING. Retrying repeats the notice (record is kept, like
  `dead`); the chat is retired, a new chat is the only path. Wording must
  differ from `DELETED_SESSION_MESSAGE` (there the session is deleted;
  here the session usually still lives, only the link is gone). Never
  reuse the `dead` set itself (dead = session-gone; keep the two causes
  distinguishable in code and logs).
- Unit tests: drop→record→graveyard on all four paths; recorded key
  turns report the notice and create nothing, retry repeats; record never
  auto-clears; bounds respected.

## Out of Scope

- T-0013 semantics (deleted sessions stay hard-blocked — unchanged).
- Re-linking the old session (disk-backed LRU — far bigger design).
- Multi-root directories (PL-0003 / T-0022).

## Dependencies / Inputs

- PL-0002 (ordering question: `restore` runs before the graveyard loads —
  load graveyard first or queue burials until loaded), PL-0004,
  `src/provider/sessions.ts`, `src/provider/octProvider.ts` (notice path),
  T-0016 graveyard contract.

## Allowed Product Files / Areas

- `src/provider/sessions.ts`
- `src/provider/octProvider.ts` (retired-chat notice only)
- `test/sessions.test.ts`

## Acceptance Criteria

- [x] All four drop paths (create-eviction, `forget`, restore-cap drop,
      prune) record key→session id (unit test each).
- [x] Dropped ids appear in the graveyard; cleanup lists them (unit test —
      live drops bury; 404-confirmed prune records without burying).
- [x] First turn after a drop reports the start-new-chat notice and creates
      no session; retry repeats the notice (unit test at provider level).
- [x] Charlie-sequence EDH replay: cap 2, reload, turn in dropped chat →
      notice, map unchanged (no `ses_ef4422…`-style fork); cleanup then
      lists the old id.
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (`oct.droppedConversations.v1` key→id, `DROPPED_SESSION_MESSAGE`, provider retired-chat gate; `src/provider/sessions.ts`, `src/provider/octProvider.ts`)
- Tests: TESTED (`npm test` 84/84 2026-10-06, incl. 11 new T-0019 units: 4 drop paths, graveyard feeds, provider notice + retry, never-clears, bounds, garbage rows)
- Runtime/manual verification: VERIFIED (EDH replay 2026-10-05, user-run, cap 2):
  - Steps 1–2: no reload needed — new charlie chat evicted oldest live (alfa `ses_ef1b6a…`) with `orphaned` + `link dropped` + `evicted oldest conversation (cap 2)`; status held 2 mapped (bravo `ses_ef1b6435…`, charlie `ses_ef1b6089…`).
  - Step 3: reload → `Restored 2 conversation session mapping(s)` (already at cap, no further drop).
  - Step 4: turn in dropped alfa chat → PASS (retired notice, no fork; status map unchanged).
  - Step 5: cleanup dry-run listed the old id (`1 candidate(s): ses_ef1b6a…`) → `deleted 1, already-gone 1` (second already-gone is a stale pre-existing orphan, also cleared). Step 6: cap reset to 200 + reload done.
- `tsc` 0, `npm test` 84/84 re-verified at close-out.

## README Impact

Orphan section: restore-cap drops now tracked. Notice line for retired
chats (wording distinct from the T-0013 deleted-session sentence).

## Commit Checkpoint

Suggested commit message:

```text
feat: dropped-mapping record feeds graveyard and retired-chat notice
```

Commit status:

```text
UNCOMMITTED
```
