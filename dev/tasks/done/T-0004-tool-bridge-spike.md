# T-0004 — Tool-bridge spike (bidirectional feasibility)

## Status

COMPLETE

## Objective

Time-boxed spike to prove or disprove a full Copilot-tools ↔ opencode-engine loop before committing to a build. Answer the injection-path unknown with evidence, then recommend the T-0005 build direction (or no-go).

## Why

M1 ships text-only with `toolCalling:true` advertised but `TOOL_NOTICE` fallback. Research (2026-09-29) found `POST /api/session/:id/prompt` accepts only `text/files/agents/skills` — no tool definitions or tool-result fields. Building a full bridge without proving the loop risks wasted work and double-execution (engine already runs its tools; Copilot host runs its tools).

## In Scope

- Probe live engine (`opencode serve` v2.0.18) for any per-turn tool injection: prompt fields, `agents`/`skills` as tool carriers, MCP/config backdoors, message API tool parts.
- Map engine → Copilot direction: `GET /api/event` `session.tool.*` + `permission.asked` capture on a scratch session; map to `LanguageModelToolCallPart` identity (`callId` vs `{assistantMessageID, id}`).
- Map Copilot → engine direction: `options.tools` schema sample + `ToolResultPart` → prompt-text rendering; check truncation/schema-sanitize needs.
- Permission round-trip: `permission.asked` → reply (`once/always/reject`) timing; what stalls without a reply.
- Decision record with evidence + T-0005 recommendation (engine-visible / text-feedback / approvals-only / no-go).

## Out of Scope

- Production code changes in `src/` (spike notes + scratch scripts only).
- Tool execution in the bridge (no running Copilot tools, no approving real engine side-effects beyond a scratch session).
- Session title/sync, tests, VSIX (separate M2 tasks).

## Dependencies / Inputs

- T-0003 provider/streaming/sessions; `src/server/client.ts` prompt + event paths.
- Opencode v2 protocol in `%TEMP%/opencode/packages/protocol/src/groups/` (`session.ts`, `event.ts`, `message.ts`, `permission.ts`).
- Reference `opencode-copilot-chat` tool loop (`OpenCodeProvider.ts`, `toolCallAccumulator.ts`, `chatPrep.ts`, `vscode.proposed.chatProvider.d.ts`).
- ADR-0001 (text-only MVP, tool bridge deferred).

## Allowed Product Files / Areas

- None in `src/` (spike must not modify production code).
- Scratch probes under `%TEMP%` or untracked scripts only (delete or promote explicitly in T-0005).

## State Synchronization Files

- `dev/tasks/T-0004-*.md`
- `dev/roadmap.md`
- `dev/now.md`

## Acceptance Criteria

- [x] Injection path answered with evidence: NO — `tools`/`tool_choice`/`tool_result`/`functions` all HTTP 200 but silently dropped (payload echoes only `text`).
- [x] Engine tool event sample captured: full `write`-tool sequence (input.started/ended, called, success, step.ended `finish:tool-calls`).
- [x] Permission stall behavior documented: `permission.asked` pauses turn; `reply {decision:once}` → 204 resumes; file created.
- [x] T-0005 recommendation recorded: approvals-only + engine-visible (no Copilot-tool execution in bridge).
- [x] No `src/` modifications; `npx tsc --noEmit -p ./` passes (exit 0, 2026-09-29).

## Implementation Notes

Known facts (2026-09-29 research):

- Prompt payload: `id?, text, files[] {uri,name?,description?,mention?}, agents[] {name,mention?}, skills[] {id,mention?}, metadata?, delivery?, resume?`. No tools/results fields.
- Engine SSE tool events: `session.tool.input.started/delta/ended`, `session.tool.called {input, executed}`, `session.tool.progress`, `session.tool.success/failed {content, executed}`; boundaries `session.step.*`, `session.execution.*`, `session.error`, `session.idle`. Stream is volatile (slow-consumer overflow, gaps missed).
- Server tool state: `Assistant.content[]` union `text | reasoning | tool {id,name,state}`; `ToolState` = streaming/running/completed/error.
- Permission API exists: `POST /api/session/:id/permission/:requestID/reply {decision: once|always|reject}`; events `permission.asked/replied`; rulesets at session create/PATCH.
- Reference bridge is single-turn: host owns the agentic loop, provider emits `ToolCallPart(callId,name,input)` and gets results back next turn as `ToolCallPart` + `ToolResultPart`. OCT is multi-turn stateful (1 conversation = 1 session) — loop shapes differ.
- Biggest risks: no injection path; execution-ownership conflict (who approves what); identity mapping (`callId` vs engine ids) + volatile SSE + schema sanitize.

## Verification

Commands:

```text
npx tsc --noEmit -p ./
```

Plus manual probes against a scratch `opencode serve` (loopback only): tool-using prompt → SSE capture → permission reply attempt. Record transcripts in the task file.

