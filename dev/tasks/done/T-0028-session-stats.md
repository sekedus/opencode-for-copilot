# T-0028 — Session stats (usage DataPart + status)

## Status

VERIFIED (M5, 2026-10-11 — owner EDH PASS)

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

- [x] OCT turns show non-zero context % in Session Info; status shows used/context/output
- [x] `npm run lint` + `npm test` green + EDH Session Info green (automated green 2026-10-11; EDH PASS 2026-10-11, incl. the 192K denominator re-check)

## HDT

REQUIRED — user-visible runtime surface (Session Info popup numerator + status/table usage cells) with only partial unit coverage; the project verification contract requires EDH runtime proof for session/streaming changes. PASSED 2026-10-11 (owner EDH reports below).

## Evidence

IMPLEMENTED + TESTED 2026-10-11 (AWAITING_HDT):
- `src/server/client.ts`: `SessionInfo` gains `tokens/model/time` (runtime-present, optional); pure `parseSessionTokens()` (`TokenUsage.Info` tolerant, garbage → 0, never throws), `sessionTokensTotal()` (matches server `TokenUsage.total`), `sessionModelRef()` (`Model.Ref` tolerant, garbage → undefined).
- `src/provider/usage.ts` (new, pure): `snapshotFromTokens/Info()` (prompt = input+cache.read+cache.write, completion = output+reasoning, total = sum, cached = read+write — mirrors engine `session/usage.ts` cost model); `toUsagePayload()` (totals guarantee, cached best-effort); `createUsageDataParts()` (exactly one `usage`-mime DataPart, [] when zero); `parseUsagePayload()` round-trip; `formatTokenCount()` (compact, reference-matched); `usagePercent()`; `buildModelLimitMap()` (positive-finite `limit.context/output` only — missing-limit fallback = "limit unknown", never invented); `limitForSession()` (engine `Session.Info.model` ref first, map modelKey incl. `#variant` fallback); `formatUsageCell()` (`used / context (%) · out …`, `used (limit unknown)`, `no usage yet`); `isUsageDataPart()` guard.
- `src/provider/streaming.ts`: post-turn `emitUsage()` (best-effort `GET /api/session/:id` 5s → snapshot → one DataPart via `progress.report`; failures only log, never fail the turn; skipped when zero) on both `done` exits (denial-clean + normal, incl. continuations since they return `done`); tool-pause path unchanged (no mid-turn emit, continuation emits on its own `done`).
- `src/provider/messages.ts` + `src/provider/tools.ts`: `isUsageDataPart` guard — echoed `usage` parts render as "" (never placeholder noise) in `partText()`, tool-result extraction, and `toolResultToText()`; image handling unchanged.
- `src/extension.ts`: status list appends `· <usage>` per entry (one `listSessions(500)` + one `listModels` 10s best-effort pass; model-list failure → limits unknown, never fails status); `oct.showSessions` passes the limit map into the table builder.
- `src/provider/sessionTable.ts`: rows carry `usage`; `renderSessionsHtml()` gains the 5th `Tokens` column (escaped, selectable, `col-usage` 220px; table min-width 940 → 1160px).
- `test/usage.test.ts` (new, 17 tests): token parsing/tolerance, model-ref parsing, snapshot math, payload shaping (+cached omit), DataPart mime + round-trip + zero-skip, prompt hygiene, formatting, limit map + fallback, usage cells, table column + unlisted-kept rows.
- `test/sessions.test.ts`: 5-column header + 1160px expectations updated.
- `npm run lint` green (`check` + `compile-tests`); `npm test` green: 202/202 (was 185/185; +17 new); `npm run compile` green.
- `ARCHITECTURE-MAP.md`: new Session-usage row, client/streaming/extension/table ownership updated.
- Security (Level 1 — displays untrusted engine counters, no auth/session/network boundary change): targeted review — tokens are numeric counters only (no content/paths/secrets); all dynamic table strings still escaped (usage cell via `escapeHtml`); status logs numbers only; usage fetch reuses the existing loopback authed client (5s timeout, no new egress); DataPart payload is counts only. No findings; runtime proof deferred to EDH.
- README: unchanged (human README rewrite is T-0029, PLANNED; this task adds no setup/config surface).
- HDT finding 2026-10-11 (denominator fix, IMPLEMENTED + TESTED): owner reported Session Info showing `22.9K / 192K tokens 12%` while status/table showed `23k / 200k (11%)`. Root cause, verified against live `opencode api model.list`: `big-pickle` advertises `limit {context: 200000, input: 160000, output: 32000}` — status/table used `limit.context` (200k) but the picker reports `maxInputTokens = limit.input` (160k, preferred in `toOctModels`), so core divides by 160k+32k = 192k. Numerator matched (22.9K ≈ 23k, formatter decimals only). Fix: `ModelLimit` keeps `input`, new `effectiveContextLimit()` (`input + output` when advertised, else `context`) mirrors the picker/core denominator; `formatUsageCell()` uses it. `src/extension.ts` limit maps retyped to `ModelLimit`. Test: `limit.input` preferred (big-pickle shape → `23k / 192k (12%) · out 35 / 32k (0%)`). `lint` + `test` 203/203 + `compile` green. The popup's category breakdown (System / Tool Definitions / Messages) is core-side request attribution, not provider payload — the provider sends totals only per the task's "totals are the guarantee".
- EDH PASS (owner, 2026-10-11): Session Info shows non-zero context (`22.9K / 192K tokens 12%` with the breakdown + reserve band); status line carries the matching usage cell (`23k / 200k (11%)` pre-fix shape confirmed in the log; denominator fix re-verified by owner "verified" after the fix).
