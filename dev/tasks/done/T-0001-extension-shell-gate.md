# T-0001 — Extension shell + activation gate

## Status

COMPLETE

## Objective

Extension installs disabled by default; `OCT: Enable` checks opencode v2 binary, sets flag, asks reload; `OCT: Disable` clears flag; provider registers only when enabled.

## Why

Opencode `serve` eats RAM in background. Explicit opt-in gate bounds cost. Binary check prevents broken enable.

## In Scope

- `package.json` manifest: vendor `oct`, `engines.vscode ^1.125.0`, commands `oct.enable`, `oct.disable`, `oct.status`, `oct.refreshModels`, config `oct.enabled`, `oct.opencodeUrl`, `oct.opencodeBinary`, `oct.opencodePassword`.
- `src/extension.ts` activate/deactivate wiring only.
- `src/config.ts` settings access.
- `src/output.ts` output channel `OCT`.
- Binary check via `opencode --version`, require v2 (`/^v?2\./`).
- Enable/disable + reload prompt. Status command shows enabled, binary, server URL.

## Out of Scope

- Server spawn (T-0002), chat provider streaming (T-0003), tools, packaging.

## Dependencies / Inputs

- ADR-0001; reference `opencode-copilot-chat/src/extension.ts` wiring; `openchamber/packages/vscode/src/extension.ts` activation pattern.

## Allowed Product Files / Areas

- `package.json`
- `tsconfig.json`
- `src/extension.ts`
- `src/config.ts`
- `src/output.ts`
- `.vscodeignore`

## State Synchronization Files

- `dev/tasks/T-0001-*.md`
- `dev/roadmap.md`
- `dev/now.md`
- `README.md`

## Acceptance Criteria

- [x] Fresh install: OCT absent from picker, no `opencode serve` spawned.
- [x] `OCT: Enable` without opencode binary fails with clear message, flag unchanged.
- [x] `OCT: Enable` with opencode v2 sets `oct.enabled=true`, prompts reload.
- [x] After reload with enabled, extension activates provider path (even if models stubbed).
- [x] `OCT: Disable` clears flag, prompts reload, stops managed server if running.
- [x] `tsc --noEmit` passes.

## Implementation Notes

Vendor `oct`, display `OCT`. `activationEvents`: `onStartupFinished`, `onLanguageModelChatProvider:oct`. Follow thin-`activate()` pattern.

## Verification

Commands:

```text
npm install
npx tsc --noEmit
```

Expected result: clean compile; manual enable/disable flow verified in Extension Development Host.

## Current Progress

- [x] Manifest + config + output
- [x] Extension wiring + binary check
- [x] Verify compile (`npx tsc --noEmit` exit 0)

## Evidence

- Implementation: VERIFIED (package.json, tsconfig.json, src/extension.ts, src/config.ts, src/binary.ts, src/output.ts, .vscodeignore, .vscode/launch.json, .vscode/tasks.json)
- Tests: NOT RUN (no test harness in T-0001 scope)
- Runtime/manual verification: VERIFIED 2026-09-29 — user ran Extension Development Host, `OCT: Enable/Disable/Status` all work (Windows `shell:true` fix for `opencode.cmd` ENOENT applied, recompiled clean)

## Known Issues / Blockers

- None.

## README Impact

Update setup/enable section after verification.

## Commit Checkpoint

Suggested commit message:

```text
feat: add OCT extension shell with enable gate
```

Commit status:

```text
COMMITTED (see dev/now.md Last Commit)
```

## Handoff Notes

T-0002 builds server manager on this shell.
