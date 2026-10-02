# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (T-0001..T-0006 COMPLETE; B-0003/B-0004/B-0005 verified; commit through aa9886d + uncommitted T-0006/B-record/README work; roadmap + tasks agree)

## Current Milestone

M2 — Tool-call bridge (spike first), session title/sync, tests, VSIX packaging.

## Current Task

None — T-0006 COMPLETE (verified 2026-10-02). Next: commit checkpoint, then remaining M2 (session title/sync, tests, VSIX).

## Current Step

T-0006 done: shuttle loop + approvals verified in EDH (Steps 1–8, attempts
1–8); B-0003/B-0004/B-0005 found, fixed, re-verified; README refreshed.
Uncommitted: T-0006 implementation, 3 bug records, README, roadmap/now.md.
Next: commit checkpoint (policy: ask).
OPEN: EDH redo (image workspace) + Steps 3–8.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, and 1 conversation = 1 session reuse (text-only MVP).

## Last Completed

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

STATE_RECONCILED_T-0006_COMBINED

## Next Action

Start T-0006 (combined tool bridge) or commit state (policy: ask).

## Current Blocker

None.

## Relevant Files

- `dev/tasks/T-0001-extension-shell-gate.md`
- `dev/tasks/T-0002-managed-server.md`
- `dev/tasks/T-0003-chat-provider-sessions.md`
- `dev/tasks/T-0004-tool-bridge-spike.md`
- `dev/tasks/T-0005-plugin-echo-tool-spike.md`
- `dev/tasks/T-0006-copilot-tool-bridge.md`
- `plugin/oct-tools/index.js` (new: bundled bridge plugin)
- `src/provider/tools.ts` (new: shuttle + callback server)
- `src/provider/permissions.ts` (new: approval translator)
- `docs/adr/0001-oct-bridge-architecture.md`
- `dev/project.md`
- `dev/constraints.md`
- `dev/security.md`

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification

Status: VERIFIED (T-0006 complete 2026-10-02)

Evidence:

- `npx tsc --noEmit -p ./` + `npm run compile` exit 0 (2026-10-02).
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

`115ebb5 feat: bridge Copilot tools with engine permission approvals` (T-0006 + B-0003/B-0004/B-0005 records + README refresh). Worktree clean.

## README Status

CURRENT — tool bridge documented (execution, approvals, trust, timeouts, external install, text-only fallback) 2026-10-02.

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map. Tool bridge COMPLETE (T-0006, verified 2026-10-02). References in %TEMP% (refreshed 2026-09-30): opencode v2 (293d60a), openchamber v2 (566ba61), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4), vscode (08d4889, tag 1.135.0). Local opencode v2.0.21 (was 2.0.18 at M1). Bug-fix records: B-0001 (session map), B-0002 (turn errors + drive case), B-0003 (re-emit spin), B-0004 (continuation starvation + retry breaker), B-0005 (denial error UX).

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.

## Last Session

T-0006 COMPLETE 2026-10-02: implementation + engine probes + EDH Steps 1–8
(attempts 1–8); B-0003/B-0004/B-0005 fixed + re-verified; README refreshed.
Uncommitted work awaits checkpoint decision.

## Resume Instruction

Read this file first. T-0006 is complete; commit the checkpoint, then continue with remaining M2 (session title/sync, tests, VSIX).
