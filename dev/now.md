# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT

## Current Milestone

M1 — OCT text-only MVP (bridge opencode v2 into Copilot Chat as provider `oct`).

## Current Task

T-0002 — Managed opencode server lifecycle (`dev/tasks/T-0002-managed-server.md`).

## Current Step

T-0001 complete and verified; start T-0002 server manager (resolve mode, spawn, health-check, stop).

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, and 1 conversation = 1 session reuse (text-only MVP).

## Last Completed

- T-0001 complete: extension shell + enable/disable/status verified in Extension Development Host (Windows `shell:true` fix applied).

## Last State Transaction

TASK_COMPLETE_T-0001

## Next Action

Implement T-0002 managed server lifecycle, then verify with `npx tsc --noEmit` + manual status check.

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

Status: T-0001_VERIFIED

Evidence:

- `npx tsc --noEmit -p ./` exit 0 (recompiled after Windows shell fix).
- Manual Extension Development Host run 2026-09-29: `OCT: Enable/Disable/Status` verified by user.

## Commit Policy

Initial: ASK
Task: AUTO

See `dev/commit-policy.md`. Task checkpoints auto-commit only after verification and clean-scope checks.

## Last Commit

`chore: initialize adaptive agent workflow` — initial bootstrap checkpoint (see `git log -1` for hash).

## README Status

CURRENT — README describes OCT bridge, M1 state (T-0001 done), setup with F5 + enable flow.

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map, text-only MVP. References in %TEMP%: opencode v2 (8c1ce95), openchamber v2 (098434d), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4). Local opencode v2.0.18 available.

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.
- Do not add tool passthrough to the MVP (deferred follow-up).

## Last Session

T-0001 completed and verified; T-0002 queued.

## Resume Instruction

Read this file first. Active task is T-0002; implement the server manager, verify compile + manual status, then proceed to T-0003.
