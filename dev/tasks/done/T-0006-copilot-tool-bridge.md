# T-0006 — Copilot tool bridge (execution + approvals)

## Status

COMPLETE (verified 2026-10-02; commit pending)

## Objective

Full tool bridge in one build: Copilot tools execute through the engine via a bundled plugin + shuttle loop, and engine-native permission requests surface as VS Code confirmations with default-deny. Text-only fallback remains only when the bridge is unavailable (external mode without the plugin).

## Why

T-0005 proved the block-and-resume primitive (GO); T-0004 proved the permission round-trip. M1 + B-0001 + B-0002 made text turns reliable. This task replaces `TOOL_NOTICE` with real execution for Copilot tools (host executes, engine loops) and gives the user per-request control over engine-native actions (translator with default-deny, not a merger of the two permission systems).

## In Scope

### A. Execution loop (was T-0006)

- Bundle an `oct-tools` plugin inside the extension (`plugin/oct-tools/`, promise-style `Plugin.define`); managed server loads it via config `plugins:` absolute path; external mode documents manual install.
- Loopback callback channel in the extension (HTTP, 127.0.0.1, ephemeral port): plugin executors POST `{tool, input, sessionID, id, messageID}` and block for the reply; cancellation via AbortSignal (T-0005 proven).
- Per-turn tool registration: map `options.tools` (`name`, `description`, `inputSchema`) to direct plugin tools (`codemode:false`, clean inputs); scope per request via `session.context` hook deletion (T-0005 proven); name sanitization (`[^a-zA-Z0-9_-]` → `_`, collision suffix).
- Shuttle loop in `octProvider`/`streaming`: on engine tool call for a Copilot tool, `progress.report(new LanguageModelToolCallPart(callId, name, input))` and return; on the next provider call, match `LanguageModelToolResultPart` by `callId` to the blocked executor and unblock it with the result text; stream the engine continuation as the new turn's output.
- `callId` mapping: engine `{assistantMessageID, id}` ↔ Copilot `callId` (extension-generated, stable per engine tool id within the conversation).
- Timeout/cancel: provider cancellation interrupts the session (existing B-0002-hardened path); blocked executors unblock with abort (T-0005 proven).
- `TOOL_NOTICE` removed for the Copilot-tool path; kept when the bridge is unavailable (external mode without plugin).

### B. Permission translator (was T-0007)

- Subscribe to `permission.asked` during `streamTurn` (alongside the SSE loop); match by `sessionID`; extract `{id, action, resources, save, metadata.files[].patch, source{type,messageID,id}}`.
- Confirmation UI: `vscode.window.showWarningMessage` with Continue/Cancel → `reply {once}` / `reply {reject}`; show action + resources + diff preview (truncated); session-trust maps to `reply {always}` only on explicit per-session opt-in.
- Reply plumbing in `src/server/client.ts`: `GET /api/session/:id/permission` (list pending), `POST .../permission/:req/reply {decision, message?}`; 404 (already resolved) is benign.
- Default-deny: timeout (configurable, default 60s), VS Code cancellation, disconnect, or no-answer → `reply {reject}` + interrupt fallback (B-0002 flags distinguish real cancel); log every decision (never log password/headers).
- VS Code permission levels (Allow-all/Autopilot) do NOT auto-propagate; the bridge asks unless the user explicitly enables per-session trust. No silent `always`.
- `OCT: Show Status` extended with pending-permission count while paused.

## Out of Scope

- Copilot `toolMode` → engine mapping beyond default (Required/auto handled as auto; strict enforcement deferred).
- Image/data parts in tool results (text serialization only; multimodal deferred).
- Managing engine rulesets from VS Code's approval UI (two stores stay separate; documented).
- URL/terminal approval mapping (engine actions surface as their own confirmations).
- Session title/sync, tests, VSIX (separate M2 tasks).

## Dependencies / Inputs

- T-0005 Probe Log (block-and-resume, interrupt→aborted, direct-tool filtering, permission-deny; engine v2.0.19 probes).
- T-0004 Probe Log (permission round-trip: `asked` payload, `reply once` → 204, stall without reply).
- B-0001 record (`_conversationId` key, `globalState` persistence, 404-remap) — tool turns reuse the same map.
- B-0002 record (explicit abort-reason flags, `canonicalDirectory`, `forget()` + retry-once) — cancel/timeout paths build on these.
- `src/provider/octProvider.ts`, `streaming.ts`, `sessions.ts`, `messages.ts`, `src/server/manager.ts`, `client.ts`, `src/extension.ts`, `src/output.ts`.
- Reference `opencode-copilot-chat` `extract.ts` (ToolCallPart emission), `messages.ts` (ToolResultPart conversion), `toolCallAccumulator.ts` (parallel-call collapsing).

## Allowed Product Files / Areas

