# T-0027 — Session map table (webview)

## Status

PLANNED (M5, 2026-10-10)

## Objective

New `oct.showSessions` table grouped by workspace/folder: last chat, copilot session id, opencode session id, group.

## Why

User-scoped M5 item 4. Status output is log text; users need a `Show Workspaces`-style table.

## Design

- Ref `%TEMP%/vscode-workspace-storage-cleanup` `showWorkspacePanelAsync` (`src/extension.ts:107`, `media/webview.html/script.js`): webview panel + `set-workspaces`-style `postMessage`, columns checkbox-free.
- Columns: last chat (engine `time.updated ?? time.created`, fallback age-unknown), copilot id (conversation key short), opencode id, group (directory, `unknown` last). Data: `mappedSessions()` + one `listSessions(500)` pass for titles/times (same as status, never for prune).
- Command `oct.showSessions` in `package.json`; grouped + sorted like `groupSnapshotsByDirectory`.

## In Scope

- Command + webview (`media/` or inline HTML), grouping/sorting helpers reuse
- Unit tests for row shaping/sorting (pure); EDH open + verify rows

## Out of Scope

- Delete actions in table (cleanup stays `cleanupOrphans`); stats (T-0028)

## Acceptance Criteria

- [ ] `OCT: Show Sessions` opens grouped table with the 4 columns
- [ ] `npm run lint` + `npm test` green + EDH open green

## Evidence

None yet (PLANNED).
