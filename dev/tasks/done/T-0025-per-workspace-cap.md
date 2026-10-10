# T-0025 — Per-workspace session cap

## Status

VERIFIED (M5, 2026-10-10 — owner EDH PASS)

## Objective

Enforce `oct.maxSessions` per workspace directory group instead of globally; `unknown` is its own group.

## Why

User-scoped M5 item 3. One busy folder currently evicts mappings of other folders.

## Design

- Group key: `Entry.directory ?? "unknown"` (reuse `groupSnapshotsByDirectory`, `UNKNOWN_DIRECTORY_GROUP` in `src/provider/sessions.ts`).
- `create()` + `restore()` enforce cap per group; `chooseEvictionKey` gains optional group filter (pure, unit-tested).
- Dead-first still holds within the victim group only.
- Persisted shape unchanged (entries carry `directory`); restore migrates v1 rows without directory into `unknown`.

## In Scope

- `src/provider/sessions.ts` per-group cap + migration
- Unit tests: per-group eviction, dead-first-per-group, restore overflow per group, unknown group
- Status/table per-group counts (display only)

## Out of Scope

- Table webview itself (T-0027); cleanup change (T-0026)

## Acceptance Criteria

- [x] Filling group A past cap never evicts group B
- [x] `npm run lint` + `npm test` green

## Evidence

IMPLEMENTED + TESTED 2026-10-10:
- `src/provider/sessions.ts`: `directoryGroupKey()` shared by cap + display; `chooseEvictionKey(keys, dead, groupOf?, victimGroup?)` filters to victim group; `create()` counts/evicts within new entry's group only (dead-first in-group, log includes `[group]`); `restore()` tracks per-group counts, v1 rows without directory migrate to `unknown`; header + `maxEntries` comments updated to per-group.
- `src/config.ts` + `package.json`: `oct.maxSessions` docs now say "per workspace directory group".
- `test/sessions.test.ts`: fixed 3 legacy fixtures to same-group (stored `directory: D:\work` matching `deps.directory`); added 12 tests — `directoryGroupKey` (2), `chooseEvictionKey` group filter (4), create-time per-group (3: cross-group isolation, dead-first-in-group, unknown group), restore-time per-group (3: two full groups, tail-drop, v1 unknown migration).
- `npm run lint` green (`check` + `compile-tests`).
- `npm test` green: 159/159 (was 147/147; +12 new).
- `npm run compile` green.
- Status display unchanged (already per-group via `groupSnapshotsByDirectory` — display-only requirement met, no code change).
- EDH PASS (owner, 2026-10-10, `oct.maxSessions: 2`, folders `test2` + `test3`):
  - A: `[test2]` A1 (`ses_eda5d7…`) + A2 (`ses_eda5b7a…`), `[test3]` B1 (`ses_eda598…`) + B2 (`ses_eda58e…`) — 2+2 with cap 2 (per-group, not global).
  - B: after A3 (`ses_eda577…`), `[test2]` holds A2 + A3 (A1 evicted), `[test3]` still B1 + B2 untouched (victim-group-only eviction).
  - C: reload stable (same 2+2 map).
