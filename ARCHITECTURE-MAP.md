# Architecture Map — opencode-for-copilot (OCT bridge)

## Status

CONFIRMED against the current implementation (sources read 2026-10-08).
Scope: what EXISTS today. No future/refactoring architecture is described here.

Evidence order used: source code > `package.json` / `tsconfig.json` > tests >
`README.md` / `CONTEXT.md` / `dev/project.md` / `docs/adr/0001-oct-bridge-architecture.md`.
Anything not establishable from those is marked `Unknown` / `Needs verification`.

## 1. System overview

This repo is a single VS Code extension ("OCT bridge") that plugs a **local
opencode v2 server (the "engine")** into **native VS Code Copilot Chat** as
provider `oct` / display name `OCT`.

```text
Copilot Chat UI (host-owned)
  ⇄  vscode.lm LanguageModelChatProvider API (vendor `oct`)
  ⇄  OCT extension host code (`src/`, runs in the Extension Host)
  ⇄  opencode v2 REST + SSE (`/api/*`) — managed loopback child process or user-configured external URL (loopback guaranteed for managed only)
  ⇄  oct-tools plugin (runs INSIDE the engine process, `plugin/oct-tools/index.js`)
  ⇄  ToolShuttle loopback callback server (runs INSIDE the extension host, `src/provider/tools.ts`)
```

Major parts and how they fit:

| Part | Where | Role |
|---|---|---|
| Extension entry / wiring | `src/extension.ts` | Activation gate, command registration, server→provider startup chain, status/prune/cleanup commands |
| Settings | `src/config.ts`, `package.json#contributes.configuration` | `oct.*` settings (`enabled`, `opencodeUrl`, `opencodeBinary`, `opencodePassword`, `permissionTimeoutMs`, `callbackToken`, `maxSessions`) |
| Binary gate | `src/binary.ts` | `opencode --version` check, v2+ required |
| Diagnostics | `src/output.ts` | Single `OCT` output channel, `logLine` |
| Server lifecycle | `src/server/manager.ts` (`OctServerManager`) | Spawns / health-checks the engine; owns managed-mode env (`OPENCODE_CONFIG_CONTENT`, `OCT_CALLBACK_*`, passwords) |
| Engine REST client | `src/server/client.ts` | Typed `fetch` wrappers for `/api/info`, `/api/model`, `/api/session*`, `/api/session/:id/prompt`, `/api/session/:id/permission*` (plus the `updateSession` PATCH helper — diagnostic/future use only, no live callers) |
| Chat provider | `src/provider/octProvider.ts` (`OctChatProvider`) | Implements `vscode.LanguageModelChatProvider`; maps picker models, owns per-turn routing (new turn vs tool-result continuation) |
| Conversation→session map | `src/provider/sessions.ts` (`OctSessionMap`) | 1 Copilot conversation = 1 engine session, persisted in `globalState`, LRU-capped, with dead/dropped/orphan records |
| Turn streaming | `src/provider/streaming.ts` (`streamTurn`) | Opens `GET /api/event` (SSE) first, admits `POST prompt`, streams `session.text.delta`, handles approvals + tool pauses + fallbacks |
| Tool shuttle (host side) | `src/provider/tools.ts` (`ToolShuttle`) | Loopback HTTP server (`/oct/pending-tools`, `/oct/execute`); pending-tool registry + blocked-executor table |
| Approval translator | `src/provider/permissions.ts` (`PermissionTranslator`) | Maps engine `permission.asked` to VS Code Allow/Cancel following ONLY global `chat.permissions.default`; default-deny |
| Model mapping | `src/provider/models.ts` | Engine `Model.Info` → picker `OctModel` (`<providerID>/<modelID>`, `OCT / <name>` branding, vision flag, Thinking Effort variants) |
| Prompt / result shaping | `src/provider/messages.ts`, `src/provider/images.ts` | Current-turn prompt text + prompt `files`; tool-result text + executor `files`; Q2 image caps |
| Engine-side bridge | `plugin/oct-tools/index.js` | Dependency-free plugin loaded by the engine: pulls pending tools per prompt, registers `oct__*` tools, block-and-resume executors, per-session scoping |

What this system is NOT: there is no own chat webview, no separate backend
service, no database, no queue/worker, no frontend/backend split beyond
"extension host ⇄ engine process". Confirmed by `src/` layout, `package.json`
(`"main": "./out/extension.js"`, no webview contribution), and ADR-0001.

## 2. Entry points

### E1 — Extension activation (`src/extension.ts#activate`)

- Trigger: `onStartupFinished` / `onLanguageModelChatProvider:oct`
  (`package.json#activationEvents`).
- Always registers 5 commands + output channel disposal.
- Gate: `readSettings().enabled` false → log + return (no server, no provider).
  This is the "activation gate" (`CONTEXT.md`): OCT is disabled by default.
- Enabled path (confirmed chain in `activate`):
  `shuttle.start()` → `manager.start({binary, externalUrl, password, cwd,
  pluginDir, callbackUrl, callbackToken})` → on `connected`, construct
  `OctChatProvider` and `vscode.lm.registerLanguageModelChatProvider("oct",
  provider)` → startup session sweep (`verifyAndPruneConversations`, log-only).
- After: `deactivate()` stops the owned server, disposes provider/shuttle/channel.

### E2 — `oct.enable` / `oct.disable` commands

- `enable`: no-op if already enabled; else `checkOpencodeBinary` blocks with an
  error on missing/unparseable/v1 binary; on success `setEnabled(true)` + ask
  for window reload (reload is what actually starts the engine + provider).
- `disable`: stops the owned managed server, `setEnabled(false)`, asks for reload.

### E3 — Copilot Chat provider calls (`src/provider/octProvider.ts`)

- `provideLanguageModelChatInformation`: `GET /api/model` (with workspace
  directory filter) → `toOctModels()` → picker entries. Never throws into
  the picker (empty list + log on failure).
- `provideLanguageModelChatResponse(model, messages, options, progress, token)`:
  the hot path. Resolves turn directory → `conversationKey(...)` → dead/dropped
  retired-chat notices → `sessions.getOrCreate(...)` → `turn(sessionId)`:
  matched tool results → continuation (`streamTurn` with `promptText: null`);
  else new turn (`buildPromptWithImages` + `streamTurn` with prompt text/files).
  404 mid-turn → forget mapping, mark dead, report deleted-session sentence.
  Instruction-blocked error → drop mapping, retry once on a fresh session.
- `provideTokenCount`: local `ceil(len/4)` estimate only; no server call.

### E4 — `oct.status` command

- Prints enabled/binary/server/mode/callback/pending-approval lines, then
  `appendSessionList`: per-id `GET /api/session/:id` verify-and-prune (404 =
  dead, anything else kept), then one `GET /api/session?limit=500` for
  titles/ages, grouped by workspace directory. Never deletes engine sessions.

### E5 — `oct.refreshModels` command

- Fires `changeEmitter` so VS Code re-queries `provideLanguageModelChatInformation`.
  No-op with an info message when the provider is not active.

### E6 — `oct.cleanupOrphans` command

- Reads the orphan graveyard (`sessions.orphanedSessions()`), resolves each id
  (`GET`, 404 = already gone, other errors = kept), dry-run log, explicit
  VS Code `Delete`/`Cancel` confirmation, then `DELETE /api/session/:id` per
  confirmed id. Cancel performs no engine `DELETE` (already-gone graveyard
  entries are still pruned from the graveyard before the prompt). Never
  touches non-graveyard sessions.

### E7 — Tool-callback HTTP routes (`src/provider/tools.ts#handle`)

- `GET /oct/pending-tools?sessionID=` — plugin pull for the current turn's
  Copilot tool definitions. Sets `bridgeSeen = true`.
- `DELETE /oct/pending-tools?sessionID=` — clears a session's pending tools.
  No in-repo caller sends `DELETE` (the plugin only `GET`s; the extension
  clears pending internally via `clearPending` on turn end/fail).
- `POST /oct/execute` — plugin executor block point; held open until
  `resolve()` / `abortAll()` / 10-minute safety timeout / executor disconnect.
- All three require `x-oct-token` match (loopback defense-in-depth); server
  binds `127.0.0.1` on an ephemeral port.

### E8 — Engine plugin hooks (`plugin/oct-tools/index.js#setup`)

- `session.hook("prompt")`: pulls pending tools for the session, stashes in
  `pendingBySession`, calls `tool.reload()`. Never breaks admission (catch →
  text fallback).
- `tool.transform`: reconciles the engine registry to the union of pending
  across sessions (adds `oct__*` `codemode:false` tools, removes stale bridge tools).
- `session.hook("context")`: narrows advertised tools to this session's set;
  engine natives untouched.

## 3. Major components

Only meaningful architectural components are listed (not every file).

| Component | Path(s) | Responsibility | Key dependencies | Consumers | Tests |
|---|---|---|---|---|---|
| Activation / commands | `src/extension.ts` | Gate, lifecycle wiring, status/prune/cleanup, `resolveTurnDirectory` glue | `config`, `binary`, `server/manager`, `server/client`, `provider/*`, `output` | VS Code runtime | None (thin glue; covered by unit-tested helpers it calls) |
| Settings | `src/config.ts` + `package.json` | `OctSettings` shape, defaults (`permissionTimeoutMs` 60000, `maxSessions` 200), password precedence (setting → `OPENCODE_SERVER_PASSWORD`/`OPENCODE_PASSWORD` → empty) | `vscode.workspace.getConfiguration` | `extension.ts`, provider construction | `test/` indirectly (defaults asserted via sessions tests' caps) |
| Binary check | `src/binary.ts` | `<binary> --version` parse, enforce major ≥ 2 | `node:child_process.execFile` | `enableCommand`, `statusCommand` | None — Needs verification (no unit test file; logic is small and I/O-bound) |
| Output channel | `src/output.ts` | `OCT` channel singleton, timestamped `logLine`; never logs passwords/tokens | `vscode.window` | Every component | None (VS Code API passthrough) |
| Server manager | `src/server/manager.ts` | Managed spawn (`serve --hostname 127.0.0.1 --port <free>`, parse `server listening on`, poll `/api/info`) vs external health-check; `OPENCODE_CONFIG_CONTENT` merge + managed ask-all injection (`withAskAllPermissions`); POSIX group kill / Win `taskkill` | `server/client#getInfo`, `node:child_process`, `node:net`, `output` | `extension.ts` | None direct — Needs verification (covered only via live EDH runs per README/status) |
| Engine REST client | `src/server/client.ts` | `requestJson` (timeout+abort, `Basic opencode:<pw>`, 500-char error bodies, no credential in errors); session/model/permission/message endpoints | Engine `/api/*` over `fetch` | Provider, `extension.ts` status/cleanup | Indirect via `sessions`/`streaming`/`permissions` tests with mocked client seams — Needs verification for exact live shapes beyond what tests pin |
| Chat provider | `src/provider/octProvider.ts` | Picker/turn orchestration; Thinking Effort variant resolution; tool-primary vs engine-fallback routing; stuck/superseded-turn handling; deleted/instruction-blocked recovery | `sessions`, `streaming`, `tools`, `permissions`, `messages`, `models`, `server/client` | VS Code Copilot host | `sessions`/`messages`/`models`/`streaming` units cover its helpers; provider turn-routing itself has no dedicated test file |
| Session map | `src/provider/sessions.ts` | `conv:<id>` preferred key (from `modelOptions._conversationId` family) else `hash:<sha256-32>` of (directory, model, first-500-chars); `getOrCreate` with restore-verify (404 → remap, non-404 → keep), model pin via `switchSessionModel`, LRU cap with evict-dead-first, `dead`/`dropped`/graveyard records, per-chat directory + title helpers | `server/client`, `vscode.Memento`, `output` | `octProvider`, `extension.ts` status | `test/sessions.test.ts` (map, eviction, keys, titles, directories, ages) |
| Turn streaming | `src/provider/streaming.ts` | SSE-first `readSse`, fire-and-record prompt admission, `session.text.delta` → `LanguageModelTextPart`, tool-pause vs terminal-event race, approval inline handling, no-delta fallback via newest assistant message, cancel/timeout → `interruptSession` | `server/client`, `tools`, `permissions`, `sessions#isSessionGoneError` | `octProvider` | `test/streaming.test.ts` |
| Tool shuttle | `src/provider/tools.ts` | `ToolShuttle`: pending registry, blocked-executor table, emitted-set, repeat circuit breaker (3× identical → short-circuit), `mapCopilotTools` sanitization (`oct__` + `__2…` dedupe), `toolResultToText` (100k-char cap, image markers) | `node:http`, `images#isImageMime`, `output` | `octProvider`, `streaming`, plugin | Covered via `test/messages.test.ts` result paths — shuttle HTTP itself has no dedicated test file (Needs verification beyond code read) |
| Permissions | `src/provider/permissions.ts` | `parsePermissionAsked` (live SSE path) / `parsePermissionItem` (no live callers — see F3), `readCopilotPermissionLevel` (fresh read of `chat.permissions.default`), `resolveApprovalMode` (`read` silent; `autoApprove`/`autopilot` silent; else ask), `ask` with Allow/Cancel + timeout/dismiss/cancel → `reject` + interrupt fallback; never sends `always` | `server/client` reply/interrupt, `vscode.window`, `output` | `streaming` | `test/permissions.test.ts` |
| Models | `src/provider/models.ts` | `toOctModels` (skip malformed/disabled), picker id `<providerID>/<modelID>`, `OCT / <name>` branding, token fallbacks, `toolCalling:true` + image-input flag, Thinking Effort schema (`reasoningEffort`, `group:navigation`) + `resolveReasoningEffort` validation | `server/client#ModelInfo` | `octProvider` | `test/models.test.ts` |
| Messages/images | `src/provider/messages.ts`, `src/provider/images.ts` | Latest-message-only prompt (transcript fallback when latest is empty); image ingress split (prompt `files` vs executor `files`); caps 15 MB/image, 50 images / 40 MB per turn; oversize/non-image → placeholder; `data:` URIs for executor parts, `data:` URIs for prompt files | `vscode.LanguageModel*Part`, `tools#toolResultToText` | `octProvider` | `test/messages.test.ts`, `test/images.test.ts` |
| Engine plugin | `plugin/oct-tools/index.js` | Pull-based bridge inside the engine: pending pull, registry transform, per-session context scoping, blocking executors with abort/timeout handling, image `file`-part returns | Engine plugin API (`session.hook`, `tool.transform/reload`), extension callback over `fetch` | Engine agent loop | None automated (plain JS, verified live per README/ADR; no test file references it) |

## 4. Relationships

Dependency direction (extension-host code; engine plugin is a runtime peer):

```text
extension.ts (wiring)
  → config / binary / output
  → server/manager → server/client → engine /api/*
  → provider/octProvider
      → provider/sessions → server/client (+ sessions → messages for text helpers)
      → provider/streaming → server/client, plus streaming → provider/tools
        and streaming → provider/permissions (shuttle and translator are
        independent — no tools⇄permissions edge)
      → provider/messages → provider/images (models has no images dependency);
        messages → provider/tools (result text shaping); tools → images (mime check)
      → provider/tools (loopback server) ⇄ plugin/oct-tools (in-engine)
```

What each edge means:

- `extension → manager → client → engine`: activation owns lifecycle; manager
  owns process/env; client owns HTTP. Manager never touches chat semantics;
  client never owns state.
- `octProvider → sessions`: the ONLY path that creates/pins/forgets engine
  sessions. Streaming never creates sessions; status never creates sessions.
- `octProvider → streaming → shuttle/translator`: one turn = one `streamTurn`
  call with shared `shuttle` + `translator` instances (constructed once in
  `extension.ts`, injected into the provider). Streaming pauses for tools via
  the shuttle and pauses for approvals via the translator, but neither owns
  the turn — the provider does.
- `plugin ⇄ shuttle`: pull + block-and-resume over loopback HTTP. The plugin
  pulls definitions (`GET pending-tools`) and blocks executors (`POST
  execute`); the shuttle holds responses open and replies on the NEXT provider
  call's results (continuation with `promptText: null`). Session scoping is
  enforced on both sides (plugin `context` hook + shuttle per-session tables).
- `permissions → client`: approvals reply `once`/`reject` per request; the
  bridge never sends `always` (no persisted server-side rules from this path).
- `messages/images → prompt + executor payloads`: pure shaping; no I/O.
  (`messages → tools` for `toolResultToText`, `tools → images` for
  `isImageMime`, and `sessions → messages` for `messageText` also exist —
  all pure, no I/O.)

## 5. Data flow

### F1 — Chat turn (text path, primary)

```text
Copilot messages
  -> octProvider.resolveProviderTurnDirectory (attachments > editor > first folder)
  -> conversationKey (+ Thinking Effort variant validation)
  -> sessions.getOrCreate (verify-or-create, model pin)
  -> buildPromptWithImages (latest message text + prompt files)
  -> streaming.streamTurn:
       open GET /api/event (SSE) BEFORE POST /api/session/:id/prompt
       -> session.text.delta -> LanguageModelTextPart deltas
       -> terminal (execution.succeeded/failed/interrupted, idle, error, step.failed)
       -> no-delta fallback: GET messages, report newest assistant text once
  -> progress stream to Copilot Chat
```

History lives server-side: only the current turn's text is admitted per turn
(`messages.ts` header comment + `octProvider.runNewTurn`). Cancellation/timeout
aborts SSE and best-effort `POST …/interrupt`.

### F2 — Tool bridge turn (Copilot tools primary)

```text
Copilot tool defs (options.tools)
  -> mapCopilotTools (oct__ sanitized defs) -> shuttle.setPending(sessionID)
  -> prompt admission wakes engine; plugin prompt-hook pulls defs, registers oct__ tools
  -> engine calls tool -> plugin executor POSTs /oct/execute (held open)
  -> streaming race sees blocked calls -> emits LanguageModelToolCallPart(s), returns {kind:"tool-calls"}
  -> host executes -> NEXT provider call extractToolResults matches blocked ids
  -> shuttle.resolve(text + files) resumes executors
  -> streamTurn continuation (promptText: null, no new admission)
```

Bridge definitions are admitted only when the bridge is available (`managed`
mode or `shuttle.bridgeSeen`, i.e. the plugin has contacted the callback —
`octProvider.ts`): external mode without the plugin sends the turn as-is and
the engine falls back to its own tools.

Parallel calls in one step are supported; stuck turns (blocked but nothing
unemitted and no results) abort + interrupt + start fresh; superseding input
aborts blocked calls + interrupts + starts fresh. A repeat circuit breaker (3
consecutive identical calls) short-circuits with a proceed-with-what-you-have
instruction instead of blocking forever.

### F3 — Engine-native approval (fallback path)

```text
engine permission.asked (SSE only — the `listSessionPermissions` /
`parsePermissionItem` helpers exist but have no live callers)
  -> parsePermissionAsked -> translator.ask
  -> read action => auto-once silently
  -> Copilot global chat.permissions.default in (autoApprove, autopilot) => auto-once silently
  -> else VS Code Allow/Cancel warning (diff preview ≤2000 chars, ≤3 files, ≤3000-char message)
  -> timeout / dismiss / VS Code cancel => reject (default-deny)
  -> replySessionPermission(once|reject); undeliverable reply => interruptSession fallback
  -> denial + engine stop => one clean sentence in chat (no error dump)
```

Managed servers get ask-all engine permissions injected last
(`withAskAllPermissions`, so Copilot Default→ask is enforceable under the
engine's last-match-wins evaluation — INFERRED from the `manager.ts`
comment, not verifiable in-repo); external
servers must set ask-all themselves or Default→ask is unenforceable (README +
`manager.ts` comments). The chat-view per-session picker is invisible to
provider extensions, so it never affects engine approvals (README limitation).

### F4 — Image ferry

```text
attached images (LanguageModelDataPart/image-*) -> prompt files[] (data: URIs + names)
tool-result images (view_image et al.) -> executor return files[] (data: URIs, mime+name)
caps: 15 MB/image, 50 images / 40 MB per turn (appearance order); callback body 32 MB
oversize / over-count / non-image -> text placeholder; turn still succeeds
```

Text sidecars (`[Image N: mime (bytes)]`) keep the transcript coherent; logs
record names/sizes only, never bytes.

### F5 — Session lifecycle / map maintenance (never on the hot delete path)

- Create: `POST /api/session` with title seed (newest-first `<userRequest>`
  unwrap in `sessionTitleFromMessages`, else `OCT: <key8> <MM-DD HH:mm>`
  fallback) + `location.directory` (per-chat, create-time pinning) + model ref.
- Reuse: `GET /api/session/:id` verify on restored entries (404 → remap fresh;
  non-404 → keep and let the turn surface the real error).
- Model drift: `POST /api/session/:id/model` pin (non-fatal on failure).
- Prune: status/startup per-id `GET` sweep (404 → drop mapping + dropped
  record; never prune on uncertainty; titles/ages come from a separate
  display-only `GET /api/session?limit=500`).
- Retire: deleted-session 404 mid-turn → `forget({gone:true})` + `markDead` +
  deleted notice (`gone:true` skips graveyard + dropped record); dropped link
  (live eviction / non-gone `forget` / prune / restore-cap) → `recordDropped`
  + dropped notice (dead-victim evictions record nothing — the chat is already
  retired via `dead`). Both notices are chat text, retried turns repeat them,
  nothing silently forks.
- Orphan cleanup (opt-in only): graveyard → resolve → dry-run log → explicit
  confirm → `DELETE /api/session/:id` → graveyard removal.

## 6. Data / persistence architecture

No database, no cache server, no queue. Persistent state is two-owned:

| Store | Owner | Keys / shape | Accessors |
|---|---|---|---|
| `vscode.Memento` globalState (extension) | `OctSessionMap` | `oct.conversationSessions.v1` (entries `[key, {sessionId, modelKey, directory?}]`, cap `maxSessions` default 200); `oct.deadConversations.v1` (dead keys); `oct.orphanedSessions.v1` (graveyard ids, cap 200); `oct.droppedConversations.v1` (dropped `[key, sessionId]`, cap = map cap) | `sessions.ts` restore/persist (best-effort, fire-and-forget, garbage-tolerant); `clear()` is in-memory only so reloads keep reuse |
| Engine server state (opencode process) | opencode v2 engine | Sessions (history, titles, `time.created/updated`), models, permissions, messages; exact on-disk layout is engine-internal | Via `server/client.ts` REST only (`session`, `model`, `permission`, `message`, `info`, `prompt`, `interrupt`, `switchModel`; `updateSession` PATCH and `listSessionPermissions` exist but have no live callers) |
| VS Code settings (user) | VS Code | `oct.*` (global), `chat.permissions.default` (read fresh per non-read approval) | `config.ts#readSettings`, `permissions#readCopilotPermissionLevel` |
| Env (process) | OS / user | `OPENCODE_SERVER_PASSWORD`/`OPENCODE_PASSWORD` (client auth), `OPENCODE_CONFIG_CONTENT` (merged plugin config), `OCT_CALLBACK_URL`/`OCT_CALLBACK_TOKEN` (managed wiring), `OCT_PLUGIN_DEBUG` (plugin verbose) | `manager.ts`, `config#resolveServerPassword`, plugin |

Ownership rules (confirmed by code): dropping a mapping never deletes an
engine session on the hot path; only the explicit cleanup command deletes, and
only graveyard ids (sessions OCT mapped and later dropped without a 404).
`clear()` never wipes persisted reuse. Passwords/tokens are never logged
(`output.ts` contract + `client.ts` error hygiene).

## 7. External integrations

| External | Interface | Direction / effect |
|---|---|---|
| opencode v2 binary + server (`opencode serve`) | Child process (`spawn`), stdout `server listening on` parse, `GET /api/info` readiness, REST + SSE `/api/*`; Basic auth `opencode:<password>` | Extension spawns (managed) or health-checks (external); verified against 2.0.21 (README). v1 protocol unsupported (binary gate). |
| VS Code Copilot Chat host | `languageModelChatProviders` vendor `oct` + `vscode.lm.registerLanguageModelChatProvider` (proposed API, needs VS Code `^1.125.0`); `options.tools`, `LanguageModel*Part`s, `chat.permissions.default`, `modelConfiguration.reasoningEffort` (cast — stable types lack it) | Provider serves picker models + turns; host owns tool execution, approvals UI, attachment model |
| `oct-tools` plugin host (inside engine) | Engine plugin API: `session.hook("prompt"/"context")`, `tool.transform`, `tool.reload`, executor `(input, context)` with `context.signal` | Plugin adapts engine tool lifecycle to the shuttle's pull/block protocol |
| Node.js 20+ / Extension Host | `fetch`, `node:http`, `node:crypto`, `node:fs`, `node:net`, `node:child_process` | Runtime platform; callback server, SSE reader, process management |
| `OPENCODE_CONFIG_CONTENT` merge | JSON record with `plugins[]` + `permissions[]` (managed mode) | Installs bridge plugin + ask-all without clobbering user config or touching user files |

Not integrations (explicitly out of scope per `dev/project.md`): Zen/Go
subscriptions, marketplace release automation, VSCodium, PTY terminal, video/pdf
result transport.

## 8. Runtime / build boundaries

| Boundary | Reality in this repo |
|---|---|
| Extension Host vs engine process | The only process boundary. Extension (`out/extension.js`) talks to the engine over HTTP/SSE — loopback for managed mode (`--hostname 127.0.0.1`); the external URL is used as-configured (loopback not enforced). Managed mode: extension spawns + kills (`owned` flag; external servers never touched). |
| Extension Host vs plugin-in-engine | `plugin/oct-tools/index.js` runs inside the engine process, not the extension. Plain dependency-free JS, no build step; loaded by engine plugin directory (`pluginDir` = `<extension>/plugin/oct-tools`). Communicates back only via the loopback callback. |
| Callback server vs main flow | `ToolShuttle`'s `node:http` server (`127.0.0.1`, ephemeral port, `x-oct-token`) lives in the Extension Host alongside the provider; held `POST /oct/execute` responses bridge the multi-provider-call turn. |
| Build-time vs runtime | `tsc -p ./` compiles `src/` → `out/` (extension runtime, `module node16`, `ES2022`, strict + `noUnusedLocals/Parameters`); `tsc -p test/tsconfig.tests.json` compiles `src` + tests → `out-test/` (its `include` covers `../src` and `./*.test.ts`); `vsce package` produces `opencode-for-copilot-0.1.0.vsix`. Plugin JS ships as-is. |
| Dev vs prod | No separate prod service. `F5` Extension Development Host vs installed VSIX differ only in hosting; behavior is gated by `oct.enabled` + reload in both. |
| Test boundary | `npm test` = compile tests + `node --test` over `out-test/test/*.test.js` with `NODE_PATH` → committed `vscode` shim (`test/run.mjs`, `test/vscode-mock.mjs`, `test/shims/`). No network, no engine, no VS Code instance needed. `npm run lint` = `tsc --noEmit` + test compile. |

Boundaries that do NOT exist: frontend vs backend (no webview), worker vs main
process (single extension host + callback server in-process), DB/migration
layers, CI-deployed services.

## 9. Architectural constraints (only what the project supports)

1. **Disabled by default.** No engine runs until `oct.enabled` + reload
   (`extension.ts` gate, `package.json` default false). Background RAM cost is
   the stated reason.
2. **1 conversation = 1 session reuse.** Never create/delete sessions per turn
   (anti-sprawl core fix; ADR-0001 + `sessions.ts`). Retired chats report a
   notice instead of silently forking.
3. **opencode v2 only.** Binary gate rejects v1/missing/unparseable
   (`binary.ts`, `MIN_OPENCODE_MAJOR = 2`).
4. **Provider API floor: VS Code `^1.125.0`.** `engines.vscode` + ADR; proposed
   `registerLanguageModelChatProvider` surface may shift upstream.
5. **Tool direction: Copilot tools primary, engine tools fallback.**
   Bridge definitions ride the shuttle only when the bridge is available
   (`managed` mode or `shuttle.bridgeSeen` after first plugin contact);
   without the plugin (external mode) the turn goes as-is and the engine may
   use its own tools (`octProvider`, T-0015).
6. **Approval direction: engine follows ONLY global `chat.permissions.default`,
   read fresh every time.** `read` silent; Bypass/Autopilot silent; everything
   else asks; default-deny on timeout/dismiss/cancel/undeliverable. No
   per-session trust, no `always`, nothing persisted (`permissions.ts`).
7. **Managed ask-all is injected, not configured.** Appended last so it wins
   under engine last-match-wins (INFERRED — engine-side semantics per the
   `manager.ts` comment, not verifiable in-repo) without touching
   user/global/workspace files; the `read` exception lives in the translator
   (single decision point).
8. **Per-chat directory is create-time pinned.** Reuse turns never rewrite
   `Entry.directory`; switching editors mid-chat never moves a mapping; only
   open-folder values are ever returned (traversal impossible by construction).
9. **Image caps are enforced, degradation is placeholder.** 15 MB/image, 50
   images / 40 MB per turn, 32 MB callback body; oversize/non-image degrades,
   turns still succeed; executor parts must be `data:` URIs (`images.ts`).
10. **Dropping ≠ deleting.** Map drops feed the graveyard/dropped records;
    deletion happens only via the explicit cleanup command with confirmation,
    and only for graveyard ids. 404-confirmed ids never enter the graveyard.
11. **Secrets never logged.** Passwords, auth headers, callback tokens stay out
    of the `OCT` channel and errors (`output.ts`, `client.ts`, `config.ts`).
12. **Naming:** vendor `oct` lowercase everywhere; display `OCT`; engine
    `opencode` lowercase with `v2` qualifier when disambiguating (`CONTEXT.md`).

## 10. Known architectural risks / unclear areas (documented, not fixed)

| Area | Observation (evidence) | Status |
|---|---|---|
| Proposed provider API drift | `registerLanguageModelChatProvider` + `modelConfiguration` are proposed-API surface (ADR context, `models.ts`/`octProvider.ts` casts). A VS Code rename would break picker/model-config paths. | Risk, accepted in ADR. |
| Per-session picker invisible | Chat-view permissions picker is per-session host state invisible to providers (verified in VS Code source per README); users moving the picker see no change in engine approvals. Only global `chat.permissions.default` matters. | Known limitation, documented in README. |
| External-mode ask-all gap | External servers must set ask-all themselves; otherwise Copilot Default→ask is unenforceable and the engine allows silently (README, `manager.ts`). | Known gap, documented; no code path to enforce remotely. |
| No automated coverage for lifecycle seams | `manager.ts` (spawn/kill/env merge), `binary.ts`, shuttle HTTP (`tools.ts` server), plugin JS, and provider turn-routing have no dedicated unit tests; coverage is helper-level (`sessions`, `messages`, `models`, `permissions`, `images`, `streaming`) + live EDH verification per README/tasks. | Unclear-area: behavior confirmed by code read + documented live runs, not by tests in repo. |
| Live engine shapes pinned loosely | `sessionCreatedMs` tolerates millis-or-ISO and else yields unknown; `normalizeVariantIds`/`toOctModel` skip malformed entries; SSE reader ignores malformed frames. Exact engine payload evolution beyond v2.0.21 is Unknown. | Defensive parsing present; needs re-verification on engine upgrades. |
| `dev/verification.md` contract | Initialized 2026-10-08 from repo evidence (`package.json` scripts, `test/` config, `.vscode/` tasks, README, task evidence): typecheck / lint / test / compile / package gates + EDH procedure + change→check table. | Closed by `dev/verification.md`; residual runtime gaps (no E2E automation, no CI, engine drift, external mode) are tracked in the contract itself. |
| Windows drive-letter canonicalization | `canonicalDirectory` + folder-prefix matching exist because the engine compares paths case-sensitively and a lowercase drive letter poisoned instruction discovery (`sessions.ts` comments, instruction-blocked retry path). | Fragile boundary, worked around in code; future engine path handling could obsolete or break assumptions. |
| Orphan graveyard boundedness | Caps (200 map / 200 graveyard / dropped = map cap) bound storage, but a busy user can rotate the graveyard/dropped records and lose track of older ids (oldest-first eviction). | Accepted trade-off in code; cleanup command only sees what survives. |

## Diagrams

### Component relationships

```text
                    +------------------- Copilot Chat (host UI) -------------------+
                    |  model picker · tool execution · Allow/Cancel · attachments |
                    +---------------+---------------+----------------+------------+
                                    | picker/turns  | tools/results  | approvals/config
              vscode.lm provider API (vendor oct, proposed surface)
                                    |
                    +---------------v--------------------------------------------+
                    | OCT extension host (`out/extension.js` ← `src/`)            |
                    |  extension.ts → octProvider → sessions / streaming          |
                    |      streaming ⇄ shuttle (loopback :PORT) + streaming ⇄ permissions (translator; shuttle and translator are independent)     |
                    |      messages → images · messages → tools · tools → images (pure shaping)              |
                    |      manager (spawn/health) · client (REST) · output log    |
                    +---------------+----------------+----------------------------+
                                    | REST+SSE /api/*          | callback HTTP
                    +---------------v----------------+         |
                    | opencode v2 engine process     |         |
                    |  sessions/models/permissions   |         |
                    |  + oct-tools plugin (in-engine)|---------+
                    |    pull defs · block executors |
                    +--------------------------------+
```

### Turn data flow (tool path)

```text
Copilot turn → provider → getOrCreate(session) → prompt admit
  → engine agent loop → plugin executor blocks on POST /oct/execute
  → shuttle holds → streaming emits ToolCallPart → host executes
  → next provider call carries results → shuttle.resolve
  → executor resumes → engine continues → deltas stream → terminal
Approvals interleave inline: permission.asked → Allow/Cancel → once/reject
```

### Runtime boundaries

```text
[Extension Host process]  extension.ts · provider/* · server/* · shuttle HTTP 127.0.0.1
        ⇄ REST+SSE (/api/*; loopback iff managed) + loopback callback (/oct/*)
[Engine process]          opencode serve (managed child | external) + oct-tools plugin
[VS Code core]            Copilot Chat UI · settings · globalState (Memento) · output channel
```

---

*Update rule: revise this map in the same change whenever module ownership,
dependencies/boundaries, execution/data flows, entry points, public contracts,
hotspots, or test surfaces materially change. Do not rewrite it for trivial
implementation edits.*
