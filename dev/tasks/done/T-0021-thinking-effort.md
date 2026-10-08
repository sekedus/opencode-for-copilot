# T-0021 — Thinking Effort via Copilot configure-model (engine variants, single entry)

## Status

COMPLETE (2026-10-07: implemented + unit/live verified + EDH green)

## Objective

Keep exactly one OCT picker entry per engine model. When the engine
reports `Model.Info.variants[]`, attach a Copilot configure-model
`configurationSchema` "Thinking Effort" control (the `...` menu in the
screenshot — Low / Medium Default / High) offering only the reported
variant ids; the user's pick arrives as
`options.modelConfiguration.reasoningEffort` and travels as the engine
`Model.Ref.variant` on create and model-switch. Models without variants
get no control and behave exactly as today. No duplicate
`OCT / <name> (<variant>)` rows.

## Why

M4 scope (user 2026-10-05, conditional on engine support — support
confirmed in schema 2026-10-05: `Model.Ref.variant` optional,
`Model.Info.variants[]` with per-variant overlays; app package already
treats low/high as effort preferences; live `listSessions` shows
`"variant": "xhigh"` on sessions). User correction 2026-10-07 +
screenshot: effort must surface as the Copilot configure-model control
(`...` → Thinking Effort Low / Medium Default / High), not as duplicated
picker rows.

Precedent (source in `%TEMP%`):
- `vscode/src/vscode-dts/vscode.proposed.chatProvider.d.ts`:
  `LanguageModelChatInformation.configurationSchema` (per-model config,
  `group: 'navigation'` renders as a primary picker action) +
  `ProvideLanguageModelChatResponseOptions.modelConfiguration` (resolved
  user pick, forwarded per turn).
- `vscode/extensions/copilot/.../conversation/common/languageModelAccess.ts`:
  `buildReasoningEffortSchemaProperty(effortLevels, family)` →
  `{ type:'string', title:'Thinking Effort', enum, enumItemLabels,
  enumDescriptions, default: pickDefaultReasoningEffort(...),
  group:'navigation' }`; `pickDefaultReasoningEffort` prefers `high` for
  claude/kimi-k3 else `medium` else first advertised.
- `vscode/extensions/copilot/.../byok/vscode-node/byokModelInfo.ts`:
  `byokKnownModelToAPIInfoWithEffort` attaches the schema only when
  `supportsReasoningEffort` is non-empty, honoring an advertised default.
- `vscode/src/vs/platform/agentHost/common/reasoningEffort.ts` +
  `claudeModelConfig.ts`: canonical level list, label/description helpers,
  empty-list → no control.
- `opencode/packages/schema/src/model.ts`: `Model.Ref { id, providerID,
  variant? }`, `Model.Info { variants: Variant[{ id }] }`; wire form is
  `provider/model#variant` (`Model.Ref.parse`). No server-supplied default
  field — default is computed picker-side.

## In Scope

- `ModelInfo` gains `variants?: Array<{ id: string }>` (tolerant: missing /
  malformed → no control, never crash the picker).
- `toOctModels`: exactly one entry per model, always. When normalized
  variant ids are non-empty, attach
  `configurationSchema.properties.reasoningEffort` mirroring the Copilot
  helper (title `Thinking Effort`, `enum` = reported ids,
  `enumItemLabels`/`enumDescriptions`, computed `default`,
  `group: 'navigation'`). Never emit variant-coded picker ids or extra
  rows. (Stable `@types/vscode` lacks the proposed fields — extend via a
  minimal local type/cast, same pattern as existing `isUserSelectable`.)
- Read `options.modelConfiguration?.reasoningEffort` in
  `octProvider.ts` `provideLanguageModelChatResponse` (proposed-API cast),
  validate against that model's advertised variants (absent/unknown →
  omit, engine default), and plumb `variant?` through the provider
  `modelRef` → `sessions.ts` `getOrCreate`/`create`/`ensureModel` →
  `client.ts` `createSession` + `switchSessionModel`
  (`model: { id, providerID, variant? }`).
- Fold the variant into `Entry.modelKey` (e.g. `pickerId#variant` when set)
  so an effort change mid-chat pins via `switch` (1:1 reuse, no fork);
  picker id itself stays stable.
- Unit tests: single entry with/without variants, malformed-variants
  fallback (no schema), default selection (claude→high, other→medium,
  else first), `modelConfiguration` accept/reject round-trip, modelKey
  variant pinning; live probe that the server accepts `model.variant` on
  create (spike inside the task — if rejected, task stops and records).
