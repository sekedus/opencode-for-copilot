# T-0014 — Model name `OCT / <name>` + vision capability

## Status

COMPLETE (verified 2026-10-04: `tsc` 0, `npm test` 48/48)

## Objective

Show picker models as `OCT / <model name>` and set `imageInput: true` on
models whose engine capabilities report vision input.

## Why

M3 items 4+5. Current names are bare engine names (`models.ts:49-57`) and
`imageInput` is hardcoded `false` (`models.ts:63`), so vision models can't
receive images and the OCT origin is invisible in the picker.

## In Scope

- `models.ts`: `name` → `` `OCT / ${name}` ``.
- `imageInput`: true when engine `ModelInfo.capabilities.input` includes
  `"image"` — pre-verified against the opencode schema
  (`packages/schema/src/model.ts:85-96`, default `input: ["text","image"]`;
  modality vocabulary `"text"|"audio"|"image"|"video"|"pdf"` in
  `packages/core/src/models-dev.ts:30`; `"image"` is the vision marker,
  e.g. `packages/core/src/plugin/provider/ollama.ts:94-98`). Re-confirm
  against one live `listModels` response during implementation.
- Picker renders `name` freely with no content/length validation
  (verified in vscode `modelPickerItemPrimitives.ts:153-161`), so
  `` `OCT / ${name}` `` is safe; keep `id` as `<providerID>/<modelID>`
  (routing key) and `family` as the engine provider (drives the
  family-based image-count limits).
- Unit tests for both mappings (missing capabilities → `false`).

## Out of Scope

- Actually sending images (attachment path still placeholder — separate
  future work; this task only advertises the capability).
- Tool priority (T-0015).

## Dependencies / Inputs

- `src/provider/models.ts`, `src/server/client.ts` (`ModelInfo`),
  live engine `listModels` output for the modality string.

## Acceptance Criteria

- [x] Picker shows `OCT / <name>` for every engine model.
- [x] Vision engine model → `imageInput: true`; text-only → `false`.
- [x] `tsc` + `npm test` green (+ live listModels check noted in evidence).

## Evidence

- Implementation: IMPLEMENTED (`OCT / <name>` branding + `imageInput`
  from `capabilities.input includes "image"`; `id`/`family` untouched).
- Tests: VERIFIED (`npm test` 48/48 green 2026-10-04: 6 new model tests;
  `npx tsc --noEmit -p ./` exit 0).
- Runtime/manual verification: NOT RUN (picker screenshot + live
  `listModels` vision re-confirmation need an EDH pass).

## README Impact

None expected.
