# NOW

> Primary current-state snapshot and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (M5: T-0024/T-0025/T-0027/T-0028/T-0029 VERIFIED + T-0026 CANCELLED in `dev/tasks/done/`; T-0030 PLANNED in `dev/tasks/`; no active task)

## Current Milestone

M5 — IN_PROGRESS (2026-10-10): scale + observability (see `dev/milestones/M-0005-scale-observability.md`). T-0024/T-0025/T-0027/T-0028/T-0029 VERIFIED; T-0026 CANCELLED; T-0030 open.

## Current Task

None (T-0029 VERIFIED 2026-10-11; T-0030 PLANNED, next — start when the user asks).

## Current Step

T-0029 VERIFIED 2026-10-11 (human README rewrite, owner read-through PASS). Moved to `dev/tasks/done/`. Next: commit checkpoint, then T-0030 when the user asks.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, 1 conversation = 1 session reuse, and the M2 tool bridge (Copilot tools via plugin + shuttle; engine approvals with default-deny).

## Last Completed

- T-0025 VERIFIED (2026-10-10): per-workspace session cap (`lint` + `test` 159/159 + `compile` green + EDH PASS). Committed `f1e118c`.
- T-0024 COMPLETE (2026-10-10): TypeScript 6.0.3 upgrade (`lint` + `test` 147/147 + `compile` green + human PASS). Committed `f1e118c`.
- T-0026 CANCELLED (2026-10-10): retired-session cleanup dropped, graveyard-only scope kept; no verification required.
- Earlier: `dev/tasks/done/` (T-0001..T-0023) + `dev/roadmap.md`.

## Last State Transaction

STATE_T-0029_VERIFIED

## Next Action

Commit the T-0029 checkpoint (owner said "verified & commit"). T-0030 is next (PLANNED) — start when the user asks.

## Current Blocker

None.

## Relevant Files

- `dev/milestones/M-0005-scale-observability.md` (M5 scope + decisions)
- `dev/tasks/T-0029-human-readme.md` + `dev/tasks/T-0030-model-switch.md` (M5 remaining planned); `dev/tasks/done/T-0028-session-stats.md` (just verified)
- `dev/tasks/done/T-0025-per-workspace-cap.md` (last verified), `dev/tasks/done/T-0026-cleanup-retired.md` (cancelled)
- `ARCHITECTURE-MAP.md` (codebase navigation; code pointers live here)
- `dev/verification.md` + `dev/hdt.md` (verification contract + human gate, AAW 0.7.3)
- `dev/commit-policy.md` (ASK/ASK checkpoints)

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification Snapshot

Status: VERIFIED (T-0028 2026-10-11: `lint` + `test` 203/203 + `compile` green + owner EDH PASS incl. the 192K denominator re-check; T-0027 2026-10-11: `lint` + `test` 185/185 + `compile` green + owner EDH PASS; T-0025 2026-10-10: `lint` + `test` 159/159 + `compile` green + owner EDH PASS; per-task evidence in task files. T-0026 CANCELLED, no verification required. T-0029/T-0030 PLANNED.)

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`.

## Last Commit

`a8dba26 feat: session usage feed + status/table mirror (T-0028)`. Before: `062e855` (T-0027).

## README Status

T-0029 draft written 2026-10-11 (IN_PROGRESS): human flow setup → models → tools/approvals → images → sessions → cleanup → commands/settings tables → external → troubleshooting; agent entry points as links. Pending owner read-through for VERIFIED.

## Important Context

- M5 IN_PROGRESS: T-0024/T-0025 (`f1e118c`) + T-0027 VERIFIED; T-0026 CANCELLED; T-0028..T-0030 PLANNED.
- Workflow AAW 0.7.3 (`c9739b8`, manifest `.aaw/manifest.yml`).
- Bug-fix records use stable IDs in `dev/bug-fixes/done/B-000X-*.md`: B-0001 (session map), B-0002 (turn errors + drive case), B-0003 (re-emit spin), B-0004 (continuation starvation + retry breaker), B-0005 (denial error UX).
- Local toolchain: opencode v2.0.21; VS Code 1.125+ (see `dev/verification.md` for prerequisites).

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.

## Resume Instruction

Read this snapshot first, then the current task file. Do not load all historical task/bug records merely to get oriented. Next: owner read-through of the T-0029 README draft.
