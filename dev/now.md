# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (T-0001..T-0016 COMPLETE — M2 done, M3 in progress; T-0016 verified-uncommitted; roadmap + tasks agree)

## Current Milestone

M3 — IN PROGRESS (2026-10-03): session management (configurable cap, prune-on-start, deleted-session UX), model display (`OCT / <name>` + vision), tool priority (Copilot primary, engine fallback).

## Current Task

None — T-0016 complete; T-0017 scaffolding uncommitted.

## Current Step

T-0016 COMPLETE 2026-10-05 (`tsc` 0, `npm test` 58/58, uncommitted; command EDH green).

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, 1 conversation = 1 session reuse, and the M2 tool bridge (Copilot tools via plugin + shuttle; engine approvals with default-deny).

## Last Completed

- T-0016 COMPLETE (20261005): orphan graveyard (cap 200, persisted) + `OCT: Delete Orphaned Engine Sessions` (resolve → dry-run → Delete/Cancel, default off; `tsc` 0, `npm test` 58/58; command EDH green 2026-10-05). Uncommitted.
- T-0015 COMPLETE (20261005): `TOOL_NOTICE` removed, engine-tools fallback when bridge unavailable (Copilot primary unchanged, default-deny holds; `tsc` 0, `npm test` 48/48; EDH Parts A/B/C + image redo green). Committed d1a4aa5.
- T-0014 COMPLETE (20261004): `OCT / <name>` branding + `imageInput` from vision modality (`tsc` 0, `npm test` 48/48). Committed 403a186.
- T-0013 COMPLETE (20261004): typed 404 preserved through admission + gone-branch (`forget` + one-sentence throw; `tsc` 0, `npm test` 42/42). Committed f0005cf.
- T-0012 COMPLETE (20261004): per-id verify-and-prune shared by startup + status (`isSessionGoneError`, list demoted to titles; `tsc` 0, `npm test` 37/37). Committed 8c0f8a9.
- T-0011 COMPLETE (20261003): `oct.maxSessions` setting (default 50, clamped) + map cap wiring + 2 unit tests (`tsc` 0, `npm test` 34/34). Committed 3d7ea3b.
- T-0010 COMPLETE (20261003): logo/icon/LICENSE (`assets/` art + manifest `icon` + MIT `LICENSE`; `tsc` 0, package 21 files / 59.01 KB). Committed ad25133.
- T-0009 COMPLETE (20261002): local VSIX (`@vscode/vsce@4.0.0`, 18 files, 48.51 KB, contents-gated) + user-run install proof. M2 COMPLETE.
- T-0008 COMPLETE (20261002): zero-dep `node:test` harness (`vscode` mock + NODE_PATH shim + runner) with 32 session/message units incl. EDH regressions; main build untouched.
- T-0007 COMPLETE (20261002): derived engine titles (`<userRequest>` unwrap, attachment stripping) + unique `OCT: <key8> <MM-DD HH:mm>` fallback + status list with prune; EDH attempts 1–3 (#1/#2/#3/#4/#5 PASS).

- T-0006 COMPLETE (20261002): tool bridge verified in EDH (Steps 1–8).
- B-0003/B-0004/B-0005 (20261002, verified): re-emit spin, continuation
  starvation + image retry loop, denial error UX — all fixed + re-verified.
- B-0002 (20261001, aa9886d): turn errors no longer masked as `request cancelled` (explicit abort-reason flags); lowercase-drive workspaces canonicalized; poisoned sessions forgotten + retried once with actionable message.
- B-0001 (20260930, 7d1e895): session map persists across reloads (`oct.conversationSessions.v1`), `_conversationId` key first, 404-remap on restore.
- Docs: feature/bug-fix record workflows (587069d), harness-portable instructions (c3f40a2), bug-fix record + arch reference refresh (707b7ff).
- T-0005 complete (GO): plugin echo-tool block-and-resume proven; interrupt → aborted failure; context-filter works for direct tools; permission-deny works for catalog tools.

- T-0004 complete: bidirectional tool execution NO-GO (prompt API drops tool fields); engine tool events + permission.asked/reply verified live; T-0005 recommendation approvals-only + engine-visible.

- T-0002 complete: managed `opencode serve` spawn/health/stop verified in Extension Development Host (managed-password 401 fix + failure-state preservation applied).
- T-0003 complete: OCT provider verified in Extension Development Host — models in Manage Models + picker (after `toolCalling:true`/`isUserSelectable:true` fix), session reuse across turns.

## Last State Transaction

STATE_M3_OPENED

## Next Action

Commit T-0016 (Task: ASK), then implement T-0017.

## Current Blocker

None.

## Relevant Files

- `dev/tasks/T-0001-extension-shell-gate.md`
- `dev/tasks/T-0002-managed-server.md`
- `dev/tasks/T-0003-chat-provider-sessions.md`
- `dev/tasks/T-0004-tool-bridge-spike.md`
- `dev/tasks/T-0005-plugin-echo-tool-spike.md`
- `dev/tasks/T-0006-copilot-tool-bridge.md`
- `dev/tasks/T-0007-session-title-sync.md`
- `src/server/client.ts` (T-0007: `listSessions` + `updateSession`)
- `src/provider/sessions.ts` (T-0007: title derivation + prune helper)
- `src/extension.ts` (T-0007: status list)
- `src/provider/octProvider.ts` (T-0007: title seed + map accessors)
- `plugin/oct-tools/index.js` (bundled bridge plugin)
- `src/provider/tools.ts` (shuttle + callback server)
- `src/provider/permissions.ts` (approval translator)
- `docs/adr/0001-oct-bridge-architecture.md`
- `dev/project.md`
- `dev/constraints.md`
- `dev/security.md`

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification

Status: VERIFIED (T-0006..T-0009 complete 2026-10-02, M2 done; committed 13638c3)

Evidence:

- `npx tsc --noEmit -p ./` + `npm run compile` exit 0 (2026-10-02, T-0007).
- T-0007 live engine checks PASSED 2026-10-02 (opencode v2.0.21: create with title → get/list return title → PATCH rename → 404 path).
- T-0007 EDH attempt 1 (2026-10-02): reuse/reload-persist/prune PASS; title derivation FAIL (all titles were the Copilot `<environment_info>` OS string — first user message is global context, query is in `<userRequest>`); fixed via `extractUserPromptText` + newest-first scan.
- T-0007 EDH attempt 2 (2026-10-02): #1 title PASS (`"T7 alpha bravo <timestamp>"` on `ses_f03cbc34…` — `<userRequest>` fix confirmed); #2 attachment-only FAIL (raw `<attachments>` markup leaked into title on `ses_f03c9aca…`) → fixed via `stripAttachmentBlocks`.
- T-0007 EDH attempt 3 (2026-10-02): #1 + #2 PASS; unique fallback `OCT: <key8> <MM-DD HH:mm>` implemented + script-verified (distinct per conversation, `tsc` clean).
- T-0006 engine probes VERIFIED 2026-10-01 (task Probe Log).
- EDH Steps 1–8 VERIFIED 2026-10-01/02 (attempts 1–8; task Evidence + checklist).
- External fallback VERIFIED (text-only + notice, no crash).
- B-0003/B-0004/B-0005 fixed + re-verified (records hold evidence).
- Breaker short-circuit line never observed live (safety net untriggered).

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`. (now.md previously claimed AUTO; corrected to match file.)

## Last Commit

`d1a4aa5 feat: Copilot tools primary, engine tools fallback` (T-0015 only: 8 files). Worktree holds T-0016/T-0017 scaffolding + roadmap PLANNED lines + PL-0001 + this `now.md` bookkeeping.

## README Status

CURRENT — orphan cleanup command (T-0016, 2026-10-05) + tool priority (Copilot primary, engine fallback, T-0015, 2026-10-05) + `oct.maxSessions` setting (T-0011) + license section at bottom (T-0010, 2026-10-03) + session titles (incl. unique `OCT: <key8> <MM-DD HH:mm>` fallback) + status list noted (2026-10-02, T-0007 complete).

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map. Tool bridge COMPLETE (T-0006, verified 2026-10-02). References in %TEMP% (refreshed 2026-09-30): opencode v2 (f0f4c94), openchamber v2 (90726f9), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4), vscode (08d4889, tag 1.135.0). Local opencode v2.0.21 (was 2.0.18 at M1). Bug-fix records: B-0001 (session map), B-0002 (turn errors + drive case), B-0003 (re-emit spin), B-0004 (continuation starvation + retry breaker), B-0005 (denial error UX).

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.

## Last Session

T-0016 complete 2026-10-05 (uncommitted; command EDH green). Next: T-0017 or commit T-0016. No blocker.

## Resume Instruction

Read this file first. M3 is IN PROGRESS (T-0016 done; T-0017 scaffolding uncommitted).
