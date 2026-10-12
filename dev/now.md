# NOW

> Primary current-state snapshot and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

BUILD

## State Integrity

CONSISTENT (M5 COMPLETE 2026-10-12: T-0024/T-0025/T-0027/T-0028/T-0029/T-0030 VERIFIED + T-0026 CANCELLED in `dev/tasks/done/`; no active task, no open milestone)

## Current Milestone

M5 — COMPLETE (2026-10-12): scale + observability (see `dev/milestones/M-0005-scale-observability.md`). All tasks VERIFIED except T-0026 CANCELLED; no open tasks.

## Current Task

None (M5 COMPLETE 2026-10-12; no open tasks, no open milestone).

## Current Step

M5 marked COMPLETE 2026-10-12 (exit criteria all met: TS 6.0.3 + `lint`/`test` 203/203 green, per-group cap + status/table, `showSessions` table, usage DataPart, README rewrite, model-switch EDH PASS; T-0026 CANCELLED/blocked, parked PL-0007). Next: commit checkpoint.

## Objective

Build a VS Code extension bridging local opencode v2 (`opencode serve`) into Copilot Chat as provider "OCT", with opt-in gate, managed server, 1 conversation = 1 session reuse, and the M2 tool bridge (Copilot tools via plugin + shuttle; engine approvals with default-deny).

## Last Completed

- T-0025 VERIFIED (2026-10-10): per-workspace session cap (`lint` + `test` 159/159 + `compile` green + EDH PASS). Committed `f1e118c`.
- T-0024 COMPLETE (2026-10-10): TypeScript 6.0.3 upgrade (`lint` + `test` 147/147 + `compile` green + human PASS). Committed `f1e118c`.
- T-0026 CANCELLED (2026-10-10; goal corrected 2026-10-12): `cleanupOrphans` deleting engine sessions of *deleted Copilot chats* — blocked, no chat-deletion API; parked PL-0007. Graveyard-only scope kept; no verification required.
- T-0030 VERIFIED (2026-10-12): model-switch regression (`lint` + `test` 203/203 + `compile` green + owner EDH PASS: same id on exist, dropped/deleted notices, no new session).
- Earlier: `dev/tasks/done/` (T-0001..T-0023) + `dev/roadmap.md`.

## Last State Transaction

STATE_M5_COMPLETED

## Next Action

Commit checkpoint for M5 completion (authorized), then await user's next direction.

## Current Blocker

None.

## Relevant Files

- `dev/milestones/M-0005-scale-observability.md` (M5 scope + decisions)
- `dev/tasks/done/T-0030-model-switch.md` (just verified) + `dev/tasks/done/T-0029-human-readme.md`; `dev/tasks/done/T-0028-session-stats.md`, `dev/tasks/done/T-0025-per-workspace-cap.md`, `dev/tasks/done/T-0026-cleanup-retired.md` (cancelled)
- `dev/tasks/done/T-0025-per-workspace-cap.md` (last verified), `dev/tasks/done/T-0026-cleanup-retired.md` (cancelled)
- `ARCHITECTURE-MAP.md` (codebase navigation; code pointers live here)
- `dev/verification.md` + `dev/hdt.md` (verification contract + human gate, AAW 0.7.3)
- `dev/commit-policy.md` (ASK/ASK checkpoints)

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification Snapshot

Status: COMPLETE (M5 2026-10-12: all exit criteria met; `lint` + `test` 203/203 green re-confirmed. Tasks: T-0030 `lint`/`test` 203/203 + `compile` + EDH PASS; T-0028 `lint`/`test` 203/203 + `compile` + EDH PASS; T-0027 `lint`/`test` 185/185 + `compile` + EDH PASS; T-0025 `lint`/`test` 159/159 + `compile` + EDH PASS. T-0026 CANCELLED.)

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`.

## Last Commit

`853d49b feat: verify T-0030 model-switch regression + docs/state sync` (8 files: T-0030 → done/VERIFIED, README Limits merge + stay-on-OCT note, PL-0008, T-0026 goal correction, roadmap/milestone/now sync). Before: `4dc161f` (T-0029).

## README Status

T-0029 VERIFIED 2026-10-11 (human README rewrite, owner read-through PASS).

## Important Context

- M5 COMPLETE 2026-10-12: T-0024/T-0025/T-0027/T-0028/T-0029/T-0030 VERIFIED; T-0026 CANCELLED; no open tasks or milestones.
- Workflow AAW 0.7.3 (`c9739b8`, manifest `.aaw/manifest.yml`).
- Bug-fix records use stable IDs in `dev/bug-fixes/done/B-000X-*.md`: B-0001 (session map), B-0002 (turn errors + drive case), B-0003 (re-emit spin), B-0004 (continuation starvation + retry breaker), B-0005 (denial error UX).
- Local toolchain: opencode v2.0.21; VS Code 1.125+ (see `dev/verification.md` for prerequisites).

## Do Not Change

- Do not run the engine unless OCT is explicitly enabled.

## Resume Instruction

## Resume Instruction

Read this snapshot first, then the current task file (none active). Do not load all historical task/bug records merely to get oriented. Next: commit checkpoint for M5 completion (authorized).
