# Parking Lot

Ideas, questions, and distractions intentionally deferred from the current task.

## PL-0001

Date: YYYY-MM-DD

Idea:

[Idea]

Triggered By:

[What caused the idea to appear during current work.]

Action:

DEFER

Reason:

[Why it is not part of the current task.]

Revisit When:

[Condition for reconsideration.]

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