- EDH: Thinking Effort control visible via the model `...` configure menu,
  create + mid-chat effort switch keep the variant, status line shows it
  when set.

## Out of Scope

- Duplicating picker rows per variant (`OCT / <name> (<variant>)`) —
  explicitly rejected (screenshot shows the configure-model control).
- Inventing effort levels the engine did not report (advertise only).
- Default-variant policy beyond computed default + "omit unless picked a
  known id" (smallest assumption; revisit if EDH shows the picker always
  sends the schema default).
- Reasoning streaming UI (effort only affects the engine call).
- Changing the static `package.json`
  `languageModelChatProviders[].modelConfiguration` (stays generic `{}`).

## Dependencies / Inputs

- `src/server/client.ts`, `src/provider/models.ts`,
  `src/provider/octProvider.ts`, `src/provider/sessions.ts`,
  T-0014 picker branding precedent.

## Allowed Product Files / Areas

- `src/server/client.ts`
- `src/provider/models.ts`
- `src/provider/octProvider.ts`
- `src/provider/sessions.ts` (variant on Entry/modelKey only)
- `test/models.test.ts`, `test/sessions.test.ts`

## Acceptance Criteria

- [x] Picker shows exactly one entry per engine model, with or without variants.
- [x] Models with reported variants expose the Thinking Effort configure
      control with only reported ids; models without expose none.
- [x] Create + switch send the picked variant; unpicked/unknown sends no
      variant (live probe green).
- [x] Changing effort mid-chat keeps 1:1 session reuse (variant change pins
      via switch, no session fork).
- [x] `tsc` + `npm test` green.
- [x] EDH: Thinking Effort control visible via the model `...` configure menu,
      create + mid-chat effort switch keep the variant, status line shows it.

## Evidence

- Implementation: IMPLEMENTED (2026-10-07: `ModelInfo.variants`, schema attach
  in `models.ts`, `modelConfiguration` read + `SessionModelRef.variant` in
  `octProvider.ts`, `modelKeyFor` pin in `sessions.ts`, variant on
  `createSession`/`switchSessionModel` in `client.ts`).
- Tests: TESTED (`tsc` 0, `npm test` 117/117 — incl. single-entry,
  malformed-fallback, default-selection, accept/reject, modelKey pinning,
  provider round-trip with SSE-idle stub).
- Live probe: VERIFIED 2026-10-07 (opencode v2.0.21, managed `serve`: create
  with `variant: 'high'` accepted + round-tripped on GET; create without
  variant defaults to `"default"` server-side; switch to `'low'` accepted +
  persisted. 0 engine models configured in this env, so no advertised
  variants to exercise end-to-end).
- EDH: VERIFIED 2026-10-07 (user-run, F5 host, 26 engine models):
  Steps 1–4 PASS (single `OCT / <name>` row per model; Thinking Effort
  control on variant models, none on others). Step 5 PASS (new chat +
  High → `ses_eeb0d3…` created with `#high`, status
  `[opencode/muse-spark-1.3-contributor-free#high]`). Step 6 PASS
  (same chat → Low: `switched to …#low` on the SAME session id, no fork).
  Step 7 PASS with note (untouched control still sends `#medium`).
- Runtime/manual verification: VERIFIED (EDH above).

## EDH Notes (2026-10-07)

- Default policy (revisit closed): the real picker ALWAYS resolves the
  schema default, so `medium` travels even when the user never touches the
  control — the "omit" path only triggers for absent/unknown values
  (covered by unit + provider tests). Accepted as correct: the schema
  declares a default and Copilot resolves it by design; `medium` is the
  computed default for non-claude families anyway.
- Cosmetic observation: the `...` menu rendered `Xhigh`, not our
  `enumItemLabels` entry `Extra High` (Minimal/Low/Medium/High match either
  way). Payload mirrors Copilot's `buildReasoningEffortSchemaProperty`
  exactly (`enumItemLabels` per proposed d.ts), so kept as-is; revisit only
  if a VS Code build documents a different field.

## README Impact

Model paragraph: Thinking Effort configure control when the engine reports variants (single entry).

## Commit Checkpoint

Suggested commit message:

```text
feat: thinking-effort configure-model from engine variants (single entry)
```

Commit status:

```text
COMMITTED (07ab2f6)
```
