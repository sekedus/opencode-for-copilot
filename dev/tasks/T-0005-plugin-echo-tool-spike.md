# T-0005 — Plugin echo-tool spike (block-and-resume loop)

## Status

COMPLETE

## Objective

Prove the block-and-resume loop with one echo tool: a v2 plugin registers a tool whose executor calls back to a test endpoint, blocks the agent loop, receives a reply, and returns it — before committing to the full Copilot-tool build.

## Why

T-0004 proved plugin-less bridging is a NO-GO (prompt API drops tool fields). Research (2026-09-29) found the v2 plugin API has every hook the loop needs (`tool.transform`, mutable `session.context.tools`, `tool execute.before` failure channel, `rpc.register` + `events.emit`). This spike proves the loop works end-to-end with the smallest possible moving part.

## In Scope

- Author a scratch v2 plugin (promise-style `Plugin.define`, `tool.transform` → `ToolEditor.add`) registering one `oct_echo` tool: input `{text: string}`, executor POSTs `{tool, input, sessionID, id}` to a loopback test endpoint, awaits the reply (with timeout), returns it as tool result.
- Load the plugin into a scratch `opencode serve` (config `plugins: [...]`, loopback only); prompt a tool-using turn; verify the agent loop blocks until the test endpoint replies, then continues with the echoed result.
- Probe cancellation: `POST /api/session/:id/interrupt` while the executor is blocked — record whether the executor's AbortSignal fires and how the turn ends.
- Probe `session.context` tools filtering: confirm the plugin can restrict advertised tools per request (needed for OCT 1-session-reuse with varying Copilot tool sets).
- Decision record: GO (loop proven, list follow-ups) or NO-GO (which hook failed, with evidence) for the full Copilot-tool build.

## Out of Scope

- Production code changes in `src/` (spike plugin + test endpoint are scratch only).
- Real Copilot tool wiring (`options.tools`, `ToolCallPart` emission, approval UI) — that is the follow-up build, not this spike.
- Engine-native tool approvals (`permission.asked` translator) — separate T-0005 slice, unchanged by this spike.
- Session title/sync, tests, VSIX (separate M2 tasks).

## Dependencies / Inputs

- T-0004 decision + Probe Log (no injection path; tool events + permission round-trip verified).
- v2 plugin API: `packages/plugin/src/promise/plugin.ts` (`Plugin.define`), `packages/plugin/src/promise/tool.ts` (`ToolEditor.add`, `ToolContext.signal`), `packages/plugin/src/effect/session.ts` (`SessionContext.tools` mutable), `packages/plugin/src/effect/rpc.ts` (back-channel option).
- Tool executor shape: `packages/schema/src/tool.ts` (`Tool.Info.execute(input, context)`, `Tool.Context.progress`, `Tool.Error` rejects via `execute.before`).
- Plugin loading: config `plugins: (string | {package, options})[]` (`packages/schema/src/config/plugin.ts`).

## Allowed Product Files / Areas

- None in `src/` (spike must not modify production code).
- Scratch plugin + test endpoint under `%TEMP%` only (delete or promote explicitly in the follow-up build).

## State Synchronization Files

- `dev/tasks/T-0005-*.md`
- `dev/roadmap.md`
- `dev/now.md`

## Acceptance Criteria

- [x] Echo tool registered via plugin and advertised to the model (direct `oct_echo` call, no `execute` wrapper, with `codemode:false`).
- [x] Block-and-resume proven: callback with `{tool, input, sessionID, id, messageID}`; agent loop waits (3s/60s delays observed); reply returns as tool result; turn completes.
- [x] Cancellation documented: interrupt → `session.tool.failed {type:aborted}` + `session.step.failed`; executor AbortSignal fires (fetch rejects, catch path runs).
- [x] `session.context` tools filtering: works for DIRECT tools (`codemode:false`, `hasEcho=true`, delete hides); codemode-catalog tools are NOT in `event.tools` (separate path); permission-deny removes from catalog.
- [x] GO decision for the full Copilot-tool build recorded with evidence.
- [x] No `src/` modifications; `npx tsc --noEmit -p ./` still passes.

## Implementation Notes

Known API facts (2026-09-29 research):

