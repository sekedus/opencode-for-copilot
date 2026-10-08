# Verification Contract

> Rules and capabilities for proving correctness. Stable contract — task-specific
> plans/results belong in the task/bug record, not here. Change this file only
> when verification capability or policy changes.

## Purpose

Define the minimum credible evidence for moving work from `IMPLEMENTED` to
`TESTED` or `VERIFIED`. See `dev/hdt.md` for the human-test gate,
`dev/security.md` for security posture, `ARCHITECTURE-MAP.md` §7 for test boundaries.

## Primary Automated Checks

All commands verified in `package.json` scripts. No ESLint/Prettier config exists;
"lint" here means the TypeScript gate, not a style linter. No CI workflows exist
(no `.github/workflows/`); all checks run locally.

### Typecheck (extension source)

```text
npm run check
```

Purpose: strict typecheck of `src/` (`tsc --noEmit`). Scope: `src/**/*.ts`.
Catches type errors and `noUnusedLocals`/`noUnusedParameters` violations.

### Test-compile gate (`lint`)

```text
npm run lint
```

Purpose: `check` + `compile-tests` (`tsc -p ./test/tsconfig.tests.json`).
Proves tests still compile against current `src/`. Run before `npm test`.

### Unit tests

```text
npm test
```

Purpose: compile tests to `out-test/` then run zero-dep `node:test` suite via
`test/run.mjs` (6 files; exact count lives in test output, not here).
Scope: `test/sessions|messages|streaming|models|permissions|images.test.ts` —
pure helpers only (map keys/titles/directories, message conversion, model
entries, permission parsing, shuttle mapping, image caps). No live server/VS Code coverage.

### Production build

```text
npm run compile
```

Purpose: emit to `out/` (`main: ./out/extension.js`). Proves the shipped bundle compiles.

### Packaging (release-facing changes only)

```text
npm run package
```

Purpose: `vsce package` produces the local VSIX. Verifies manifest/icon/contents.
Marketplace publish is out of scope; local VSIX install is the distribution path.

## Change -> Verification Matrix

| Change type | Minimum (`TESTED`) | Extra for `VERIFIED` |
|---|---|---|
| Docs/text only | read-through / render check | human review when user-facing |
| `src/` logic (pure helper) | `npm run lint` + `npm test` | regression test when boundary changes |
| Session/streaming/tools/permissions/images | `lint` + `test` + EDH runtime (below) | HDT when user-visible behavior matters |
| Config/manifest/build (`package.json`, `tsconfig*`, `vsce`) | `npm run compile` (+ `package` when manifest/icon changes) | EDH reload smoke test |
| Security-sensitive (auth, approvals, shuttle token, secrets, loopback, workspace path) | `lint` + `test` + targeted review per `dev/security.md` §5 gate | abuse/failure-path check + EDH/HDT |
| Architecture (module ownership, flows, contracts) | affected `lint` + `test` + map check | ADR update + broader EDH pass |

## TESTED vs VERIFIED

- `TESTED` = the relevant automated check(s) above were executed successfully
  in a supported environment (see Prerequisites).
- `VERIFIED` = all required checks for the change type passed AND expected
  behavior has sufficient evidence. For runtime-dependent changes, `npm test`
  exit 0 alone is NOT `VERIFIED` — EDH/HDT evidence is also required.
- `IMPLEMENTED` / `UNVERIFIED` per Completion Vocabulary below.
- A declined HDT never manufactures `VERIFIED`; record the gap as `UNVERIFIED`.

## HDT Requirements

See `dev/hdt.md` for procedure. This contract defines when it applies.

REQUIRED for (automation cannot prove these):

- multi-turn chat reuse (1 conversation = 1 session, no per-turn sprawl);
- tool-bridge turns (Copilot tool execution via plugin + shuttle);
- engine approvals (Allow/Cancel dialog, read-silent, default-deny paths);
- image ferry (attached/tool-result bytes reach the vision model);
- session health UX (prune/deleted/dropped/orphan notices, status command);
- enable/disable + managed `opencode serve` lifecycle.

RECOMMENDED for: model picker entries, Thinking Effort variants, status/output
text, other user-visible behavior with only partial unit coverage.

NOT normally required for: docs-only, typo/format-only, internal refactors with
`lint` + `test` green and no behavior change.

## Manual / Runtime Verification (EDH)

Automation covers pure helpers only. Real turns require Extension Development
Host (`F5`) against a real `opencode serve` v2 with `OCT: Enable` + reload:

- What to exercise: enable → picker shows OCT models → multi-turn reuse →
  tools/approvals/images per change → disable stops the owned server.
- Success looks like: models list from engine; turns reuse one session id
  (check `GET /api/session` list); tool calls shuttle and resume; non-read
  actions ask Allow/Cancel on Default and deny on timeout/dismiss; images
  attach without `file://` errors; disable leaves no orphan `opencode serve`.
- Keep per-task steps/observations in the task record or HDT report, not here.

## Prerequisites

- Node 20+ (extension host runtime; dev verified on Node 22).
- `npm install` with committed `package-lock.json`; no extra test deps
  (`node:test` built-in, `vscode` mock via `NODE_PATH` shim in `test/run.mjs`).
- VS Code `^1.125.0` for `languageModelChatProviders` / `onLanguageModelChatProvider:oct`.
- `opencode` v2.0.x binary on PATH (verified 2.0.21); v1 unsupported.
  External `oct.opencodeUrl` override needs a manually installed bridge plugin
  and `oct.callbackToken` match — verify against that server, not the managed one.
- Do not run the engine unless OCT is explicitly enabled (opt-in gate).

## Verification Gaps (durable, not history)

- No automated E2E/integration: turns, tools, approvals, images have no
  headless coverage; EDH/HDT is the only proof. Document the gap when skipped.
- No CI: nothing enforces `lint`/`test` on push; agents must run them locally.
- No coverage threshold, SAST, or dependency scanner; supply chain is
  `npm install` + version pin review only.
- External-server mode (custom URL, manual plugin, user token) is verified
  only when explicitly exercised; managed-mode results do not transfer.
- Windows 10 primary; macOS/Linux spawn/kill (`taskkill` vs `SIGTERM`) paths
  are best-effort. No browser/mobile surface (n/a).

## Security Verification

Full rules in `dev/security.md`; verify at the boundary, not by checklist:

- What must be verified on security-sensitive changes: password/token never
  logged; loopback-only (external URL explicit opt-in); session ids per
  conversation; workspace path absolute + validated; approvals default-deny
  (never `always`; timeout/dismiss/disconnect → deny); shuttle body cap holds.
- Which check proves it: targeted unit test where a pure helper exists
  (`permissions`, `images`, `sessions`) + code review + EDH abuse/failure-path
  probe (deny path, oversize image, bad token, deleted session). No findings ≠
  proof of secure; record level/surface/evidence per `dev/security.md` §6.

## Completion Vocabulary

- `IMPLEMENTED` — change exists, verification may not have run.
- `TESTED` — relevant check(s) executed successfully.
- `VERIFIED` — all required checks passed + expected behavior has sufficient evidence.
- `UNVERIFIED` — required evidence incomplete or unavailable.

## Evidence Retention

Keep this contract stable and history-free. Task commands/results, HDT reports,
and EDH observations belong in the task/bug record; Git history preserves file
evidence. Do not paste test logs, past failures, or commit lists here.
