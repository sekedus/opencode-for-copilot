# Architecture Map

> Living navigation map. Codebase wins over this file; source/config/tests are the source of truth.

## Status

ACTIVE — reflects the current bridge (text turns + tool bridge + approvals, opencode v2).

## 1. System Overview

```text
User / Copilot Chat (GUI, picker, tools, permissions)
    ↓  vscode.LanguageModelChatProvider API (vendor `oct`)
OCT extension (this repo — one read-only webview: OCT Sessions table)
    ↓  REST + SSE `/api/*` (Basic `opencode:<pw>`)
opencode v2 server, loopback (`opencode serve`)
    ↓  plugin hooks + callbacks
Copilot tools (host) / engine-native tools (fallback)
```

The bridge owns server lifecycle, model listing, and chat mapping. History lives server-side: 1 Copilot conversation = 1 opencode session, reused across turns.

## 2. Major Boundaries

### Extension host glue (`src/extension.ts`, `src/config.ts`, `src/binary.ts`, `src/output.ts`)

Owns: activation gate (`oct.enabled`, default off), commands (`enable/disable/status/showSessions/refreshModels/cleanupOrphans`), startup wiring (shuttle → server → provider registration), status/prune display, sessions table webview (`oct.showSessions`: scripts enabled for a nonce-bound folder-open delegate only, `open-folder` → OS file manager).
Does not own: turn logic, session map internals, SSE parsing.

### Provider layer (`src/provider/`)

Owns: picker models, conversation→session mapping, prompt building, turn orchestration, streaming, tool shuttle, approvals.
Entry: `OctChatProvider` (`src/provider/octProvider.ts`) registered via `vscode.lm.registerLanguageModelChatProvider("oct", …)`.

### Server layer (`src/server/`)

Owns: opencode process lifecycle (managed spawn / external health-check) and the minimal `/api/*` REST client.
Does not own: any VS Code UI or chat semantics.

### Engine plugin (`plugin/oct-tools/index.js`, plain JS, no build)

Owns: registering per-turn Copilot tools as engine tools (`oct__*`, `codemode:false`) and blocking executors until the host answers. Loaded by the engine, not by VS Code.

## 3. Major Components

| Component | Location | Responsibility | Depends on | Used by |
|---|---|---|---|---|
| Activation + commands | `src/extension.ts` | gate, server start, provider registration, status/prune/cleanup commands | config, manager, provider, shuttle | VS Code runtime |
| Server manager | `src/server/manager.ts` | managed `opencode serve` spawn (free port, `server listening on` parse, `/api/info` poll, kill) vs external health-check; injects plugin + ask-all perms via `OPENCODE_CONFIG_CONTENT` | client, output | extension |
| REST client | `src/server/client.ts` | `requestJson` + session/model/permission/prompt endpoints; auth header; 404-typed errors | — | manager, provider, extension |
| Chat provider | `src/provider/octProvider.ts` | turn routing: key → session → new-turn vs tool-continuation vs stuck/supersede; model pin + variant | sessions, streaming, tools, messages | extension |
| Session map | `src/provider/sessions.ts` | conversation-key → session-id map, cap `oct.maxSessions`/`200` per workspace directory group (`unknown` own group, dead-first in-group, T-0025), dead/dropped/orphan records, per-chat directory + title helpers, `sessionLastActivityMs` + `shortConversationKey` display helpers (T-0027) | client | provider, extension |
| Session table | `src/provider/sessionTable.ts` | pure table shaping: `buildSessionTableGroups` (grouped/sorted like status) + `escapeHtml` + `createNonce` + `renderSessionsHtml` (4 columns, folder links, wrap/scroll CSS, nonce-bound click delegate); panel + `open-folder` handler owned by `extension.ts` (`oct.showSessions`) | sessions | extension |
| Turn streaming | `src/provider/streaming.ts` | SSE first (`GET /api/event`) then `POST prompt`; deltas → `LanguageModelTextPart`; tool-pause vs terminal events; approval inline | client, permissions, tools | provider |
| Tool shuttle | `src/provider/tools.ts` | loopback HTTP callback (`/oct/pending-tools`, `/oct/execute`), pending registry, blocked-executor table, repeat breaker | output, images | provider, plugin |
| Permissions | `src/provider/permissions.ts` | `permission.asked` → Allow/Cancel vs Copilot global `chat.permissions.default`; `read` silent; default-deny; never sends `always` | client | streaming |
| Models / messages / images | `src/provider/models.ts`, `messages.ts`, `images.ts` | picker entries (`providerID/modelID`, Thinking Effort variants), prompt text+`files`, image ferry caps (15 MB/image, 50 images / 40 MB per turn) | client types | provider |

## 4. Important Flows

New turn:

```text
Copilot message → provider (conversationKey) → sessions.getOrCreate
  → promptSession(text + files) → SSE session.text.delta → chat UI
  → session.idle/execution.* → done
```

Tool bridge turn (primary when plugin present):

```text
turn carries Copilot defs → shuttle.setPending → plugin pull (prompt hook)
  → engine calls oct__* → executor POST /oct/execute (held open)
  → streaming pauses, emits ToolCallPart → host executes
  → next provider call extractToolResults → shuttle.resolve
  → engine resumes → continuation streams → done
```

Approval (engine-native action):

```text
permission.asked (SSE) → permissions.ask (read silent; else Copilot global:
  autoApprove/autopilot silent, default/assisted/unknown → Allow/Cancel)
  → reply once/reject (default-deny: timeout/dismiss/cancel → reject)
  → denied turn ends with one clean sentence
```

Session health:

```text
startup/status: GET /api/session/:id per mapping (404 = dead → prune; other errors = keep)
deleted mid-turn (404): forget + markDead → start-a-new-chat notice, no recreate
dropped link (evict/forget/prune): retired notice; id → orphan graveyard → opt-in delete
```

## 5. Data / State Boundaries

- Chat UI / picker state — owned by VS Code + Copilot; extension only reports parts.
- Conversation→session map + dead/dropped/orphan records — owned by `OctSessionMap`, persisted in `globalState` (`oct.conversationSessions.v1`, `oct.deadConversations.v1`, `oct.droppedConversations.v1`, `oct.orphanedSessions.v1`); survives reload/dispose.
- Engine history — owned by the opencode server; extension sends only the current turn.
- Server credentials — owned by manager/provider in memory (`oct.opencodePassword` setting, else env, else generated in managed mode); never logged.
- Callback token — owned by shuttle (per-window random unless `oct.callbackToken`); loopback only.
- Config (`oct.*`) — owned by VS Code settings; read fresh per decision where it matters (permission level).

## 6. External Integrations

- VS Code API (`vscode.lm` provider, `workspace`, `window`, `globalState`): integration point for the whole extension; requires VS Code `^1.125.0` + proposed chatProvider API.
- opencode v2 server (`opencode serve`, REST+SSE `/api/*`): the engine; v2 only (binary check `--version`, `MIN_OPENCODE_MAJOR = 2`); managed (spawned) or external (`oct.opencodeUrl`, manual plugin install).
- Filesystem (workspace dirs, plugin dir, `process.cwd()` fallback): per-chat `location.directory` pinned at create; canonicalized (drive-letter case matters to the engine).
- Network: managed server + tool callback are loopback-only (`127.0.0.1`; server via Basic `opencode:<pw>`, callback via token header); external `oct.opencodeUrl` is user-provided. 32 MB callback cap.

## 7. Tests and Verification Boundaries

- Unit tests: `test/*.test.ts` (`sessions`, `streaming`, `messages`, `models`, `permissions`, `images`) with `test/shims/` + `test/vscode-mock.mjs`; run via `npm run lint` (`tsc` + `compile-tests`) and `npm test` (`compile-tests` + `node ./test/run.mjs`).
- Coverage: pure helpers (keys, titles, directories, models, images, permissions parsing, shuttle mapping); no live server/VS Code coverage.
- Runtime verification (required for turns, tools, approvals, images): Extension Development Host (`F5`) + `OCT: Enable` + reload against a real `opencode serve` v2.

## 8. Hotspots / Sensitive Boundaries

- Session reuse invariant (`sessions.ts`, `octProvider.ts`): never create per turn; reuse turns must not rewrite `Entry.directory`; 404 is the only prune/remap signal — uncertain errors must keep the mapping.
- Streaming race (`streaming.ts` ↔ `tools.ts`): SSE first, prompt fire-and-observe; `step.ended` is not terminal; emitted-callIds must never re-emit (stuck-turn abort instead).
- Permission default-deny (`permissions.ts`, `manager.ts` ask-all injection): timeout/dismiss/cancel/undeliverable → deny + interrupt; never send `always`; `read` is the only silent exception; external servers must set ask-all themselves.
- Shuttle ↔ plugin protocol (`tools.ts` ↔ `plugin/oct-tools/index.js`): `oct__` naming, pull-not-push registry, held `/oct/execute` responses; changes must stay in sync on both sides.
- Managed process lifecycle (`manager.ts`): only kill owned processes (POSIX group / `taskkill`); external servers are never touched; startup ordering is shuttle → server → provider.

## Update Rule

Update this map in the same change when module ownership, boundaries, flows, entry points, public contracts, hotspots, or test surfaces materially change. Do not rewrite it for trivial implementation edits.
