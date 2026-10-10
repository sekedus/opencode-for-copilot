# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (T-0001..T-0025 VERIFIED in `dev/tasks/done/`; M5 T-0026..T-0030 PLANNED in `dev/tasks/`; roadmap + tasks agree)

## Current Milestone

M5 — PLANNED (2026-10-10): scale + observability (see `dev/milestones/M-0005-scale-observability.md`). T-0024..T-0030 open.

## Current Task

T-0026 — Cleanup retired engine sessions (PLANNED, next).

## Current Step

T-0025 VERIFIED 2026-10-10 (`lint` + `test` 159/159 + `compile` green + owner EDH PASS: 2+2 per-group, A3 evicts A1 only, reload stable). Next: implement T-0026.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, 1 conversation = 1 session reuse, and the M2 tool bridge (Copilot tools via plugin + shuttle; engine approvals with default-deny).

## Last Completed

- T-0023 COMPLETE (20261007): multimodal image ferry (attached via prompt `files`, `view_image` via executor `data:` file parts; `file://` rejected by provider — corrected; 15 MB cap; `tsc` 0, `npm test` 147/147; EDH A+B green + regression pass). Committed 6208b4f.
- T-0022 COMPLETE (20261007): per-chat workspace directory (message > editor > first-folder, create-time pinning, B-0002 colon fix); `tsc` 0, `npm test` 128/128; EDH green (A → `[Downloads\test]` `ses_eeae4a…`, B → `[Downloads\test3]` `ses_eeadf6…`, reuse pins same session). Committed 6208b4f (bookkeeping).
- T-0021 COMPLETE (20261007): single entry + Thinking Effort control, variant
  plumb create/switch + modelKey pin; `tsc` 0, `npm test` 117/117; live probe
  green; EDH steps 1–7 green (same-session High→Low switch, untouched control
  resolves to schema default `medium`). Committed 07ab2f6 (with T-0020
  bookkeeping).
- T-0020 COMPLETE (20261007): Copilot-gated approval + attention ping
  (Allow/Cancel dialog on global Default, silent read/Bypass/Autopilot, trust
  removed, managed ask-all enforced; OS ping parked PL-0006; `tsc` 0,
  `npm test` 99/99, EDH test-3/4/5 green). Committed b65f55b.
- T-0019 COMPLETE (20261005): dropped-mapping record (`oct.droppedConversations.v1` on all 4 paths, graveyard feeds, retired-chat notice; `tsc` 0, `npm test` 84/84, EDH replay green). Committed ea528da.
- T-0018 COMPLETE (20261005): TS lint gate (`noUnusedLocals`/`noUnusedParameters`, `npm run lint`, negative check; `tsc` 0, `npm test` 73/73). Committed 04a6972.
- T-0017 COMPLETE (20261005): cap tuning (default 200, evict-dead-first without burial, `Entry.directory` + grouped status with `time.created` ages; `tsc` 0, `npm test` 73/73). Committed be123c1.
- T-0016 COMPLETE (20261005): orphan graveyard (cap 200, persisted) + `OCT: Delete Orphaned Engine Sessions` (resolve → dry-run → Delete/Cancel, default off; `tsc` 0, `npm test` 58/58; command EDH green 2026-10-05). Committed a213028.
- T-0015 COMPLETE (20261005): `TOOL_NOTICE` removed, engine-tools fallback when bridge unavailable (Copilot primary unchanged, default-deny holds; `tsc` 0, `npm test` 48/48; EDH Parts A/B/C + image redo green). Committed d1a4aa5.
- T-0014 COMPLETE (20261004): `OCT / <name>` branding + `imageInput` from vision modality (`tsc` 0, `npm test` 48/48). Committed 403a186.
- T-0013 COMPLETE (20261004): typed 404 preserved through admission + gone-branch (`forget` + one-sentence throw; `tsc` 0, `npm test` 42/42). Committed f0005cf.
- T-0012 COMPLETE (20261004): per-id verify-and-prune shared by startup + status (`isSessionGoneError`, list demoted to titles; `tsc` 0, `npm test` 37/37). Committed 8c0f8a9.
- T-0011 COMPLETE (20261003): `oct.maxSessions` setting (default 200 since T-0017, clamped) + map cap wiring + 2 unit tests (`tsc` 0, `npm test` 34/34). Committed 3d7ea3b.
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

STATE_M5_PLANNED

## Next Action

T-0024 complete and verified. A commit is recommended as a checkpoint for review, recovery, and safe continuation. Commit now? After that: implement T-0025.

