# T-0011 — Configurable max stored sessions

## Status

COMPLETE (verified 2026-10-03: `tsc` 0, `npm test` 34/34)

## Objective

Replace the hardcoded 50-entry conversation→session cap with an
`oct.maxSessions` setting (default 50).

## Why

M3 item 1. Users with many chats hit silent LRU eviction (a mapping loss
that looks exactly like a deleted session on the next turn); users on
small machines may want a lower cap.

## In Scope

- `package.json`: `oct.maxSessions` (integer, default 50, minimum 1,
  reload-required like the other settings).
- `config.ts`: `OctSettings.maxSessions` with clamp (non-finite / <1 →
  default 50).
- `sessions.ts`: `OctSessionMap` honors the configured cap in restore +
  create eviction (constructor param, default 50 — existing call sites
  and tests keep compiling).
- `octProvider.ts` deps + `extension.ts` wiring (settings → provider).
- README settings line.

## Out of Scope

- Prune-on-start (T-0012), deleted-session UX (T-0013).

## Dependencies / Inputs

- `src/provider/sessions.ts` (`MAX_ENTRIES`), `src/config.ts`,
  `src/extension.ts`, `test/sessions.test.ts`.

## Allowed Product Files / Areas

- `package.json`, `src/config.ts`, `src/provider/sessions.ts`,
  `src/provider/octProvider.ts`, `src/extension.ts`, `test/sessions.test.ts`,
  `README.md` (settings line only)

## Acceptance Criteria

- [x] Setting `oct.maxSessions: 3` + 5 mapped conversations → map holds 3
  (unit test).
- [x] Invalid values (0, -1, NaN) fall back to 50, never crash. (Very large
  finite values are accepted as-is — no upper clamp by design.)
- [x] `npx tsc --noEmit -p ./` + `npm test` green.

## Verification

```text
npx tsc --noEmit -p ./
npm test
```

## Current Progress

- [x] Setting + config clamp
- [x] Session-map cap wiring
- [x] Unit test + README line
- [x] `tsc` + `npm test` green

## Evidence

- Implementation: IMPLEMENTED (`oct.maxSessions` setting + `OctSettings`
  clamp + `OctSessionMap` cap + provider/extension wiring + README line).
- Tests: VERIFIED (`npm test` 34/34 green 2026-10-03: 2 new cap tests;
  `npx tsc --noEmit -p ./` exit 0).
- Runtime/manual verification: NOT RUN (setting is reload-gated; live
  reload check deferred to EDH pass).

## README Impact

Settings line gains `oct.maxSessions`.

## Commit Checkpoint

Part of the M3 checkpoint (commit per task or batch — user decides).

Commit status:

```text
UNCOMMITTED
```
