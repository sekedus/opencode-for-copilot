# T-0027 — Session map table (webview)

## Status

VERIFIED (M5, 2026-10-11 — owner EDH PASS)

## Objective

New `oct.showSessions` table grouped by workspace/folder: last chat, copilot session id, opencode session id, group.

## Why

User-scoped M5 item 4. Status output is log text; users need a `Show Workspaces`-style table.

## Design

- Ref `%TEMP%/vscode-workspace-storage-cleanup` `showWorkspacePanelAsync` (`src/extension.ts:107`, `media/webview.html/script.js`): webview panel + `set-workspaces`-style `postMessage`, columns checkbox-free.
- Columns: last chat (engine `time.updated ?? time.created`, fallback age-unknown), copilot id (conversation key short), opencode id, group (directory, `unknown` last). Data: `mappedSessions()` + one `listSessions(500)` pass for titles/times (same as status, never for prune).
- Command `oct.showSessions` in `package.json`; grouped + sorted like `groupSnapshotsByDirectory`.
- v2 revision (owner feedback 2026-10-11): one section per group, Group column removed; columns are Last chat, Copilot chat (full key, plain selectable text), Opencode session (full id, plain text), Opencode title (engine title; group header + title cells link to open the workspace folder, `unknown` stays plain); cells wrap with column min-widths, each table scrolls x/y in its wrapper; body font at VS Code size (no 0.9em shrink). Copilot chat titles are NOT available — the public VS Code API (`vscode.chat` = `createChatParticipant` only, verified in `@types/vscode`) exposes no other participant's chat list/titles; the provider only ever sees the opaque conversation key.
- v3 revision (owner feedback 2026-10-11): Last chat shows the full local timestamp `yyyy-mm-dd hh:mm:ss` plus a verbose relative age (`N seconds/minutes/hours/days/months/years ago`, singular/plural); title column is plain text again (only the group header links the folder); copilot id, opencode id, and title cells use `user-select: all` so double-click selects the whole value for copy.

## In Scope

- Command + webview (`media/` or inline HTML), grouping/sorting helpers reuse
- Unit tests for row shaping/sorting (pure); EDH open + verify rows

## Out of Scope

- Delete actions in table (cleanup stays `cleanupOrphans`); stats (T-0028)

## Acceptance Criteria

- [x] `OCT: Show Sessions` opens grouped table with the 4 columns (v1 shape EDH-verified 2026-10-11; v2/v3 revisions re-check pending)
- [x] `npm run lint` + `npm test` green + EDH open green (`lint` + `test` 185/185 + `compile` green; EDH re-check of v2/v3 pending)

## HDT

REQUIRED — new user-visible runtime surface (sessions webview) with only partial unit coverage; the project verification contract requires EDH runtime proof for session-related changes. PASSED 2026-10-11 (owner EDH reports below).

## Evidence

