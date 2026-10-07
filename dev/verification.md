# Verification Contract

> Status: initialized from repository evidence (2026-10-08, AAW 0.7.1).
> Corrected per verification-document audit (2026-10-08): vsce range,
> active dead key, partial-coverage gaps, `vsce ls` contents check.
> Every command below comes from `package.json` scripts, `test/` config,
> `.vscode/` tasks, `README.md`, or `dev/tasks/` evidence.
> Nothing is invented from framework convention.

## Purpose

Answer one question after any change:

> "I changed something. What should I check to prove that the project still works?"

This contract defines the checks that ACTUALLY exist in this repository,
what each one proves (and does NOT prove), and the minimum check set per change type.

Project shape reminder: VS Code extension (`src/`, TypeScript strict) +
bundled engine plugin (`plugin/oct-tools/index.js`, plain JS) +
zero-dependency `node:test` unit suite (`test/`). No database, no web UI,
no Docker, no Makefile.

## Automated Checks (CONFIRMED)

All commands run from the repository root. Evidence: `package.json` `scripts`
(+ `README.md` setup block, `dev/tasks/T-0018-typescript-lint.md`).

### 1. Typecheck — `npx tsc --noEmit -p ./` (alias: `npm run check`)

- What it runs: full TypeScript typecheck of `src/` with no output emitted
  (`tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `module node16`, `target ES2022`).
- Success: exit 0, no output.
- Proves: types are consistent and there is no dead local/parameter.
- Does NOT prove: runtime behavior, engine API compatibility, or that the
  extension activates in VS Code.
- When: after ANY `src/` or `test/` TypeScript change. Cheapest first gate.

### 2. Lint gate — `npm run lint`

- What it runs: `npm run check && npm run compile-tests`, i.e. the typecheck
  above PLUS compiling the test project (`test/tsconfig.tests.json`,
  which includes `../src` + `./*.test.ts` → `out-test/`).
- Success: exit 0 on a clean tree (T-0018 also proved the negative:
  an unused local fails with TS6133, exit 2).
- Proves: everything the typecheck proves, plus test sources still compile
  against current `src/`.
- Does NOT prove: that any test passes (it only compiles them).
- When: before considering any TypeScript change done. This project has
  NO ESLint/Prettier — this `tsc`-based gate IS the lint (explicit T-0018
  decision, zero-dep precedent from T-0008).
- NOT AVAILABLE as separate checks: ESLint, Prettier/format check,
  coverage thresholds.

### 3. Unit tests — `npm test`

- What it runs: `npm run compile-tests && node ./test/run.mjs`, which spawns
  `node --test` over the 6 compiled files in `out-test/test/` with
  `NODE_PATH` pointed at the committed `vscode` shim
  (`test/shims/node_modules/vscode/index.cjs` re-exports
  `test/vscode-mock.mjs`), so it works under
  cmd/sh/PowerShell with no extra dependency:
  `sessions`, `messages`, `streaming`, `models`, `permissions`, `images`
  (see `test/run.mjs` for the exact file list). Note: the
  `./loader-hooks.mjs` mentioned in the `vscode-mock.mjs` header comment
  does not exist in the repo; resolution uses the `NODE_PATH` shim above.
- Success: exit 0 with all tests green (latest baseline per task evidence:
  **147/147**, T-0023, 2026-10-07; concordant in `dev/roadmap.md`).
- Proves: pure/helper logic behaves as pinned — session map + eviction +
  titles + directories + ages, message/image conversion + caps,
  model mapping + Thinking Effort variants, permission/approval resolution,
  streaming/SSE handling — with `fetch` stubbed and `vscode` mocked.
- Does NOT prove: anything requiring a live engine (`opencode serve`),
  a real VS Code host, real Copilot tools, or the bundled plugin JS
  (`plugin/` has NO automated coverage — verified live only).
- When: after any `src/provider/*` logic change; required before any task
  is marked verified (per-task evidence in `dev/tasks/` consistently cites
  `tsc` 0 + `npm test` N/N).
- Prerequisites: `npm install` (needs `typescript` from `devDependencies`);
  Node 20+ (uses `node:test`, `node:child_process`, `Response`/`ReadableStream`
  globals in tests). No engine, no network, no VS Code instance needed.

### 4. Build — `npm run compile` (`tsc -p ./`)

- What it runs: compiles `src/` → `out/` (the actual extension runtime;
  `package.json` `main` is `./out/extension.js`). Also the default VS Code
  build task (`.vscode/tasks.json`) and the `preLaunchTask` for the
  Extension Development Host (`.vscode/launch.json`).
- Success: exit 0, `out/` populated. (`out/` is gitignored.)
- Proves: the shippable extension bundle compiles.
- Does NOT prove: that it activates, connects, or chats correctly.
- When: after `src/` changes when you need the real artifact (EDH run,
  packaging); `npm test` alone does NOT produce `out/`.

### 5. Packaging — `npm run package` (`vsce package`)

- What it runs: `@vscode/vsce@^4.0.0` (devDependency range, `package.json`)
  builds the VSIX
  (T-0009 baseline: 18 files / 48.51 KB; T-0010 baseline: 21 files / 59.01 KB;
  artifact `*.vsix` is gitignored).
- Success: exit 0, VSIX produced; installable via
  `code --install-extension opencode-for-copilot-0.1.0.vsix` (README).
- Proves: the extension packages with manifest, icon, and contributions intact.
- Does NOT prove: runtime behavior.
- Contents check (existing precedent, T-0009/T-0010 acceptance): `npx vsce ls`
  lists packaged assets + `LICENSE` (T-0010: logo PNG/SVG + `LICENSE`;
  `vsce` ships the license as `LICENSE.txt`). Run it when icon/assets/
  license packaging is in doubt; `npm run package` warning `LICENSE not found`
  was the T-0009 signal, gone in T-0010.
- When: after `package.json` `contributes` changes (commands, configuration,
  `languageModelChatProviders`), icon/asset changes, or before a local-install
  check. INFERRED cadence: used at milestones (T-0009, T-0010), not per change.

### Non-check script

- `npm run watch` (`tsc -watch -p ./`) is a dev loop, not verification.
  It proves nothing by itself.

## Manual / Runtime Verification (CONFIRMED)

Automated tests stop at helper logic. End-to-end behavior is verified
manually in the Extension Development Host (EDH). Procedure per
`README.md` + `.vscode/launch.json` + per-task Evidence (`dev/tasks/`,
summarized in `dev/now.md`):

1. `npm install`, then `npx tsc --noEmit -p ./` and `npm run lint` green.
2. Press `F5` (launch config "Run Extension", `preLaunchTask` = default build).
3. In the EDH window: run `OCT: Enable Opencode Engine` from the command
   palette, reload when asked.
4. Pick an `OCT` model in the Copilot model picker; send a multi-turn
   conversation; confirm one opencode session is reused (no per-turn sprawl —
   cross-check via engine session list).
5. Exercise the changed surface (approvals dialog, tool bridge turn,
   Thinking Effort switch, image attach, status/cleanup command, …).
6. `OCT: Show Status` should list mapped conversations grouped by workspace
   directory with ages; `OCT: Delete Orphaned Engine Sessions` should
   dry-run then delete only on explicit confirmation.

What EDH proves: real activation gate, managed `opencode serve` lifecycle,
model picker wiring, session reuse, tool-bridge + approval UX.
What it does NOT prove: external-server mode (`oct.opencodeUrl` without the
manually installed plugin — fallback path, rarely re-verified), other OSes
(primary: Windows 10 Pro; macOS/Linux best-effort), other engine versions
(verified against opencode **2.0.21**).

Historical live probes (INFERRED still valid, from T-0002/T-0007 Evidence):
`opencode --version` (v2 gate), `GET /api/info` health, session
create → get/list → rename → 404 path. Re-run when touching
`src/binary.ts`, `src/server/*`, or after an engine upgrade.

## CI Relationship (CONFIRMED: none)

- There is **no CI**. `.github/` contains only `copilot-instructions.md`
  (workflow adapter); no `workflows/` directory, no other CI config exists.
- Consequence: every check above is local-only. The "CI equivalent" of a
  change is simply `npm run lint` + `npm test` (+ EDH for behavior changes).
- No branch/PR/release pipelines, no required-status gates, no secrets.

## Change → Verification Guide

Minimum verification per change type. Broader checks are justified when the
change crosses layers or touches shared helpers.

| Change type | Minimum verification | Broader check when… |
|---|---|---|
| Docs-only (`dev/`, `docs/`, `README`, comments) | None automated; re-read the edited file | README setup block changed → run the commands it cites |
| `src/provider/*` logic | `npx tsc --noEmit -p ./` + `npm test` | Behavior change → EDH pass over the affected flow |
| `src/server/*`, `src/binary.ts`, `src/extension.ts`, `src/config.ts`, `src/output.ts` (no dedicated test files — see gaps) | `npm run lint` | Any behavior change → EDH pass; lifecycle/binary changes → live probe (`--version`, health, spawn/stop) |
| `test/*` only | `npm test` (full; confirms count moved as expected) | Shim/mock changed → full suite + `npm run lint` |
| `plugin/oct-tools/**` (plain JS, no tests) | `npm run lint` (unaffected, sanity) + EDH tool-bridge turn | Any bridge change → EDH tool turn incl. approvals + cancel path |
| `package.json` contributes (commands, settings, provider) | `npm run compile` + `npm run package`, then install-the-VSIX smoke (`npx vsce ls` when assets/license contents are in doubt) | Setting default changed → also `npm test` (defaults are asserted, e.g. `oct.maxSessions` = 200) |
| `tsconfig*.json`, dependency version | `npm run lint` + `npm test` | `vscode` engine range or TS major → EDH smoke |
| Dependency add/remove | NOT AVAILABLE as precedent — zero-dep policy (T-0008/T-0018); treat as architectural, re-verify everything above | — |

Do NOT run the full matrix for a typo fix. Do run `npm run lint` + `npm test`
for any production-logic change — that pair is the project's de-facto
required gate (every completed task T-0011..T-0023 cites it).

## Database / Persistent State (CONFIRMED)

No database, no migrations, no cache/queue services. Persistent state is
VS Code `globalState` (`Memento`), four active keys in `src/provider/sessions.ts`:
`oct.conversationSessions.v1` (map entries), `oct.deadConversations.v1`
(deleted-session retire set — a later turn repeats the deleted notice),
`oct.droppedConversations.v1` (dropped-link retire set — a later turn repeats
the dropped notice), `oct.orphanedSessions.v1` (graveyard) — all covered by
`test/sessions.test.ts`
(restore caps, malformed-row tolerance, evict-dead-first, graveyard bounds).

- Schema-shape changes (new keys, entry fields): unit tests + reload-persist
  check in EDH (map survives reload; old rows without new fields restore fine —
  see "directory restore compat" test pattern).
- No destructive operations needed for verification. Never delete real user
  `globalState` to test; use the in-memory `fakeStore` pattern from the tests.
- Engine-side sessions are the only external durable state; orphan cleanup is
  opt-in with dry-run + explicit confirmation — verify via EDH, never by
  bulk-deleting sessions.

## Verification Prerequisites (CONFIRMED)

- Node.js 20+ and `npm install` (version floor: `dev/constraints.md`, README;
  runner mechanics: `test/run.mjs` header). Verified locally: Node v22.23.1 / npm 10.9.8.
- Automated checks (`lint`, `test`, `compile`): nothing else needed.
  No environment variables, no services, no fixtures, no secrets.
- EDH/manual checks: VS Code `^1.125.0` (engines field), opencode v2 binary
  on `PATH` (verified 2.0.21), Copilot Chat access for the picker/tools flow.
  Managed mode needs loopback `serve`; external mode needs `oct.opencodeUrl`
  + manual plugin install + matching `OCT_CALLBACK_TOKEN` (README).
- Never document or commit secrets (`OPENCODE_SERVER_PASSWORD`,
  `oct.opencodePassword`, callback tokens) — per `dev/security.md`, secrets
  must never be logged (password/token/headers/content excluded from logs).

## Known Verification Gaps (CONFIRMED — do not fix in a verification task)

Per `ARCHITECTURE-MAP.md` ("Needs verification" / "Unclear-area") and test inventory:

1. **No dedicated test files for lifecycle seams** (partial helper coverage
    exists): `src/server/manager.ts` spawn/kill/env merge (only the pure
    `withAskAllPermissions` helper is unit-covered via
    `test/permissions.test.ts`), `src/binary.ts` (no test imports),
    `plugin/oct-tools/index.js` (no test imports, plain JS, verified live
    only), shuttle HTTP listen lifecycle in `src/provider/tools.ts`
    (partial: `test/images.test.ts` starts a real `ToolShuttle` and
    `POST`s `/oct/execute` + `resolve`, but server bind/auth lifecycle has
    no dedicated file), provider turn-routing in
    `src/provider/octProvider.ts` (partial: `test/sessions.test.ts`
    exercises retired-chat, Thinking Effort round-trip, and multi-root
    round-trips with mocked `fetch`, but there is no dedicated provider
    test file) — behavior beyond the covered helpers rests on code read +
    historical live EDH runs.
2. **No E2E automation**: multi-turn reuse, approvals, tool bridge, and
   orphan cleanup are EDH-manual (user-run) per task. No Playwright/headless
   harness exists.
3. **No CI**: regressions are caught only when someone runs the gates locally.
4. **Engine drift**: defensive parsing tolerates payload variation, but exact
   engine shapes beyond v2.0.21 are UNKNOWN — re-verify on engine upgrades.
5. **External mode**: engine-fallback path without the plugin is verified
   rarely (T-0015); treat as manual-only.
6. **Breaker short-circuit line** (repeat-call circuit breaker) was never
   observed live — safety net, untriggered (INFERRED from `dev/now.md`).

## Task Completion Contract

A task may be marked:

- `IMPLEMENTED` — code exists.
- `TESTED` — at least one relevant check from this contract was executed.
- `VERIFIED` — the minimum checks from the change table above passed AND,
  for behavior changes, the EDH/runtime behavior was confirmed with
  concrete evidence (which turn, which session, what was observed).
- `UNVERIFIED` — evidence is incomplete.

**Do not** claim `VERIFIED` when required project checks have not been completed.
A green build proves the application can be built; it does not prove runtime
behavior is correct. Green unit tests prove pinned helper logic; they do not
prove the extension works in a real host against a real engine.

## Context-Efficient Verification

Prefer the smallest verification set from the change table that proves the
changed behavior. **Do not** rerun unrelated full-suite checks for every tiny
change — but `npm run lint` + `npm test` are the
standard gate for any production-logic change, so default to them there.

## Evidence Index (files inspected 2026-10-08)

`package.json` (scripts, engines, vsce range), `tsconfig.json`
(strict + unused flags), `test/tsconfig.tests.json`, `test/run.mjs`,
`test/vscode-mock.mjs`, `test/shims/node_modules/vscode`,
`test/*.test.ts` (6 files: sessions, messages, streaming, models,
permissions, images), `.vscode/tasks.json`, `.vscode/launch.json`,
`.vscode/settings.json`, `.github/copilot-instructions.md` (+ confirmed
absence of `.github/workflows/`, `Makefile`, `Dockerfile`, ESLint/Prettier
configs), `README.md` (setup block, EDH flow, prerequisites),
`ARCHITECTURE-MAP.md` (build/test boundary, coverage gaps),
`dev/project.md`, `dev/constraints.md`, `dev/security.md`, `dev/roadmap.md`,
`dev/now.md`, `dev/commit-policy.md`,
`dev/tasks/T-0018-typescript-lint.md` (lint gate definition + negative check),
`dev/tasks/T-0023-multimodal-ferry.md` (147/147 + EDH A/B evidence),
`dev/tasks/T-0009-vsix-packaging.md` + `dev/tasks/T-0010-logo-license.md`
(`vsce ls` contents check + file-count baselines).
