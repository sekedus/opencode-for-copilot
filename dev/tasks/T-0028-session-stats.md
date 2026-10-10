# T-0028 — Session stats (usage DataPart + status)

## Status

PLANNED (M5, 2026-10-10)

## Objective

Feed Copilot's Session Info popup from engine stats and mirror used/context/output in status.

## Why

User-scoped M5 item 5 + attached `copilot-session-info.png`. Core owns the popup (`%TEMP%/vscode` `chatContextUsageDetails.ts`); provider feeds `IChatUsage` via `usage` DataPart (`%TEMP%/opencode-copilot-chat` `chatParts.ts:5-22`).

## Design

- After each turn (and continuation), `GET /api/session/:id` → `Session.Info.tokens {input,output,reasoning,cache}` + `Model.Info.limit {context,output}` (ref `%TEMP%/opencode` `session.ts`, `token-usage.ts`, `model.ts`).
- Emit `new LanguageModelDataPart(bytes, "usage")` with `{prompt_tokens, completion_tokens, total_tokens}` so core computes `182.6K / 1M tokens 17%`; include `outputBuffer` from `maxOutputTokens` when known. Category breakdown (System/Tools/Messages/Tool Results) via `promptTokenDetails` best-effort; totals are the guarantee.
- Status/`showSessions` mirror: used tokens, context limit, output limit per mapped session (openchamber `tokenUtils.ts:31-53,87-135` precedent for `total/contextLimit`, `output/outputLimit` percents).
- `provideTokenCount` stays estimate-based (no behavior change).

## In Scope

- `src/server/client.ts` session-tokens/model-limit accessors (pure parsing unit-tested)
- `src/provider/streaming.ts`/`octProvider.ts` usage-DataPart emit + status mirror
- Tests: payload shaping, totals math, missing-limit fallback

## Out of Scope

- Custom popup UI (core-owned); Compact Conversation action (core-owned)

## Acceptance Criteria

- [ ] OCT turns show non-zero context % in Session Info; status shows used/context/output
- [ ] `npm run lint` + `npm test` green + EDH Session Info green

## Evidence

None yet (PLANNED).
