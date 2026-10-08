# T-0008 — Unit tests (harness + pure-logic coverage)

## Status

COMPLETE (verified 2026-10-02: `npm test` 32/32 green; commit pending)

## Objective

Add a zero-dependency unit-test harness (`node:test`, no new packages) and
cover the pure logic that EDH already caught two bugs in: session-title
derivation/extraction/fallback, the conversation map (key derivation, LRU,
persistence round-trip, prune/forget), and message text conversion.

## Why

T-0007's `<environment_info>` and `<attachments>` title bugs were found by
hand-rolled `%TEMP%` scripts. A committed harness makes those regressions
impossible and gives the VSIX task a green gate.

## In Scope

- `test/tsconfig.tests.json` (compiles `src` + `test` to `out-test/`, main
  build untouched: `main` stays `./out/extension.js` from `src` only).
- `test/vscode-mock.mjs` + `test/register-loader.mjs`: `module.register()`
  resolve hook mapping bare `vscode` imports to the mock (mock mirrors real
  enum values: `LanguageModelChatMessageRole.User = 1`, `Assistant = 2`;
  stub output channel / memento-shaped fakes live in the test files).
- `test/sessions.test.ts`: `deriveSessionTitle`, `extractUserPromptText`
  (userRequest unwrap, wrapper stripping, attachment cases, EDH regressions),
  `fallbackSessionTitle` (format, per-conversation uniqueness),
  `sessionTitleFromMessages` (newest-first, placeholder skip, "" fallback),
  `conversationKey` (`_conversationId` priority, hash fallback),
  `OctSessionMap` (getOrCreate fast path, LRU cap, fake-Memento persistence
  round-trip, 404-remap needs HTTP — covered via injected stub? No: out of
  scope, see below).
- `test/messages.test.ts`: `partText` / `messageText` / `buildPromptText`
  (text, tool-call/result placeholders, data-part placeholder, empty).
- `package.json` scripts: `compile-tests`, `test` (compile + `node --test`
  with the loader).
- `.gitignore`: add `out-test/`.

## Out of Scope

- HTTP-touching paths (`verify` 404-remap, `ensureModel`, client helpers —
  need fetch stubs; separate task if wanted).
- Streaming / shuttle / permissions / provider turns (EDH-covered).
- EDH or VSIX work (separate M2 task).
- Vitest or any new dependency (decision: `node:test`, Node 20+ built-in).

## Dependencies / Inputs

- `src/provider/sessions.ts`, `src/provider/messages.ts`.
- `dev/project.md` test-tools line (update to the decision).
- Node v22.23.1 (repo runtime; `module.register` available).

## Allowed Product Files / Areas

- `test/` (new)
- `package.json` (scripts only)
- `.gitignore` (`out-test/`)

## State Synchronization Files

- `dev/tasks/T-0008-*.md`
- `dev/roadmap.md`
- `dev/now.md`
- `dev/project.md` (test-tools decision line)

## Acceptance Criteria

- [x] `npm test` runs green from a clean tree (compile tests + `node --test`).
- [x] EDH regression cases committed: `<environment_info>` titles,
  `<attachments>` leak, newest-first query selection.
- [x] `npx tsc --noEmit -p ./` still passes; `npm run compile` output unchanged.
- [x] No new runtime/dev dependencies (`git diff package.json` shows scripts only).

## Implementation Notes

- `module: node16` output uses `require("vscode")` in compiled `src`; ESM
  resolve hooks do NOT intercept CJS `require`, so the harness uses a
  `NODE_PATH` shim instead (`test/shims/node_modules/vscode` → mock,
  wired by `test/run.mjs`, which also keeps `npm test` working under
  cmd/sh/PowerShell without a new dependency).
- `partText` uses `instanceof` against vscode classes — the mock must export
  real classes, and tests must construct them (not plain objects).
- `OctSessionMap` takes an optional `vscode.Memento` — a `{get, update}`
  fake suffices; `logLine` needs the mock output channel.
- Keep the mock surface minimal: only what imported modules touch.

## Verification

Commands:

```text
npm test
npx tsc --noEmit -p ./
npm run compile
```

Expected result: all suites green; main build byte-identical behavior
(`out/` contents unchanged apart from rebuild).

## Current Progress

- [x] Task scoped (2026-10-02)
- [x] Harness (tsconfig + mock + shim + runner + scripts)
- [x] sessions.test.ts (19 checks: titles, keys, map)
- [x] messages.test.ts (13 checks: parts, text, prompt)
- [x] `npm test` green (32/32) + docs sync

## Evidence

- Implementation: IMPLEMENTED (`test/vscode-mock.mjs` + `test/shims/node_modules/vscode` NODE_PATH shim + `test/run.mjs`; `test/tsconfig.tests.json` → `out-test/`; `test/sessions.test.ts`, `test/messages.test.ts`)
- Tests: VERIFIED 2026-10-02 (`npm test`: 32 pass, 0 fail; 9 suites)
- Runtime/manual verification: VERIFIED (main `tsc --noEmit` + `compile` exit 0; `package.json` diff scripts-only, no new deps)

## Known Issues / Blockers

- None.

## README Impact

None expected (internal harness; no user-visible behavior).

## Commit Checkpoint

Suggested commit message:

```text
test: add node:test harness with session and message units
```

Commit status:

```text
UNCOMMITTED
```

## Handoff Notes

After this task, remaining M2 is VSIX packaging (plus the standing OPEN:
EDH redo with image workspace + Steps 3–8).