- `plugin/oct-tools/` (new: bundled plugin; dir exists empty, untracked)
- `src/provider/tools.ts` (new: schema map, callId map, shuttle state)
- `src/provider/permissions.ts` (new: asked-event parse, confirmation UI, reply policy)
- `src/provider/octProvider.ts` (shuttle wiring)
- `src/provider/streaming.ts` (tool-event emission + asked subscription)
- `src/provider/messages.ts` (ToolResultPart → executor result text)
- `src/server/manager.ts` (plugin path + callback-port env for managed server)
- `src/server/client.ts` (permission list/reply/reject helpers, session PATCH helper)
- `src/extension.ts` (callback server lifecycle, status, timeout config)
- `src/output.ts` (decision log lines)
- `package.json` (timeout config `oct.permissionTimeoutMs`, if needed)

## State Synchronization Files

- `dev/tasks/T-0006-*.md`
- `dev/roadmap.md`
- `dev/now.md`
- `README.md` (tool support documented after verification)
- `CONTEXT.md` / ADR when the loop shape settles
- `dev/security.md` (translator policy recorded)

## Acceptance Criteria

Execution:

- [x] Agent-mode turn with a Copilot tool executes end-to-end (EDH attempts 1, 2, 4, 6, 7, 8).
- [x] Multi-tool / parallel calls in one engine step collapse to one ToolCallPart set per provider return (attempt 8: 2 blocked → both resolved, no duplicates).
- [x] 1 conversation = 1 session still holds across tool turns (Step 4: same ses_ reused, no sprawl).
- [x] Cancel mid-tool-call interrupts the session (engine shows interrupted; follow-up healthy; cancel log line added).
- [x] External mode without the plugin keeps text-only + notice (EDH 2026-10-02: text-only answer, `bridge is unavailable` log, no crash, no file write).
- [x] `npx tsc --noEmit -p ./` passes; Extension Development Host manual verification recorded (Steps 1–8 + B-0003/B-0004/B-0005).

Approvals:

- [x] Engine `edit` request pauses the turn; user sees action + file + diff preview; Continue resumes and the file is written; Cancel aborts cleanly (6a/6b + dialog re-test).
- [x] Timeout with no answer rejects; turn does not hang past the timeout; log records the default-deny (6c, 10s setting).
- [x] Session-trust only on explicit opt-in; never sent silently; documented (6d1/6d2: trust log + auto-once; README documents Continue-Once vs trust).
- [x] VS Code cancel during a pending approval rejects + interrupts (6d3: `denied (VS Code cancellation)` + `ended: request cancelled`, no file, no popup).
- [x] Pending approvals visible via status/log while paused (`pending approvals: 0` post-settle; counter verified around asks).

## Implementation Notes

Proven primitives (T-0004/T-0005, engine v2.0.19–2.0.21):

- Plugin load: directory with `index.js` via config `plugins:` absolute path; `.mjs` files and bare file paths rejected.
- Direct tools (`options:{codemode:false}`): clean inputs, hook-visible, deletable per request.
- Executor: `fetch(callbackUrl, {signal})` blocks; interrupt fires the signal; catch path returns abort result.
- Permission-deny via `PATCH /api/session/:id` removes catalog tools; `permission.asked` → `reply {once|always|reject}` → 204 resumes.
- Loop shape: ONE engine turn spans MULTIPLE Copilot provider calls (engine owns the loop, host owns execution). Extension holds blocked-executor table keyed by engine tool id.
- B-0002 constraints: never read a shared abort signal as cancel evidence (explicit flags); canonicalize workspace paths at the boundary; abandon poisoned sessions via `forget()`, never blind-retry.

## Verification

Commands:

```text
npx tsc --noEmit -p ./
npm run compile
```

Plus manual Extension Development Host: enable OCT, agent-mode tool turn (execution + feedback), session reuse across tool turns, cancel mid-tool (abort), engine edit → Continue writes / Cancel aborts / timeout rejects, status shows pending while paused.

Expected result: tool turns + approvals work end-to-end; tree clean except task/roadmap/now.md/README/security bookkeeping.

## Current Progress

- [x] Bundled plugin + callback channel
- [x] Per-turn registration + scoping
- [x] Shuttle loop (emit → return → feedback → continue)
- [x] Permission translator (asked → confirm → reply, default-deny)
- [x] Cancel/timeout + status paths
- [x] Engine headless probes (execution loop + scoping + permission APIs)
- [x] EDH all Steps 1–8 green (attempts 1–8; B-0003/B-0004/B-0005 found,
      fixed, re-verified); external fallback verified; README refreshed.
- [ ] Commit checkpoint (policy: ask).

## Evidence

- Implementation: IMPLEMENTED (`npx tsc --noEmit -p ./` exit 0, 2026-10-01).
- Tests: NOT RUN (tests are a separate M2 task).
- Engine probes: VERIFIED 2026-10-01 against scratch `opencode serve` v2.0.21
  (loopback 127.0.0.1:46002, kilo/stealth/space-bunny-alpha, bundled
  `plugin/oct-tools` + stub callback 127.0.0.1:46001). See Probe Log below.
- Runtime/manual verification (Extension Development Host): NOT RUN — open,
  checklist in Handoff Notes.

## Probe Log (2026-10-01, scratch server 127.0.0.1:46002, engine v2.0.21)

