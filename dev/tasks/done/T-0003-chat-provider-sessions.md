# T-0003 — OCT chat provider with 1:1 session reuse (text-only)

## Status

COMPLETE

## Objective

`oct` appears in Copilot picker with engine models; multi-turn conversation reuses one opencode session; responses stream as text; tools advertised unsupported.

## Why

Core value: long Copilot conversations without v1 session sprawl.

## In Scope

- `src/provider/octProvider.ts`: `LanguageModelChatProvider<OctModel>` with `provideLanguageModelChatInformation` (from `GET /api/model`), `provideLanguageModelChatResponse` (text-only), `provideTokenCount` (estimator), change emitter + `refreshModels`.
- `src/provider/models.ts`: map `Model.Info` to picker entries (`id providerID/model`, family, version, capabilities `{toolCalling:true}` + `isUserSelectable:true` so the agent picker lists them; MVP still answers text-only with a tool notice).
- `src/provider/messages.ts`: convert Copilot messages to single opencode prompt text (roles labeled, latest last); deltas only (current turn text, history lives server-side).
- `src/provider/sessions.ts`: in-memory conversation-key → session-id map (key from `options`/`modelOptions` or message-hash fallback), LRU cap 50, `getOrCreate` via `POST /api/session` with `location.directory` = workspace folder, background reaper (never delete on hot path).
- `src/provider/streaming.ts`: `POST /api/session/:id/prompt` then consume `GET /api/event` filtered by session until turn completes; `progress.report(new LanguageModelTextPart(...))`; cancellation + timeout.
- Register via `vscode.lm.registerLanguageModelChatProvider('oct', provider)` only when enabled + server ready.

## Out of Scope

- Tool-call passthrough (deferred task); images; usage accounting; agents-window support.

## Dependencies / Inputs

- T-0001, T-0002; reference `opencode-copilot-chat/src/provider/OpenCodeProvider.ts`, `modelInfo.ts`, `modelList.ts`, `messages.ts`, `transports/engine.ts`; opencode `packages/protocol/src/groups/session.ts`, `model.ts`, `event.ts`.

## Allowed Product Files / Areas

- `src/provider/octProvider.ts`
- `src/provider/models.ts`
- `src/provider/messages.ts`
- `src/provider/sessions.ts`
- `src/provider/streaming.ts`
- `src/extension.ts` (registration wiring)

## State Synchronization Files

- `dev/tasks/T-0003-*.md`
- `dev/roadmap.md`
- `dev/now.md`
- `README.md`

## Acceptance Criteria

- [x] OCT models listed in picker from live engine (fallback empty list with log, no crash).
- [x] Two turns in one Copilot conversation hit the same opencode session (verified via session list / logs).
- [x] New conversation creates a new session; map evicts oldest past 50.
- [x] Text streams incrementally; cancel stops promptly.
- [x] Tool-bearing requests get a clear text notice (unsupported in MVP), no silent drop.
- [x] `npx tsc --noEmit` passes.

## Implementation Notes

Session key: prefer stable conversation id from provider options when VS Code supplies it; else hash of (workspace + model + first message). Never `DELETE` sessions on hot path.

## Verification

Commands:

```text
npx tsc --noEmit
```

Plus manual: pick OCT model, send 3 turns, confirm single session reuse; open second chat, confirm second session.

Expected result: 1 conversation = 1 session, text streams.

## Current Progress

- [x] Models + messages + sessions
- [x] Provider + streaming + registration
- [x] Verify reuse

## Evidence

- Implementation: VERIFIED (tsc --noEmit exit 0, emit ok; model mapping smoke-tested)
- Tests: NOT RUN (no test harness in T-0003 scope)
- Runtime/manual verification: VERIFIED 2026-09-29 — user confirmed OCT models in Manage Models + picker (after `toolCalling:true`/`isUserSelectable:true` fix) and session reuse across turns.

## Known Issues / Blockers

- None.

## README Impact

Document picker usage + session-reuse guarantee after verification.

## Commit Checkpoint

Suggested commit message:

```text
feat: add OCT chat provider with session reuse
```

Commit status:

```text
COMMITTED (d9ce1b4; see dev/now.md Last Commit)
```

## Handoff Notes

Follow-up tasks: tool bridge, packaging (`vsce`), tests.