- Promise-style plugin: `Plugin.define({id, setup(ctx) => cleanup})`; `ctx.tool.transform(cb)` with `ToolEditor.add({name, input, description, execute, output?, options?})`.
- Executor: `execute(input, context: {sessionID, agent, messageID, id, signal: AbortSignal, progress}) => Promise<Tool.Result>`; result `{output?, content?: string | Content[], metadata?}`.
- `session.context` hook carries mutable `tools: Record<string, {description, input}>` — per-request advertised-tool filtering.
- `tool execute.before` is the only hook that may fail (`Tool.Error` rejects before run) — interception point if needed.
- `rpc.register(definition, handlers)` + `events.emit` is the candidate plugin↔extension channel (alternative: loopback HTTP callback like this spike's test endpoint).
- Open design questions for the follow-up build (NOT this spike): RPC-vs-HTTP channel, timeout/cancel semantics, VS Code approval UI vs `permission.reply` unification, schema/name mapping, plugin distribution + versioning with the extension.

## Verification

Commands:

```text
npx tsc --noEmit -p ./
```

Plus manual probes against a scratch `opencode serve` with the spike plugin (loopback only): echo turn → callback capture → reply → completion; interrupt-while-blocked; context-filter check. Record transcripts in the task file.

Expected result: decision record with evidence; tree clean except task/roadmap/now.md bookkeeping.

## Current Progress

- [x] Echo plugin + test endpoint
- [x] Block-and-resume proof
- [x] Interrupt-while-blocked probe
- [x] Context-filter probe
- [x] Decision (GO)

## Evidence

- Implementation: N/A (spike produces no production code; scratch plugin in `C:/tmp/oct-spike5/oct-echo-plugin/`, endpoints `echo-endpoint.cjs`, `turn.cjs`)
- Tests: NOT RUN
- Runtime/manual verification: VERIFIED 2026-09-29 against scratch `opencode serve` v2.0.19 (loopback 127.0.0.1:45997, kilo/stealth/space-bunny-alpha). See Probe Log below.

## Probe Log (2026-09-29, scratch server 127.0.0.1:45997, engine v2.0.19)

Setup notes:

- Plugin load: configured `plugins:` paths must be DIRECTORIES with `index.js`/`index.ts` (file paths are rejected with a warning). Auto-discovery also works via `{workdir}/plugin/*.js` (`.mjs` NOT discovered — only `.ts`/`.js`). Used `OPENCODE_CONFIG_CONTENT='{"plugins":["C:/tmp/oct-spike5/oct-echo-plugin"]}'`.
- Plugin API is promise-style: `export default {id, setup(ctx)}`; `ctx.tool.transform(cb)` → `editor.add(...)`; `ctx.session.hook("context", cb)`.
- Engine auth: kilo provider (stored API key), model `stealth/space-bunny-alpha`.
- Sessions: `ses_f146dab6effeoIuTOERKyXp6qn` (block-and-resume), `ses_f146b496bffeLQqJlyDu8EoDwg` (interrupt), `ses_f1459e26bffeyTACAI7UJo0DAc` (direct), `ses_f1458a2e9ffe4bm0ReYzZ80Uyj` (hide), `ses_f1461bf35ffe0u0rs3JlzXfL4Q` (deny).

1. Block-and-resume (`oct_echo`, input `{text: hello-spike}`):

   ```text
   session.tool.called {name: execute, input: {code: "const result = await tools.oct_echo(...)"}}
   → session.tool.progress {tool: oct_echo, status: running}
   → [executor POSTs {tool, input, sessionID, id, messageID} to test endpoint; waits 3022ms]
   → session.tool.progress {status: completed}
   → session.tool.success {content: "ECHO[3022ms]: spike-reply:hello-spike"}
   → session.step.ended {finish: tool-calls}
   ```

   Callback log confirms payload keys; follow-up assistant message reports the echoed text. Loop proven.

2. Interrupt-while-blocked (60s endpoint, interrupt at ~8s):

   - `POST /api/session/:id/interrupt` → `{"interrupted":true}`.
   - Stream: `session.tool.progress {status: error}` → `session.tool.failed {error: {type: aborted, message: Tool execution interrupted}}` → `session.step.failed {error: {type: aborted, message: Step interrupted}}`.
   - Executor: `context.signal` fires (fetch rejects with abort; catch path returns `ECHO-ABORTED`). Stored message shows tool state `error` with the abort.
   - Conclusion: cancellation propagates cleanly; the bridge MUST interrupt (or reply) — no hang.

3. Context-filter (`session.context` hook, `delete event.tools["oct_echo"]`):

   - Codemode-default plugin tools are NOT in `event.tools`: hook log shows `tools=[edit,glob,grep,question,read,shell,skill,subagent,webfetch,websearch,write,execute] hasEcho=false`. They live in the codemode catalog (`tools.oct_echo(...)` via `execute`), built before/perpendicular to the hook.
   - With `options: {codemode: false}` the tool becomes DIRECT: hook log `hasEcho=true`; model calls it without the `execute` wrapper (`input: {text}` clean); `delete` hides it — `search({query:"oct_echo"})` returns empty.
   - Permission-deny alternative: `PATCH /api/session/:id {permissions:[{action:"oct_echo",resource:"*",effect:"deny"}]}` → 204; catalog drops the tool (`search` empty, model reasons it is unavailable).
   - Conclusion: per-request filtering works via direct tools + hook deletion, or via permission rulesets. Codemode tools need the permission path.

## Decision

GO for the full Copilot-tool build via v2 plugin, with these proven primitives:

1. Register Copilot tools as plugin tools (direct `codemode:false` preferred — clean inputs, hook-visible, deletable per request).
2. Executor callback → extension → `ToolCallPart` → host executes → result back → executor returns → engine continues. Block-and-resume proven; interrupt propagates.
3. Per-turn tool scoping via `session.context` hook deletion (direct) or permission rulesets (codemode).

Follow-ups for the build (NOT this spike): RPC-vs-HTTP channel, timeout/cancel semantics, VS Code approval UI vs `permission.reply` unification, schema/name mapping, plugin distribution + versioning with the extension (managed server controls env — easiest path).

## Known Issues / Blockers

- None (spike exists to prove the loop).

## README Impact

None expected (spike only; README updates ride with the eventual build task).

## Commit Checkpoint

Suggested commit message:

```text
docs: add T-0005 plugin echo-tool spike scope
```

Commit status:

```text
UNCOMMITTED
```

## Handoff Notes

On GO: the follow-up build wires real Copilot tools (`options.tools` → plugin registration, executor callback → `ToolCallPart`/`ToolResultPart` loop, approval UI). On NO-GO: fall back to approvals-only + engine-visible (T-0004 recommendation).
