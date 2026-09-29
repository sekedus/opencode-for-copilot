# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (T-0001..T-0005 COMPLETE + committed 5747c30; roadmap + tasks agree; worktree has uncommitted checkpoint bookkeeping only)

## Current Milestone

M2 — Tool-call bridge (spike first), session title/sync, tests, VSIX packaging.

## Current Task

None — T-0005 COMPLETE (GO for plugin-based Copilot-tool build). Next: full tool-bridge build unscoped.

## Current Step

T-0005 probes complete: block-and-resume + interrupt + context-filter proven; GO decision recorded. Next: scope build or commit T-0005.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, and 1 conversation = 1 session reuse (text-only MVP).

## Last Completed

- T-0005 complete (GO): plugin echo-tool block-and-resume proven; interrupt → aborted failure; context-filter works for direct tools; permission-deny works for catalog tools.

- T-0004 complete: bidirectional tool execution NO-GO (prompt API drops tool fields); engine tool events + permission.asked/reply verified live; T-0005 recommendation approvals-only + engine-visible.

- T-0002 complete: managed `opencode serve` spawn/health/stop verified in Extension Development Host (managed-password 401 fix + failure-state preservation applied).
- T-0003 complete: OCT provider verified in Extension Development Host — models in Manage Models + picker (after `toolCalling:true`/`isUserSelectable:true` fix), session reuse across turns.

## Last State Transaction

COMMIT_T-0005

## Next Action

Scope full Copilot-tool build (plugin + executor callback + approval UI) or commit T-0005 checkpoint (policy: ask).

## Current Blocker

None.

## Relevant Files

- `dev/tasks/T-0001-extension-shell-gate.md`
- `dev/tasks/T-0002-managed-server.md`
- `dev/tasks/T-0003-chat-provider-sessions.md`
- `dev/tasks/T-0004-tool-bridge-spike.md`
- `dev/tasks/T-0005-plugin-echo-tool-spike.md`
- `docs/adr/0001-oct-bridge-architecture.md`
- `dev/project.md`
- `dev/constraints.md`
- `dev/security.md`

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification

Status: T-0005_VERIFIED

Evidence:

- Scratch `opencode serve` v2.0.19 probes 2026-09-29 (see T-0005 Probe Log).
- `npx tsc --noEmit -p ./` exit 0; no `src/` modifications.

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

`5747c30 docs: add T-0005 plugin echo-tool spike scope` — T-0005 checkpoint (spike scope, probe evidence, GO decision). Worktree has uncommitted checkpoint bookkeeping.

## README Status

CURRENT — README describes M1 complete (T-0001 + T-0002 + T-0003), picker usage + session-reuse guarantee.

## Important Context

Discovery done 2026-09-29: VS Code 1.125+, managed+external server, 1:1 session map, text-only MVP. References in %TEMP% (refreshed 2026-09-29): opencode v2 (293d60a), openchamber v2 (566ba61), opencode-copilot-chat (191f6df), opencode-llm-proxy v1 (8c262c4). Local opencode v2.0.18 available.

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.
- Do not add tool passthrough to the MVP (deferred follow-up).

## Last Session

T-0005 completed with evidence: GO for plugin-based build; all four probes verified live.

## Resume Instruction

Read this file first. T-0005 is COMPLETE (GO); the full tool-bridge build is the recommended next task.
