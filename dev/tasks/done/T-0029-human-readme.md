# T-0029 — Human-readable README

## Status

VERIFIED (M5, 2026-10-11 — owner read-through PASS)

## Objective

Rewrite `README.md` for humans: setup → pick model → chat → tools/approvals → sessions/cleanup → troubleshooting.

## Why

User-scoped M5 item 6. Current README is accurate but dense/agent-shaped.

## In Scope

- Human flow, short sections, commands + settings table, images/caps + Thinking Effort + per-folder notes kept but plain-languaged
- Keep agent entry points (`AGENTS.md`, `dev/now.md`, ADR) as links, not body

## Out of Scope

- Behavior change; changelog (see `dev/changelog-policy.md`)

## Acceptance Criteria

- [x] New contributor can enable → chat → cleanup from README alone (read-through — owner PASS 2026-10-11)

## HDT

NOT_REQUIRED — docs-only rewrite, no runtime/behavior change (`dev/verification.md`: docs-only needs read-through/render check; HDT gates runtime behavior). Human *review* of the text by the owner is still the VERIFIED bar for user-facing docs.

## Evidence

VERIFIED 2026-10-11 (owner read-through PASS + "verified & commit"):
- Acceptance criterion met; HDT NOT_REQUIRED (docs-only).
- Task COMPLETE; moved to `dev/tasks/done/`.
- `README.md` rewritten: Setup (6 numbered steps) → Models (picker + Refresh + Thinking Effort) → Tools/approvals (Copilot-primary/engine-fallback, read-silent, Default→ask, Bypass-silent, picker-vs-global note, managed ask-all vs external) → Images (caps) → Sessions (1:1, per-chat folder chain, Session Info, Status/Sessions views, 200-per-group cap, exact deleted/dropped notice strings verified against `src/provider/sessions.ts:100-111`) → Cleanup (graveyard, dry-run + confirm) → Commands table (6, titles match `package.json`) → Settings table (7, defaults match `package.json`/`src/config.ts`) → External-server checklist → Troubleshooting table → agent entry points as links only.
- Scope check: `git status` shows only `README.md` + state files (`dev/now.md`, `dev/roadmap.md`, task file); no `src/` change, no changelog (out of scope per task).
- No `lint`/`test`/`compile` run: docs-only, no source or test touched (per verification matrix, read-through is the applicable check).
- Revision 2026-10-11 (owner feedback): repo URL `https://github.com/sekedus/opencode-for-copilot` in both clone commands; Setup split into "Install as a user" (clone → package → VSIX install → enable → chat) vs "Install as a developer" (clone → `F5` → enable → chat); new `Development` section (check/lint/test/compile/package) just before "For contributors and agents". Still docs-only, still no `src/` change.
- Revision 2026-10-11 (owner feedback): new `Limitations` section after Troubleshooting (dead chats stay dead → new chat; no OS notifications; engine approvals ignore the per-chat picker, global `chat.permissions.default` only) — all three verified against code (`src/provider/sessions.ts:100-111`, PL-0005/PL-0006 parked in `dev/parking-lot.md`). Still docs-only.
- Revision 2026-10-11 (owner feedback): Troubleshooting closer now links to [Open an issue](https://github.com/sekedus/opencode-for-copilot/issues) instead of the vague "bug report". Still docs-only.
- Revision 2026-10-11 (owner feedback): opt-in NOTE now states the `opencode serve` process keeps running in the background and using RAM until disabled. Still docs-only.
