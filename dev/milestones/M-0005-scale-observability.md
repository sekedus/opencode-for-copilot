# M-0005 — Scale + observability

## Status

PLANNED (2026-10-10, user-scoped)

## Objective

Make the 1:1 conversation→session map observable and bounded per workspace, feed Copilot's Session Info UI from engine stats, and keep cleanup + docs human-usable. TypeScript pinned to 6.0.3.

## In Scope

- TS 6.0.3 upgrade (T-0024)
- Per-workspace/folder/group cap (T-0025)
- `cleanupOrphans` also deletes engine sessions of deleted Copilot chats (T-0026, CANCELLED — blocked, parked PL-0007)
- Session map table by group (T-0027, ref `Show Workspaces`)
- Opencode session stats in Copilot Session Info + status (T-0028)
- Human-readable README (T-0029)
- Model-switch regression: OCT session exist/dropped/deleted (T-0030)

## Out of Scope

- Marketplace publish, VSCodium, video/pdf ferry, OpenChamber webview parity
- OS toast (PL-0006), picker-level approvals (PL-0005)

## Exit Criteria

- [ ] `typescript@6.0.3`, `npm run lint` + `npm test` green
- [ ] Cap enforced per directory group; status/table shows per-group counts
- [ ] `oct.showSessions` table shows last chat, copilot id, opencode id, group
- [x] Turns emit `usage` DataPart; core Session Info shows non-zero context; status mirrors used/context/output
- [ ] ~~`cleanupOrphans` deletes engine sessions of deleted Copilot chats (404-checked, confirmed)~~ DROPPED with T-0026 (goal corrected 2026-10-12; blocked — no chat-deletion API; parked PL-0007; graveyard-only scope kept)
- [x] README rewritten for human setup/usage; model-switch behavior tested

## Tasks

- [x] T-0024 — TypeScript 6.0.3 upgrade
- [x] T-0025 — Per-workspace session cap
- [ ] ~~T-0026 — Cleanup engine sessions of deleted Copilot chats~~ CANCELLED 2026-10-10, goal corrected 2026-10-12 (blocked — no chat-deletion API; parked PL-0007)
- [x] T-0027 — Session map table (webview)
- [x] T-0028 — Session stats (usage DataPart + status)
- [x] T-0029 — Human-readable README
- [x] T-0030 — Model-switch regression (exist/dropped/deleted)

## Related Parking-Lot Ideas

None promoted (PL-0005/PL-0006 stay parked; PL-0007 added 2026-10-12 for the cancelled T-0026 goal; PL-0008 added 2026-10-12 for non-OCT-turn ferry, triggered by the T-0030 probe).

## Constraints / Decisions

- User decisions 2026-10-10: pin 6.0.3; per-directory cap; new `oct.showSessions` webview; DataPart + status stats; dead+dropped+orphans cleanup.
- VS Code core owns Session Info UI; provider only feeds `usage` DataPart + `maxInput/maxOutput` (see `%TEMP%/vscode` `chatContextUsageDetails.ts`, `%TEMP%/opencode-copilot-chat` `chatParts.ts`).
- Group key = `Entry.directory` (`unknown` last); no Copilot chat-list API — retired = dead/dropped marks.
- Verification per `dev/verification.md`; runtime parts need EDH/HDT.

## Notes

Summary/navigation only. Detail in `dev/tasks/T-0024..T-0030`.
