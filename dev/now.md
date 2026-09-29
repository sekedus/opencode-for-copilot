# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (T-0001..T-0004 COMPLETE + committed d7f9b28; roadmap + tasks agree; worktree clean)

## Current Milestone

M2 — Tool-call bridge (spike first), session title/sync, tests, VSIX packaging.

## Current Task

None — T-0004 COMPLETE. Next: T-0005 (approvals-only + engine-visible) unscoped.

## Current Step

T-0004 probes complete: no injection path (fields silently dropped); tool events + permission round-trip captured; decision recorded. Next: scope T-0005 or commit T-0004.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, and 1 conversation = 1 session reuse (text-only MVP).

## Last Completed

- T-0004 complete: bidirectional tool execution NO-GO (prompt API drops tool fields); engine tool events + permission.asked/reply verified live; T-0005 recommendation approvals-only + engine-visible.

- T-0002 complete: managed `opencode serve` spawn/health/stop verified in Extension Development Host (managed-password 401 fix + failure-state preservation applied).
- T-0003 complete: OCT provider verified in Extension Development Host — models in Manage Models + picker (after `toolCalling:true`/`isUserSelectable:true` fix), session reuse across turns.

## Last State Transaction

COMMIT_T-0004

## Next Action

Scope T-0005 (approvals-only + engine-visible slices).

## Current Blocker

None.

## Relevant Files

- `dev/tasks/T-0001-extension-shell-gate.md`
- `dev/tasks/T-0002-managed-server.md`
- `dev/tasks/T-0003-chat-provider-sessions.md`
- `dev/tasks/T-0004-tool-bridge-spike.md`
- `docs/adr/0001-oct-bridge-architecture.md`
- `dev/project.md`
- `dev/constraints.md`
- `dev/security.md`

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification

Status: T-0004_VERIFIED

Evidence:

- Scratch `opencode serve` v2.0.18 probes 2026-09-29 (see task Probe Log).
- `npx tsc --noEmit -p ./` exit 0; no `src/` modifications.

Evidence:

- `npx tsc --noEmit -p ./` exit 0 (2026-09-29); `npm run compile` emit ok (`out/provider/`).
- Model mapping smoke-tested via node (`p/x` picker id, limits).
- Manual Extension Development Host run 2026-09-29, user-verified: OCT models in Manage Models + picker (pinned models show after `toolCalling:true`/`isUserSelectable:true` fix); session reuse across turns confirmed.

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`. (now.md previously claimed AUTO; corrected to match file.)

## Last Commit

`d7f9b28 docs: add T-0004 tool-bridge spike scope` — T-0004 checkpoint (spike scope, probe evidence, decision). Worktree clean at commit time.

## README Status

CURRENT — README describes M1 complete (T-0001 + T-0002 + T-0003), picker usage + session-reuse guarantee.

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map, text-only MVP. References in %TEMP%: opencode v2 (8c1ce95), openchamber v2 (098434d), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4). Local opencode v2.0.18 available.

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.
- Do not add tool passthrough to the MVP (deferred follow-up).

## Last Session

T-0004 completed with evidence: no injection path; tool events + permission round-trip verified; T-0005 recommendation recorded.

## Resume Instruction

Read this file first. T-0004 is COMPLETE; T-0005 (approvals-only + engine-visible) is the recommended next task.