IMPLEMENTED + TESTED 2026-10-10 (AWAITING_HDT):
- `src/provider/sessions.ts`: `sessionLastActivityMs()` (`time.updated ?? time.created`, number + ISO tolerant, garbage → undefined) sharing a `sessionTimeMs` coercion with `sessionCreatedMs` (behavior unchanged); `shortConversationKey()` promoted from the status list to a shared pure helper.
- `src/provider/sessionTable.ts` (new): `buildSessionTableGroups()` (rows carry copilot short id, opencode id, group, title, last-active age; grouped/sorted via `groupSnapshotsByDirectory`, `unknown` last; unlisted ids stay age-unknown rows, engine list never a prune signal) + `escapeHtml()` for all dynamic webview text.
- `src/extension.ts`: `oct.showSessions` command (provider-active + server-connected guards; prune-sweep first, then one `listSessions(500)` display pass; reused panel, scripts disabled, `retainContextWhenHidden`); `renderSessionsHtml()` static table (4 columns, group sections with counts, empty state, full-key/title tooltips, `default-src 'none'` CSP); status list now uses the shared `shortConversationKey` (output identical).
- `package.json`: `oct.showSessions` → `OCT: Show Sessions`.
- `test/sessions.test.ts`: +12 tests — `sessionLastActivityMs` (4: updated-preferred, created fallback, ISO, garbage), `shortConversationKey` (3), `escapeHtml` (2), `buildSessionTableGroups` (3: shaping/grouping/ages, unlisted-kept, order).
- `npm run lint` green (`check` + `compile-tests`).
- `npm test` green: 171/171 (was 159/159; +12 new).
- `npm run compile` green.
- `ARCHITECTURE-MAP.md`: webview ownership updated (extension glue owns read-only sessions table; new Session table row).
- Security (Level 1 — displays untrusted engine titles/paths, no auth/session/network boundary change): targeted review — all dynamic strings escaped, `enableScripts: false`, explicit `default-src 'none'` CSP, no password/token/ids leave the loopback path (same data the status command already logs). No findings; runtime proof deferred to EDH.
- EDH v1 PASS (owner, 2026-10-11, screenshot): `OCT: Show Sessions` opens the panel; 3 mapped conversations in 2 correct groups (`test` × 2, `test2` × 1) with plausible last-chat ages + ids. No data errors found; owner requested the v2 revision below instead of closing.
- v2 REVISION (owner feedback 2026-10-11, IMPLEMENTED + TESTED, AWAITING_HDT):
- `src/provider/sessionTable.ts`: `renderSessionsHtml()` moved here (pure, unit-tested) + `createNonce()`; one section per group (Group column gone); full ids as plain text; opencode-title column; group-header + title folder links (`unknown` plain); wrap/min-width/scroll CSS; body at VS Code font size; nonce-bound click delegate posting `open-folder`.
- `src/extension.ts`: panel now `enableScripts: true` (delegate only) + `handleSessionsMessage()` (`open-folder` → `env.openExternal`, validated non-empty string, error notice on failure); local renderer deleted (shared import).
- `test/sessions.test.ts`: +8 tests — `createNonce` (1), `renderSessionsHtml` (7: 4 headers/no-Group, full ids, folder links incl. `unknown`-plain, hostile escaping, nonce↔CSP binding, wrap/scroll CSS, empty state).
- `npm run lint` green; `npm test` green: 179/179 (was 171/171; +8 new); `npm run compile` green.
- Security re-review (v2 enables scripts): delegate is a static nonce-bound inline script (no dynamic code, no external resources, CSP `script-src 'nonce-…'` only); all dynamic strings still escaped; `open-folder` validates input and only opens (never executes). No findings; runtime proof = EDH re-check.
- EDH re-check of v2: PENDING (owner re-runs `OCT: Show Sessions` and confirms columns/links/wrap).
- v3 REVISION (owner feedback 2026-10-11, IMPLEMENTED + TESTED, AWAITING_HDT):
- `src/provider/sessions.ts`: `formatDateTime()` (zero-padded local `yyyy-mm-dd hh:mm:ss`), `formatRelativeAge()` (verbose units with singular/plural), `formatLastChat()` (combined cell text); garbage/future → undefined (age unknown).
- `src/provider/sessionTable.ts`: rows carry `lastChat` (replaces compact `age`/`lastActiveMs`); title cells plain text; copilot/opencode/title cells get `user-select: all`; last column min-width 250px, table min-width 940px.
- `test/sessions.test.ts`: +6 tests — time formatters (5: padding, garbage, all units, future/missing, combined) plus updated row/render expectations (full-timestamp cells, plain selectable title, `user-select:all` CSS).
- `npm run lint` green; `npm test` green: 185/185 (was 179/179; +6 new); `npm run compile` green.
- EDH re-check of v2/v3: PASS (owner, 2026-10-11 — "verified": full-timestamp last-chat cells, no title links, double-click selects full id/title, single click places caret).
- v3.1 FIX (owner feedback 2026-10-11, IMPLEMENTED + TESTED, EDH-verified): `user-select: all` selected on single click — replaced with a `dblclick` delegate (`selectNodeContents` on `td.selectable`, default word-selection suppressed); single click keeps normal caret behavior. CSS is now explicit `user-select:text`. Tests updated (no `user-select:all`, delegate strings asserted). `lint` + `test` 185/185 + `compile` green.
