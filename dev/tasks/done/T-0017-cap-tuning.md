# T-0017 — Cap tuning: default, evict-dead-first, status grouping

## Status

COMPLETE (2026-10-05)

## Objective

Make the session map usable at developer scale: raise the default cap,
evict dead mappings before live ones, and group the status list by
workspace so hundreds of mappings stay readable.

## Why

Scale review 2026-10-04. Default 50 churns for devs with dozens of
projects (each churn orphans an engine session — see T-0016); eviction
drops the oldest entry even when dead weight sits elsewhere in the map;
and a flat status list is unreadable past a few dozen entries.

## In Scope

- Default cap 50 → 200 (`package.json` default + `DEFAULT_MAX_SESSIONS`;
  `oct.maxSessions` still overrides; storage cost is a small JSON array).
- **Evict-dead-first**: when the cap is hit at create time, first drop
  entries already known dead (verified-gone without a server round trip
  where possible — e.g. entries flagged by a prior 404; no new network
  sweep inside create), then oldest-live as today.
- **Status grouping**: group mapped entries by workspace directory with
  age per entry. This needs the directory on the map entry: extend `Entry`
  with an optional `directory` field (backward-compatible with persisted
  v1 rows — restore already skips malformed rows, missing field = group
  "unknown"), populated at create time. Confirm the engine `time` field
  for age against a live `listSessions` response during implementation.

## Out of Scope

- Workspace-scoped map storage (needs an ADR first — separate decision).
- Orphan deletion (T-0016).

## Dependencies / Inputs

- T-0011 (cap it tunes), `src/provider/sessions.ts`, `src/extension.ts`
  status list, live `listSessions` shape for the age field.

## Acceptance Criteria

- [x] Fresh install default holds 200 (unit test on the default).
- [x] Cap hit with dead entries present → dead dropped first, live kept
  (unit test).
- [x] Old v1 persisted rows (no `directory`) restore fine.
- [x] Status shows directory groups + ages at 100+ mapped entries.
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (2026-10-05: default 200 in `sessions.ts` /
  `config.ts` / `package.json`; `chooseEvictionKey` dead-first in `create`
  without graveyard burial; `Entry.directory` stored at create + backward-
  compatible restore; status groups by directory with `time.created` ages,
  `listSessions` page 500).
- Tests: `npx tsc --noEmit -p ./` exit 0; `npm test` 73/73 green (58 prior +
  15 new: default-200 incl. package.json/config agreement, dead-first choice
  + create-time integration with fetch stub, v1-row compat, 120-entry
  grouping, `sessionCreatedMs`/`formatSessionAge`).
- Live engine check: `time: { created: <millis>, updated: <millis> }` +
  `location.directory` confirmed against `GET /api/session?limit=2` on
  opencode v2.0.21 (managed `serve` + password auth, 2026-10-05); age uses
  `time.created`, group source is the map entry directory ("unknown" when
  absent).
- EDH: VERIFIED (2026-10-05, user-run). Step 1 PASS (settings default 200).
  Step 2 PASS (2 chats, one `[C:\Users\warrior\Downloads\test]` group, ages
  `30s`/`12s`, no "age unknown"). Step 3 PASS on retry: Add-Folder keeps
  group single (workspace dir is `workspaceFolders[0]` — pre-existing,
  parked PL-0003); Open-Folder yields 2 groups (3 + 1) with ages.
  Step 4 PASS: cap-churn evicts oldest + buries
  (`ses_ef459c… orphaned`, `evicted oldest conversation (cap 2)`, status
  stays grouped). Step 5 dead-first unit-only (a dead-flagged key never
  occupies the map live — `forget` removes it in the same 404 path that
  calls `markDead` — so no live sequence reaches the branch; covered by
  unit tests). Step 6 PASS (groups persist across reload; cap restore to
  200 keeps current map; orphan cleanup `deleted 1, already-gone 0`).
- EDH finding, investigated, NOT a bug: with cap 2, a turn in charlie (whose
  mapping the restore-cap had dropped) created a fresh session instead of
  the T-0013 notice. Correct per design — the notice requires a 404-gone
  session (`isDead`/`isSessionGoneError`); charlie's engine session was
  still alive, only its mapping was absent, so the normal create path ran
  (same as LRU eviction since T-0011). Side observation parked as PL-0002:
  restore-cap drops bypass the graveyard (`ses_ef4577…`, `ses_ef456a…`
  leaked untracked) — pre-existing T-0011 behavior, needs a decision.

## README Impact

Settings line (`oct.maxSessions` default 200) + status section grouping note.
