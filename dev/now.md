# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (T-0001 + T-0002 + T-0003 COMPLETE; T-0002 committed 8ad8e2c; T-0003 verified, uncommitted; roadmap + task agree; M1 complete pending commit)

## Current Milestone

M1 — OCT text-only MVP (bridge opencode v2 into Copilot Chat as provider `oct`).

## Current Task

None — M1 complete (T-0001 + T-0002 + T-0003 all COMPLETE). Next milestone M2 unscoped.

## Current Step

T-0003 complete and verified; offer task commit, then close M1.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, and 1 conversation = 1 session reuse (text-only MVP).

## Last Completed

- T-0002 complete: managed `opencode serve` spawn/health/stop verified in Extension Development Host (managed-password 401 fix + failure-state preservation applied).
- T-0003 complete: OCT provider verified in Extension Development Host — models in Manage Models + picker (after `toolCalling:true`/`isUserSelectable:true` fix), session reuse across turns.

## Last State Transaction

TASK_COMPLETE_T-0003

## Next Action

Offer T-0003 task commit (policy ask), then close M1.

## Current Blocker

None.

## Relevant Files

- `dev/tasks/T-0001-extension-shell-gate.md`
- `dev/tasks/T-0002-managed-server.md`
- `dev/tasks/T-0003-chat-provider-sessions.md`
- `docs/adr/0001-oct-bridge-architecture.md`
- `dev/project.md`
- `dev/constraints.md`
- `dev/security.md`

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification

Status: T-0003_VERIFIED

Evidence:

- `npx tsc --noEmit -p ./` exit 0 (2026-09-29); `npm run compile` emit ok (`out/provider/`).
- Model mapping smoke-tested via node (`p/x` picker id, limits).
- Manual Extension Development Host run 2026-09-29, user-verified: OCT models in Manage Models + picker (pinned models show after `toolCalling:true`/`isUserSelectable:true` fix); session reuse across turns confirmed.

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`. (now.md previously claimed AUTO; corrected to match file.)

## Last Commit

`8ad8e2c feat: manage opencode serve lifecycle` — T-0002 checkpoint (manager, client, wiring, state). Worktree clean at commit time.

## README Status

CURRENT — README describes M1 complete (T-0001 + T-0002 + T-0003), picker usage + session-reuse guarantee.

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map, text-only MVP. References in %TEMP%: opencode v2 (8c1ce95), openchamber v2 (098434d), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4). Local opencode v2.0.18 available.

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.
- Do not add tool passthrough to the MVP (deferred follow-up).

## Last Session

T-0003 completed and verified (picker + session reuse); state synced, README update + commit pending.

## Resume Instruction

Read this file first. M1 is complete; next is README update + T-0003 commit offer (policy ask).