Setup: `OPENCODE_CONFIG_CONTENT='{"plugins":["D:/htdocs2/opencode-for-copilot/plugin/oct-tools"]}'`,
`OCT_CALLBACK_URL=http://127.0.0.1:46001`. Scratch scripts in
`C:/tmp/oct-t0006/` (`stub.cjs`, `turn.cjs`, `perm.cjs`); server + stub
terminated after the probes.

1. Execution loop (`oct__spike_add`, session `ses_f08f56d35ffeeuIu1JFpQVmjZt`):
   - Stub: `GET /oct/pending-tools` → 1 tool (prompt hook pulled + reloaded);
     `POST /oct/execute {tool,input:{a:2,b:3},sessionID,id}` → blocked 1.5s → replied `SUM:5`.
   - Engine SSE: `tool.input.started {name: oct__spike_add}` (direct call, clean
     input, no `execute` wrapper) → `tool.called` → `tool.success {content: SUM:5}`
     → `step.ended {finish: tool-calls}` → second step assistant text
     `2 + 3 = **5**` → `idle outcome: succeeded`.
   - Proves: pull → registry reconcile → per-request advertise → block-and-resume
     → continuation past `step.ended` (new terminal set works live).

2. Per-request scoping (session `ses_f08f5068effe0QaxvY2XzvZhvD`, no pending):
   - Stub: `pending-tools` → 0 tools; NO `execute` callback for that session.
   - Model: "I don't have a tool called `spike_add` available" (engine natives
     only). Registry union + context-hook deletion proven.

3. Permission client APIs (ask-everything ruleset, session `ses_f08f44557ffeZ4PEFDChi6yxJQ`):
   - `GET /api/session/:id/permission` → 200 with `{id, action:"edit",
     resources:["perm-probe-T0006.txt"], metadata.files[0]:{file,patch,status:"added"},
     source:{type:"tool",messageID,id}}` — matches `parsePermissionAsked`.
   - `POST .../reply {decision:"once"}` → 204; file created (`probe-ok`).
   - Second reply → 404 (benign `gone` path).
   - The VS Code confirmation UI itself needs the Extension Development Host.

## Known Issues / Blockers

- `question.asked` (engine question tool) has no translator: a turn that asks a
  question stalls until the 300s turn timeout. Same class as the pre-T-0006
  permission stall; separate follow-up, not a regression.
- `toolMode: Required` is handled as auto (provider cannot force the engine
  model to call; documented limitation).
- A stop between provider calls (no active call to cancel) leaves executors
  blocked until the next turn supersedes them (abort + interrupt) or the
  10-minute safety timeout fires.
- External mode needs manual plugin install: copy `plugin/oct-tools` to the
  server machine, add its absolute path to the server's `plugins` config, and
  export `OCT_CALLBACK_URL` (from `OCT: Show Status`) plus `OCT_CALLBACK_TOKEN`
  matching the `oct.callbackToken` setting (set one — the default per-window
  token cannot be pasted into a persistent server env).

## README Impact

Document tool support (Copilot execution, managed vs external plugin requirement, approval behavior, session-trust opt-in, default-deny) after verification. README is currently STALE (M1-only) — this task's refresh covers it.

## Commit Checkpoint

Suggested commit message:

```text
feat: bridge Copilot tools with engine permission approvals
```

Commit status:

```text
UNCOMMITTED
```

## Handoff Notes

Supersedes the split T-0006 (execution) + T-0007 (approvals) drafts, which were scoped but never started — both files removed at merge time. After this task, the tool bridge is functionally complete. Remaining M2: session title/sync, tests, VSIX.

## Security Note (translator policy, per dev/security.md)

- Security level: 2 — High Risk (tool execution path + approval bypass risk).
- Attack surface: loopback callback server (spoofed tool calls/results),
  permission auto-approval, secret leakage in logs.
- Mitigations: callback bearer token (`x-oct-token`, per-window random;
  stable only via explicit `oct.callbackToken`), loopback-only bind, 1 MB
  body cap, default-deny everywhere (timeout/dismiss/cancel/disconnect →
  `reject`), `always` never sent (session trust = client-side auto-`once`),
  VS Code Allow-all never propagates, passwords/headers never logged, tool
  inputs never logged (names/sizes only), result text capped at 100k chars.
- Remaining uncertainty: no VS Code-UI verification yet (translator dialog
  path is code-reviewed + tsc-clean only); `question.asked` stalls unhandled.

## EDH Verification Checklist (open — needs a human in VS Code)

1. `npm run compile`, F5 Extension Development Host, `OCT: Enable` + reload.
2. Agent-mode turn with a Copilot tool (e.g. `#ois`-style workspace tools):
   engine calls → host executes → result fed back → engine answers with it.
3. Parallel tools in one step → one ToolCallPart set per provider return.
4. `GET /api/session` list: 1 conversation = 1 session across tool turns.
5. Cancel mid-tool-call: session interrupted, no orphan blocked executors
   (output channel shows the abort line).
6. Engine `edit` with ask rules: Continue writes / Cancel aborts / no-answer
   past `oct.permissionTimeoutMs` rejects (set 10s to test fast).
7. `OCT: Show Status` shows callback URL + pending count while paused.
8. Regression: text-only turns, B-0001 reload reuse, B-0002 error surfacing.
