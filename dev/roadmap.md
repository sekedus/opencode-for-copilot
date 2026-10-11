# Roadmap

> Product roadmap. Do not invent milestones or tasks during workflow installation.
> The first real task ID starts at `T-0001` after project discovery/definition.

## Current Milestone

M5 — PLANNED (2026-10-10): scale + observability (TS 6.0.3, per-workspace cap, retired-cleanup, session table, session stats, human README, model-switch regression). See `dev/milestones/M-0005-scale-observability.md`.

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
- `T-0017` — Cap tuning: default, evict-dead-first, status grouping — COMPLETE (verified 2026-10-05: default 200, dead-first eviction, directory groups + ages; `tsc` 0, `npm test` 73/73).
- `T-0018` — TypeScript lint (strict unused checks, zero-dep) — COMPLETE (verified 2026-10-05: `npm run lint` green + TS6133 negative check; `tsc` 0, `npm test` 73/73).
- `T-0019` — Dropped-mapping completeness (PL-0002 + PL-0004 merged) — COMPLETE (verified 2026-10-05: `tsc` 0, `npm test` 84/84, EDH replay green).
- `T-0020` — Copilot-gated approval + attention ping — COMPLETE (verified 2026-10-07: Allow/Cancel dialog on global Default, silent read/Bypass/Autopilot, trust removed, managed ask-all enforced incl. allow-override proof; OS ping parked PL-0006; `tsc` 0, `npm test` 99/99, EDH test-3/4/5 green).
- `T-0021` — Thinking Effort via configure-model (engine variants, single entry) — COMPLETE (verified 2026-10-07: `tsc` 0, `npm test` 117/117, live create/switch variant probe green, EDH steps 1–7 green incl. same-session effort switch).
- `T-0022` — Per-folder workspace directory (PL-0003, multi-root) — COMPLETE (verified 2026-10-07: `tsc` 0, `npm test` 128/128, two-folder EDH green).
- `T-0023` — Multimodal tool-result ferry (PL-0001) — COMPLETE (verified 2026-10-07: `tsc` 0, `npm test` 147/147, EDH A+B green + regression pass).
- `T-0024` — TypeScript 6.0.3 upgrade — COMPLETE (2026-10-10: 6.0.3 + `types:["node"]`, `lint` + `test` 147/147 + `compile` green, human verification PASS).
- `T-0025` — Per-workspace session cap — VERIFIED (2026-10-10: `lint` + `test` 159/159 + `compile` green + owner EDH PASS: 2+2 per-group, A3 evicts A1 only, reload stable).
- `T-0026` — Cleanup retired engine sessions — CANCELLED (2026-10-10, owner decision after goal review; graveyard-only cleanup scope kept).
- `T-0027` — Session map table (webview) — VERIFIED (2026-10-11: `oct.showSessions` grouped table + `lint`/`test` 185/185 + `compile` green + owner EDH PASS).
- `T-0028` — Session stats (usage DataPart + status) — VERIFIED (2026-10-11: `lint`/`test` 203/203 + `compile` green + owner EDH PASS).
- `T-0029` — Human-readable README — PLANNED (M5).
- `T-0030` — Model-switch regression (exist/dropped/deleted) — PLANNED (M5 test).

## Future Milestones

- None — M5 active (T-0024/T-0025/T-0027 VERIFIED 2026-10-10/11; T-0026 CANCELLED; T-0028..T-0030 PLANNED).

## Roadmap Rules

- Task IDs are unique and monotonic within the project.
- The task referenced by `dev/now.md` must exist here with the same ID and objective.
- Completed tasks move to a completed state and must not remain the active task.
- Completed task files move to `dev/tasks/done/` only after all required verification gates pass (including HDT when required).
- Creating a milestone and decomposing a multi-item request is planning-only unless the user explicitly authorizes implementation; leave child tasks `PLANNED` and stop.
- Roadmap entries describe direction and task status; detailed execution belongs in `dev/tasks/` (active) and `dev/tasks/done/` (completed).
