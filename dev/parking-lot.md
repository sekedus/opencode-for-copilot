# Parking Lot

The parking lot is an **active deferred queue**, not an archive.

Add only ideas that are clearly related to the project but intentionally outside the current scope.

Do not add unrelated brainstorming, speculative distractions, or implementation notes that belong in the current task.

```text
discover
  -> park
  -> later review
  -> promote to task/milestone OR reject/drop
  -> remove the parking-lot entry
```

When an entry is promoted, the new task or milestone may reference the old `PL-xxxx` ID, but the resolved parking-lot item should be deleted. Git history preserves the historical record.

## Entry Template

```markdown
## PL-0001

Date: YYYY-MM-DD

Idea:
[Project-related idea]

Triggered By:
[What caused the idea to appear during current work]

Action:
DEFER

Reason:
[Why it is outside the current scope]

Revisit When:
[Condition for reconsideration]
```

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

## PL-0007

Date: 2026-10-12

Idea:

Extend `oct.cleanupOrphans` so that when the Copilot chat behind a mapping
is deleted, the mapped opencode engine session is deleted too (behind the
same Delete confirmation; 404-checked; unmapped CLI sessions never touched).
(Correct goal of cancelled T-0026; the dead/dropped-mark proxy was the
agent's misunderstanding.)

Triggered By:

T-0026 goal correction 2026-10-12: the user asked for Copilot-chat-deletion-
driven cleanup, which the provider API cannot currently observe.

Action:

DEFER (blocked upstream)

Reason:

VS Code exposes no Copilot chat list or deletion signal to
`LanguageModelChatProvider` providers. The provider only learns a chat
exists when Copilot routes a turn to it (`modelOptions._conversationId`),
so a deleted chat is indistinguishable from an idle one. Dead/dropped
retired marks (T-0013/T-0019) are not equivalent to chat deletion and stay
as-is.

Revisit When:

VS Code ships a provider-visible Copilot chat/session listing or deletion
signal (stable or `enabledApiProposals`).

## PL-0008

Date: 2026-10-12

Idea:

Ferry non-OCT turns into the mapped opencode session so switching to a
Copilot/other model mid-chat and back leaves no memory gap.

Triggered By:

T-0030 model-switch probe 2026-10-12: 5-turn chat (1, 2, 5 OCT; 3, 4 other
vendor) — opencode session has no knowledge of turns 3-4 while the host
transcript shows all turns; README now warns to stay on OCT.

Action:

DEFER

Reason:

Outside M5 scope. Provider gets no callback on non-OCT turns (host routes
them elsewhere), so there is no hook today to observe/forward them;
ferrying would need a transcript-diff + inject-as-history design with
tool/approval implications.

Revisit When:

After T-0030, when a concrete ferry design exists (how to read host
transcript for the conversation key and replay non-OCT turns without
forking/duplicating engine history).
