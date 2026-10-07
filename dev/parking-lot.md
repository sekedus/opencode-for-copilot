# Parking Lot

Ideas, questions, and distractions intentionally deferred from the current task.

## PL-0001

Date: 2026-10-05

Idea:

Ferry image bytes from bridged Copilot tool results to the engine instead
of placeholder text (multimodal bridge).

Triggered By:

EDH image redo 2026-10-05: `view_image` results reach the engine only as
`[Attachment omitted: image/png (N bytes) …]` (`src/provider/tools.ts:116-118`;
all `Tool result to engine: view_image (33x chars)` lines are that
placeholder), and prompt transport is text-only
(`src/server/client.ts:285-295`). The vision model confirmed it live
("Image viewer didn't return viewable data") and self-healed via
engine-native `read` (accurate descriptions of all 6 images) and PIL+OCR.

Action:

DEFER

Reason:

Needs design (binary transport via plugin callback vs engine prompt
`files` field; cap/permission implications) — bigger than verification.
Matches B-0004 follow-up and T-0015 out-of-scope "multimodal deferred".

Revisit When:

Image tools matter to users / a multimodal task is scoped.

## PL-0002

Date: 2026-10-05

Idea:

Bury session ids dropped by the restore-cap path (`OctSessionMap.restore`
breaks at `maxEntries` without `bury`), so cap-churned mappings at reload
join the orphan graveyard like create-eviction and `forget` do.

Triggered By:

T-0017 EDH Step 4/6: restore-cap at 3 then 2 dropped `ses_ef4577…`
(charlie) and `ses_ef456a…` (test2) without graveyard entries — the later
orphan cleanup could not list them.

Action:

RESOLVED by T-0019 (2026-10-05, EDH green): restore-cap overflow now buries +
records (`restore` loads graveyard/dropped first, then buries/records overflow).

Revisit When:

Orphan-cleanup completeness is scoped.

## PL-0003

Date: 2026-10-05

Idea:

Per-folder workspace directory for multi-root workspaces (`workspaceCwd`
uses `workspaceFolders[0]`, so chats in a second added folder still map
under the first folder's directory and status groups never split).

Triggered By:

T-0017 EDH Step 3: `Add Folder to Workspace` kept all chats in one group;
only `Open Folder` split groups.

Action:

DEFER (needs design: per-chat folder resolution + map key/directory
implications; single-folder behavior unchanged).

Revisit When:

Multi-root support is scoped.

## PL-0004

Date: 2026-10-05

Idea:

Announce the fresh start when a turn creates a new engine session for a
previously-known Copilot conversation whose mapping was dropped (cap
eviction, restore-cap, forget) — one in-chat line ("earlier session link
dropped, fresh engine session, earlier context unavailable") — instead of
silently recreating an amnesiac session. Not the T-0013 notice: the old
session is usually still alive, only the link is gone, so the chat keeps
working. Needs a persisted bounded dropped-keys set (separate from the
`dead` set — dead means never recreate), cleared on re-map.

Triggered By:

T-0017 EDH: charlie's capped-out chat silently forked to `ses_ef4422…`
with no history and no message; user expected at least a notice.

Action:

RESOLVED by T-0019 (2026-10-05, EDH green): dropped chats are retired T-0013-style
(block with `DROPPED_SESSION_MESSAGE`, creates nothing, retry repeats) via the
persisted `oct.droppedConversations.v1` record (separate from `dead`).

Revisit When:

Dropped-link UX is scoped.

## PL-0005

Date: 2026-10-07

Idea:

Follow the per-session Copilot picker level if VS Code ever exposes it
to `registerLanguageModelChatProvider` providers (upstream API request).

Triggered By:

T-0020 EDH test-1 turns 6/7 + re-check 2026-10-07: picker Allow-all /
Autopilot still ask because the live level is invisible to extensions.

Action:

DEFER (blocked upstream)

Reason:

Exhaustively source-verified 2026-10-07, all avenues closed:
`chat.permissions.default` is a read-only seed (picker writes per-session
memory `permissionLevel`, never config); `ProvideLanguageModelChatResponseOptions`
carries no level (`extHostLanguageModels $startChatRequest`; stable +
`chatProvider` proposal); no `sessions` namespace; `chatSessionsProvider`
proposal is own-sessions-only; `chatParticipantPrivate` exposes the level
only to participant handlers (different architecture); `github.copilot-chat`
0.63.0 exports no API and registers no permission commands (level lives in
its minified bundle closure); context keys are unreadable via public API;
storage-sqlite snooping and timing heuristics rejected (fragile/unreliable).
User chose global-setting-only; README documents the picker limit.

Revisit When:

VS Code ships a provider-visible session permission level (stable or
`enabledApiProposals`), or the picker starts writing
`chat.permissions.default`.

## PL-0006

Date: 2026-10-07

Idea:

Attention-only OS toast alongside engine approval dialogs for distracted
users (Windows Action Center; title + action + first resource only, no
buttons — never approves, never replies; in-window Allow/Cancel dialog
remains the only decision surface).

Triggered By:

T-0020 EDH test-1 turns 4/5 + test-2: no toast ever surfaced.

Action:

DEFER (blocked: no extension-side path; code removed, not disabled)

Reason:

Exhaustively tried 2026-10-07, all avenues closed: true OS toast is
`IHostService.showToast` (internal-only — main-process Electron
`Notification` + startup `setAppUserModelId` paired with the installed
shortcut, unreachable from the extension host; `vscode.d.ts` exposes no
OS toast). Extension-side WinRT from `powershell.exe` never surfaces:
identity-less notifier output is silently dropped (`Show()` accepts,
nothing appears), and firing under the host AppUserModelId (discovered
via `Get-StartApps`, probe toasts landed in Action Center History) still
produced no banner across two EDH sessions. Removed per user decision:
`src/system/notify.ts`, `oct.approvalOsNotify`, the translator ping call,
and all notify tests deleted (not left behind a flag).

Revisit When:

VS Code exposes an OS-toast API to extensions (stable or
`enabledApiProposals`), or a proven extension-side delivery path is found
(banner visibly confirmed in EDH, not just History-landed).
