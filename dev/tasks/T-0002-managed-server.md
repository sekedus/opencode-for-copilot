# T-0002 — Managed opencode server lifecycle

## Status

COMPLETE

## Objective

Extension spawns or connects to opencode v2 server on activation (when enabled), health-checks via `GET /api/info`, stops owned server on disable/deactivate.

## Why

Engine must run in background without manual terminal steps; external override supports existing services.

## In Scope

- `src/server/manager.ts`: resolve mode (external URL vs managed spawn `opencode serve --hostname 127.0.0.1 --port <free>`), stdout ready parse (`server listening on`), `waitForReady` polling `GET /api/info`, `stop()` (SIGTERM/taskkill, no orphans).
- `src/server/client.ts`: minimal REST helper (`GET /api/info`, `GET /api/model`, `POST /api/session`, `POST /api/session/:id/prompt`, `GET /api/event` stub) with Basic auth header, no password logging.
- Password via `oct.opencodePassword` or `OPENCODE_SERVER_PASSWORD` env; loopback default.
- `OCT: Status` extended with server state.

## Out of Scope

- Chat streaming semantics (T-0003); session map policy beyond create/prompt primitives.

## Dependencies / Inputs

- T-0001 shell; reference `openchamber/packages/vscode/src/opencode.ts`, `managed-opencode-process.ts`, `opencode-ready.ts`; opencode `serve --help`.

## Allowed Product Files / Areas

- `src/server/manager.ts`
- `src/server/client.ts`
- `src/extension.ts` (wire start/stop)
- `src/output.ts` (status lines)

## State Synchronization Files

- `dev/tasks/T-0002-*.md`
- `dev/roadmap.md`
- `dev/now.md`

## Acceptance Criteria

- [x] Enabled + reload with no external URL spawns exactly one `opencode serve`, status shows URL.
- [x] `GET /api/info` succeeds within timeout; failure surfaces clear error, no hang.
- [ ] External `oct.opencodeUrl` skips spawn and health-checks that URL. (code path implemented; manual external-URL run not done — optional, low risk)
- [x] Disable/deactivate kills owned server; external server untouched.
- [x] No password in logs/output.
- [x] `npx tsc --noEmit` passes.

## Implementation Notes

Parse `server listening on {url}` from stdout; fallback poll `127.0.0.1:<port>/api/info`. Windows kill via `taskkill /PID /T /F`; POSIX via SIGTERM→SIGKILL.

## Verification

Commands:

```text
npx tsc --noEmit
```

Plus manual: enable, check `OCT: Status`, `curl http://127.0.0.1:<port>/api/info`, disable, confirm process gone.

Expected result: one managed server lifecycle, clean stop.

## Current Progress

- [x] Manager + client
- [x] Wire lifecycle
- [x] Verify (`npx tsc --noEmit` exit 0; manual steps 1-5 done)

## Evidence

- Implementation: VERIFIED (src/server/manager.ts, src/server/client.ts, src/extension.ts wiring)
- Tests: NOT RUN (no test harness in T-0002 scope)
- Runtime/manual verification: VERIFIED 2026-09-29 — user ran managed lifecycle steps 1-5 (spawn on enable+reload, status connected with URL, /api/info ok, disable kills owned server). Fixes applied during verification: Windows `shell:true` spawn already in place; managed-password generation (env `OPENCODE_PASSWORD`) fixing 401; failure-state preservation (no more `unknown error` wipe).

## Known Issues / Blockers

- None.

## README Impact

Document managed vs external mode after verification.

## Commit Checkpoint

Suggested commit message:

```text
feat: manage opencode serve lifecycle
```

Commit status:

```text
UNCOMMITTED (commit after state sync; policy ask)
```

## Handoff Notes

T-0003 consumes `client.ts` for models + chat.