Expected result: decision record with evidence; tree clean except task/roadmap/now.md bookkeeping.

## Current Progress

- [x] Prompt injection probes
- [x] SSE tool-event capture
- [x] Permission round-trip probe
- [x] Decision + T-0005 recommendation

## Evidence

- Implementation: N/A (spike produces no production code; scratch scripts in `C:/tmp/oct-spike/` + `/tmp/oct-spike/`)
- Tests: NOT RUN
- Runtime/manual verification: VERIFIED 2026-09-29 against scratch `opencode serve` v2.0.18 (loopback 127.0.0.1:45992, kilo/stealth/space-bunny-alpha). See Probe Log below.

## Probe Log (2026-09-29, scratch server 127.0.0.1:45992)

Setup notes:

- Server is a Windows binary: session `location.directory` must be a Windows path (`C:\...`); Git-Bash `/tmp/...` paths cause prompt HTTP 500.
- Engine auth: default model needed sign-in; kilo provider (stored API key) worked (`stealth/space-bunny-alpha`).
- Sessions: `ses_f14c33bfbffe9r4sOFcF3GKbjE` (tool events), `ses_f14c03577ffeS1GEDJVLZZWs7I` (permission, ruleset `[{action:"*",resource:"*",effect:"ask"}]`).

1. Injection probes (all HTTP 200, fields silently dropped — response echoes only `text`):

   - `{"text":"hi","tools":[{"name":"mytool",...}]}` → `payload:{"text":"hi"}` (no tools key).
   - `tool_choice`, `tool_result`, `functions` variants → same: accepted, dropped.
   - Conclusion: NO per-turn Copilot→engine tool-definition or tool-result injection path exists.

2. Engine tool-event capture (`write tooltest.txt`, content `spike-ok`):

   ```text
   session.inbox.enqueued → session.execution.started → session.inbox.delivered
   → session.step.started {agent, model, assistantMessageID}
   → session.tool.input.started {assistantMessageID, id, name:"write"}
   → session.tool.input.ended {id, text:"{\"path\":...,\"content\":...}"}
   → session.tool.called {id, input:{path, content}, executed:false}
   → session.step.streamed
   → session.tool.success {id, content:[{type:"text",text:"Created file successfully: tooltest.txt"}], executed:false}
   → session.step.ended {finish:"tool-calls", rawFinish:"tool_calls"}
   ```

   Identity mapping: Copilot `callId` has no counterpart — engine key is `{assistantMessageID, id}` (tool UUID). `executed:false` on both called + success (local execution flag, not approval state).

3. Permission round-trip (ask-everything ruleset, `write permtest.txt`):

   - Turn paused after `session.tool.called`; event `permission.asked {id:per_..., sessionID, action:"edit", resources:["permtest.txt"], save:["*"], metadata:{files:[{file, patch, status:"added"}]}, source:{type:"tool", messageID, id}}`.
   - `GET /api/session/:id/permission` → 200 lists the pending request.
   - `POST .../permission/:req/reply {decision:"once"}` → 204; turn resumed, file created (`permtest.txt`, 8 bytes), follow-up `read` verification ran.
   - Stall behavior: without a reply the turn stays paused (no terminal event); the bridge MUST reply or interrupt, else the Copilot turn hangs until timeout.

## Decision

Bidirectional tool execution is a NO-GO: the prompt API has no tool-definition/result fields, so Copilot tools cannot be offered to the engine and Copilot tool results cannot be fed back. The engine already executes its own tools server-side.

T-0005 recommendation: **approvals-only + engine-visible** (two separable slices):

1. Approvals-only (fixes hangs): subscribe to `permission.asked` during `streamTurn`; surface Allow/Deny to the user; send `reply {once|reject}`; on timeout/no-answer interrupt the session. Security-sensitive: default-deny, never auto-approve `always`.
2. Engine-visible (read-only display): translate `session.tool.input.started/ended/called/success/failed` into Copilot chat entries (`ToolCallPart` + text result) so turns show what the engine did. Engine already ran them — VS Code does NOT re-execute. Needs `{assistantMessageID, id}` → `callId` mapping + volatile-SSE gap handling.

Explicitly NOT recommended: executing Copilot tools inside the bridge, or advertising real `toolCalling` execution until approvals-only lands (keep `TOOL_NOTICE` until then).

## Known Issues / Blockers

- None (spike exists to resolve the injection-path unknown).

## README Impact

None expected (spike only; README updates ride with the eventual build task).

## Commit Checkpoint

Suggested commit message:

```text
docs: add T-0004 tool-bridge spike scope
```

Commit status:

```text
COMMITTED (d7f9b28; see dev/now.md Last Commit)
```

## Handoff Notes

T-0005 build depends on the spike decision. Do not start tool execution or `src/` changes until T-0004 lands a recommendation.
