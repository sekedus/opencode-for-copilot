# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (T-0001 COMPLETE + committed 3dd9ba7; T-0002 IN_PROGRESS in task + roadmap + now; policy ask/ask; worktree has uncommitted now.md/roadmap sync)

## Current Milestone

M1 — OCT text-only MVP (bridge opencode v2 into Copilot Chat as provider `oct`).

## Current Task

T-0003 — OCT chat provider with 1:1 session reuse (`dev/tasks/T-0003-chat-provider-sessions.md`).

## Current Step

T-0002 complete and verified; start T-0003 provider (models, messages, sessions, streaming, registration).

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, and 1 conversation = 1 session reuse (text-only MVP).

## Last Completed

- T-0002 complete: managed `opencode serve` spawn/health/stop verified in Extension Development Host (managed-password 401 fix + failure-state preservation applied).

## Last State Transaction

TASK_COMPLETE_T-0002

## Next Action

Implement T-0003 chat provider, then verify with `npx tsc --noEmit` + manual picker/chat run.

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

Status: T-0002_VERIFIED

Evidence:

- `npx tsc --noEmit -p ./` exit 0.
- Manual Extension Development Host run 2026-09-29: managed lifecycle steps 1-5 verified by user (spawn, status connected + URL, /api/info, disable cleanup).

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`. (now.md previously claimed AUTO; corrected to match file.)

## Last Commit

`3dd9ba7 feat: add OCT extension shell with enable gate` — T-0001 checkpoint (shell, gate, ADR, tasks, state). Worktree clean at commit time.

## README Status

CURRENT — README describes OCT bridge, M1 state (T-0002 done), setup with F5 + enable flow.

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map, text-only MVP. References in %TEMP%: opencode v2 (8c1ce95), openchamber v2 (098434d), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4). Local opencode v2.0.18 available.

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.
- Do not add tool passthrough to the MVP (deferred follow-up).

## Last Session

T-0002 completed and verified; T-0003 queued.

## Resume Instruction

Read this file first. Active task is T-0003; implement the chat provider, verify compile + manual picker/chat, then close M1.
