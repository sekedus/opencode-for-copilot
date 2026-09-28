# Roadmap

> Product roadmap. Do not invent milestones or tasks during workflow installation.
> The first real task ID starts at `T-0001` after project discovery/definition.

## Current Milestone

M1 — OCT text-only MVP (bridge opencode v2 into Copilot Chat as provider `oct`).

## Tasks

- `T-0001` — Extension shell + activation gate — COMPLETE (enable/disable/status verified 2026-09-29).
- `T-0002` — Managed opencode server lifecycle — COMPLETE (managed spawn/health/stop verified 2026-09-29).
- `T-0003` — OCT chat provider with 1:1 session reuse (text-only) — PLANNED.

## Future Milestones

- M2 — Tool-call bridge, session title/sync, tests, VSIX packaging.

## Roadmap Rules

- Task IDs are unique and monotonic within the project.
- The task referenced by `dev/now.md` must exist here with the same ID and objective.
- Completed tasks move to a completed state and must not remain the active task.
- Roadmap entries describe direction and task status; detailed execution belongs in `dev/tasks/`.