## Current Blocker

None.

## Relevant Files

- `dev/milestones/M-0005-scale-observability.md` (M5 scope + decisions 2026-10-10)
- `dev/tasks/T-0024-typescript-6.0.3.md` through `dev/tasks/T-0030-model-switch.md` (M5 planned)
- `src/provider/sessions.ts` (map cap 200, evict-dead-first, directory groups, graveyard, dropped record)
- `src/provider/permissions.ts` (Copilot-gated Allow/Cancel, read-silent, no trust)
- `src/provider/images.ts` + `src/provider/tools.ts` (image ferry caps + 32 MB body)
- `src/provider/models.ts` (Thinking Effort variants) + `src/provider/octProvider.ts` (per-chat directory, turn wiring)
- `plugin/oct-tools/index.js` (bundled bridge plugin, file-part return)
- `docs/adr/0001-oct-bridge-architecture.md`
- `ARCHITECTURE-MAP.md` (codebase navigation map, AAW 0.7.1)
- `dev/project.md`
- `dev/constraints.md`
- `dev/security.md`
- `dev/verification.md` (verification contract, AAW 0.7.1)
- `dev/hdt.md` (human/runtime verification gate, AAW 0.7.2)

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification

Status: VERIFIED (T-0025 2026-10-10: `lint` + `test` 159/159 + `compile` green + owner EDH PASS. Prior: T-0024 2026-10-10: `lint` + `test` 147/147 + `compile` green + human PASS. M5 T-0026..T-0030 PLANNED. M4 VERIFIED 2026-10-07, M3 VERIFIED 2026-10-05 at `be123c1`; per-task evidence in task files)

Evidence (M2 baseline; M3/M4 detail lives in per-task Evidence):

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

`8c078ba feat: update AAW to 0.7.2` (workflow control-plane: tasks/bug-fixes → `done/`, `dev/features/` removed, `dev/hdt.md` + `dev/changelog-policy.md` + `dev/milestones/` added, parking-lot RESOLVED entries pruned; prior `1b37d02` AAW 0.7.1 superseded rewritten `2f85285`). No product-code changes since `6208b4f`. Worktree has this uncommitted now.md checkpoint only.

## README Status

CURRENT — M4 COMPLETE (2026-10-07) + M3 (`be123c1`, 2026-10-05): image ferry (T-0023: executor `data:` parts + prompt `files`, 15 MB cap) + per-chat directory (T-0022) + Thinking Effort (T-0021) + Copilot-gated approval Allow/Cancel, read-silent, no trust, managed ask-all (T-0020) + dropped-mapping record + retired-chat notice (T-0019) + TS lint gate (T-0018) + cap default 200 + grouped status (T-0017) + orphan cleanup command (T-0016) + tool priority (T-0015) + `OCT / <name>` branding + vision flag (T-0014) + deleted-session notice (T-0013) + prune-on-start (T-0012) + `oct.maxSessions` setting (T-0011).

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map. Tool bridge COMPLETE (T-0006, verified 2026-10-02). M3 COMPLETE 2026-10-05 (`be123c1`): scale hardening T-0011..T-0017. M4 COMPLETE 2026-10-07: T-0018..T-0023 (lint, dropped-mapping, Copilot-gated approval, Thinking Effort, per-chat directory, image ferry). Workflow AAW 0.7.2 installed 2026-10-08 (manifest `.aaw/manifest.yml`, no migration lock; 0.7.1 added `ARCHITECTURE-MAP.md` + `dev/verification.md`; 0.7.2 moved tasks/bug-fixes to `done/`, removed `dev/features/`, added `dev/hdt.md` + `dev/changelog-policy.md` + `dev/milestones/`, pruned RESOLVED parking-lot entries leaving PL-0005/PL-0006). References in %TEMP% (refreshed 2026-09-30): opencode v2 (f0f4c94), openchamber v2 (90726f9), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4), vscode (08d4889, tag 1.135.0). Local opencode v2.0.21 (was 2.0.18 at M1). Bug-fix records: B-0001 (session map), B-0002 (turn errors + drive case), B-0003 (re-emit spin), B-0004 (continuation starvation + retry breaker), B-0005 (denial error UX).

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.

## Last Session

AAW 0.7.2 committed `8c078ba` (tasks/bug-fixes → `done/`, parking-lot pruned to PL-0005/PL-0006). No open tasks. No blocker.

## Resume Instruction

Read this file first. Offer the now.md checkpoint commit (policy ASK); then scope post-M4 work with the user.
