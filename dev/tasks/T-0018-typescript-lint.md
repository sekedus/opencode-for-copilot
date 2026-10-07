# T-0018 — TypeScript lint (strict flags, zero-dep)

## Status

COMPLETE (2026-10-05)

## Objective

Add a repeatable lint gate for TypeScript without new dependencies:
tighten `tsconfig.json` strictness and expose it as `npm run lint`.

## Why

M4 scope (user 2026-10-05). The repo has `tsc` + `node:test` but no lint
gate; `strict:true` is on, `noUnusedLocals`/`noUnusedParameters` are not.

## In Scope

- Enable `noUnusedLocals` + `noUnusedParameters` in `tsconfig.json`;
  fix the fallout (prefix intentionally-unused with `_` or remove).
- `package.json`: `lint` script (must stay green in CI-style runs).
- Document the gate in README setup block (one line).

## Out of Scope

- ESLint/Prettier adoption (zero-dep precedent from T-0008 holds unless
  `tsc` flags prove insufficient — separate decision).
- `noUncheckedIndexedAccess` (large fallout — separate task if wanted).

## Dependencies / Inputs

- `tsconfig.json`, `package.json`, `test/tsconfig.tests.json` (keep the
  test project compiling).

## Allowed Product Files / Areas

- `tsconfig.json`, `package.json`, `README.md`
- `src/...`, `test/...` (unused-code fallout only)

## Acceptance Criteria

- [x] `npm run lint` exists and exits 0 on a clean tree.
- [x] `npx tsc --noEmit -p ./` + `npm test` still green.
- [x] Deliberate unused local/param fails `npm run lint` (negative check).

## Evidence

- Implementation: IMPLEMENTED (2026-10-05: `noUnusedLocals` +
  `noUnusedParameters` in `tsconfig.json`; sole fallout was the unused
  `key` param on private `ensureModel` — removed at both call sites;
  `lint` = `npm run check && npm run compile-tests` (no duplicate tsc
  invocation, per user 2026-10-05); README setup line).
- Tests: `npm run lint` exit 0 clean; `npm test` 73/73 green. Negative:
  appended unused local fails `npm run lint` with TS6133 (exit 2);
  reverted, gate green again.

## README Impact

Setup block gains the `npm run lint` line.

## Commit Checkpoint

Suggested commit message:

```text
chore: typescript lint gate (strict unused checks)
```

Commit status:

```text
COMMITTED (04a6972)
```
