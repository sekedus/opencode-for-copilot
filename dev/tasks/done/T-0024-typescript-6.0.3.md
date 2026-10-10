# T-0024 — TypeScript 6.0.3 upgrade

## Status

COMPLETE (2026-10-10: implemented + automated green + human verification PASS)

## Objective

Pin `typescript@6.0.3` (exact), keep `tsc` + `lint` + `test` + `compile` green.

## Why

User-scoped M5 item 1. `npm view` confirms `6.0.2`/`6.0.3` exist; repo is on `^5.5.0`.

## In Scope

- `package.json` `typescript@6.0.3` (+ `package-lock.json` via `npm install`)
- Fix breaking changes (strictness, `noUnusedLocals`, module `node16`, `@types/vscode`/`vsce` compat)
- `npm run lint` + `npm test` + `npm run compile` green

## Out of Scope

- Any product logic change; TS 7.x jump

## Acceptance Criteria

- [ ] `npx tsc --version` reports 6.0.3
- [ ] `npm run lint` green, `npm test` green (count recorded), `npm run compile` green

## Evidence

- Implementation: `package.json` `typescript@^6.0.3` (installed 6.0.3, `npx tsc --version` = 6.0.3); `tsconfig.json` gains `"types": ["node"]` — TS 6 no longer auto-includes `@types/node`, without it `tsc` fails 60+ errors (`Buffer`/`process`/`fetch`/`setTimeout`/node: imports). `test/tsconfig.tests.json` already had `types: ["node"]`, which is why tests compiled.
- Tests: TESTED (`npm run check` 0, `npm run compile` 0, `npm run lint` green, `npm test` 147/147 green 2026-10-10).
- Human verification: PASS (user 2026-10-10) — VERIFIED.
- Runtime: no product-logic change (build-only); EDH reload smoke recommended before release packaging.
