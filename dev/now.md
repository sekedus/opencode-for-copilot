# NOW

> Primary current-state snapshot and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (M5: T-0024/T-0025 VERIFIED + T-0026 CANCELLED in `dev/tasks/done/`; T-0027..T-0030 PLANNED in `dev/tasks/`; current task T-0027 matches roadmap)

## Current Milestone

M5 — IN_PROGRESS (2026-10-10): scale + observability (see `dev/milestones/M-0005-scale-observability.md`). T-0024/T-0025 VERIFIED; T-0026 CANCELLED; T-0027..T-0030 open.

## Current Task

T-0027 — Session map table (webview) (PLANNED, next).

## Current Step

T-0026 CANCELLED 2026-10-10 (owner decision: retired-mapping semantics stand as-is; `cleanupOrphans` keeps graveyard-only scope; no code changes). Next: implement T-0027 when the user asks.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, 1 conversation = 1 session reuse, and the M2 tool bridge (Copilot tools via plugin + shuttle; engine approvals with default-deny).

## Last Completed

- T-0025 VERIFIED (2026-10-10): per-workspace session cap (`lint` + `test` 159/159 + `compile` green + EDH PASS). Committed `f1e118c`.
- T-0024 COMPLETE (2026-10-10): TypeScript 6.0.3 upgrade (`lint` + `test` 147/147 + `compile` green + human PASS). Committed `f1e118c`.
- T-0026 CANCELLED (2026-10-10): retired-session cleanup dropped, graveyard-only scope kept; no verification required.
- Earlier: `dev/tasks/done/` (T-0001..T-0023) + `dev/roadmap.md`.

## Last State Transaction

STATE_T-0027_NEXT

## Next Action

T-0027 is next (PLANNED). Start it when the user asks.

## Current Blocker

None.

## Relevant Files

- `dev/milestones/M-0005-scale-observability.md` (M5 scope + decisions)
- `dev/tasks/T-0027-session-table.md` through `dev/tasks/T-0030-model-switch.md` (M5 remaining planned)
- `dev/tasks/done/T-0025-per-workspace-cap.md` (last verified), `dev/tasks/done/T-0026-cleanup-retired.md` (cancelled)
- `ARCHITECTURE-MAP.md` (codebase navigation; code pointers live here)
- `dev/verification.md` + `dev/hdt.md` (verification contract + human gate, AAW 0.7.3)
- `dev/commit-policy.md` (ASK/ASK checkpoints)

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification Snapshot

Status: VERIFIED (T-0025 2026-10-10: `lint` + `test` 159/159 + `compile` green + owner EDH PASS; per-task evidence in task files. T-0026 CANCELLED, no verification required. T-0027..T-0030 PLANNED.)

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`.

## Last Commit

`c9739b8 feat: update AAW to 0.7.3` (workflow-only). Before: `f1e118c` (T-0024 + T-0025). Worktree has uncommitted M5 bookkeeping (roadmap/milestone T-0026 cancellation, T-0026 moved to `done/`) plus this snapshot rewrite.

## README Status

No README change required by this snapshot rewrite (workflow bookkeeping only). Last product coverage predates M5; the M5 README pass is T-0029 (PLANNED).

## Important Context

- M5 IN_PROGRESS: T-0024/T-0025 VERIFIED (`f1e118c`); T-0026 CANCELLED; T-0027..T-0030 PLANNED.
- Workflow AAW 0.7.3 (`c9739b8`, manifest `.aaw/manifest.yml`).
- Bug-fix records use stable IDs in `dev/bug-fixes/done/B-000X-*.md`: B-0001 (session map), B-0002 (turn errors + drive case), B-0003 (re-emit spin), B-0004 (continuation starvation + retry breaker), B-0005 (denial error UX).
- Local toolchain: opencode v2.0.21; VS Code 1.125+ (see `dev/verification.md` for prerequisites).

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.

## Resume Instruction

Read this snapshot first, then the current task file. Do not load all historical task/bug records merely to get oriented. Next: start T-0027 when the user asks.
