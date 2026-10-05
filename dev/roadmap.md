# Roadmap

> Product roadmap. Do not invent milestones or tasks during workflow installation.
> The first real task ID starts at `T-0001` after project discovery/definition.

## Current Milestone

M3 — IN PROGRESS (2026-10-03): session management (configurable cap, prune-on-start, deleted-session UX), model display (`OCT / <name>` + vision), tool priority (Copilot primary, engine fallback).

## Tasks

- `T-0001` — Extension shell + activation gate — COMPLETE (enable/disable/status verified 2026-09-29).
- `T-0002` — Managed opencode server lifecycle — COMPLETE (managed spawn/health/stop verified 2026-09-29).
- `T-0003` — OCT chat provider with 1:1 session reuse (text-only) — COMPLETE (picker lists engine models; session reuse verified 2026-09-29).
- `T-0004` — Tool-bridge spike (bidirectional feasibility) — COMPLETE (no injection path; plugin path identified for T-0005).
- `T-0005` — Plugin echo-tool spike (block-and-resume loop) — COMPLETE (GO: block-and-resume + interrupt + filter proven; direct codemode:false tools).
- `T-0006` — Copilot tool bridge (execution + approvals) — COMPLETE (verified 2026-10-02: shuttle loop, approvals, B-0003/B-0004/B-0005 fixed).
- `T-0007` — Session title and sync — COMPLETE (verified 2026-10-02: derived engine titles + status list with prune; unique `OCT: <key8> <MM-DD HH:mm>` fallback; no reaper).
- `T-0008` — Unit tests (harness + pure-logic coverage) — COMPLETE (verified 2026-10-02: `npm test` 32/32 green, zero new deps).
- `T-0009` — VSIX packaging (local install artifact) — COMPLETE (verified 2026-10-02: 18-file artifact + user-run install proof).
- `T-0010` — Extension logo, icon & LICENSE — COMPLETE (verified 2026-10-03: `assets/` art + manifest `icon` + MIT `LICENSE`; `tsc` 0, package 21 files / 59.01 KB, `vsce` warning gone).
- `T-0011` — Configurable max stored sessions — COMPLETE (verified 2026-10-03: `tsc` 0, `npm test` 34/34).
- `T-0012` — Prune dead sessions on start — COMPLETE (verified 2026-10-04: per-id verify shared by startup + status; `tsc` 0, `npm test` 37/37).
- `T-0013` — Deleted session mid-turn tells user to start a new chat — COMPLETE (verified 2026-10-04: typed 404 + one-sentence throw; `tsc` 0, `npm test` 38/38).
- `T-0014` — Model name `OCT / <name>` + vision capability — COMPLETE (verified 2026-10-04: branding + `imageInput`; `tsc` 0, `npm test` 48/48).
- `T-0015` — Copilot tools primary, engine tools fallback — COMPLETE (verified 2026-10-05: `TOOL_NOTICE` removed, engine fallback; `tsc` 0, `npm test` 48/48).
- `T-0016` — Opt-in orphaned engine session cleanup — COMPLETE (verified 2026-10-05: graveyard + `oct.cleanupOrphans`; `tsc` 0, `npm test` 58/58).

## Future Milestones

- None defined — post-M2 scope undecided (standing OPEN: EDH redo with image workspace + Steps 3–8).

## Roadmap Rules

- Task IDs are unique and monotonic within the project.
- The task referenced by `dev/now.md` must exist here with the same ID and objective.
- Completed tasks move to a completed state and must not remain the active task.
- Roadmap entries describe direction and task status; detailed execution belongs in `dev/tasks/`.
