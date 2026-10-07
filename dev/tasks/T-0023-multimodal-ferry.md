# T-0023 — Multimodal tool-result ferry (PL-0001)

## Status

COMPLETE (2026-10-07: implemented + unit-tested + EDH-verified A/B + regression pass)

## Objective

Ferry image bytes from bridged Copilot tool results to the engine instead
of the `[Attachment omitted …]` placeholder, within explicit caps and
permission review.

Clarification from diagnosis (2026-10-07): user-attached images share the
same drop + transport, so the design covers both ingresses; the acceptance
proof requires both.

## Why

M4 scope; promotes PL-0001 (largest parked item, deliberately last).
T-0015 EDH image redo proved the gap live: `view_image` results reach the
engine only as placeholder text (`src/provider/tools.ts:116-118`), prompt
transport is text-only (`src/server/client.ts` prompt path), and the
vision model itself reported unviewable data.

User report 2026-10-07 confirms it is still live: `explain attached image`
and `explain erro1.png file` fail through the `view_image` tool in OCT,
while the same vision-capable model reads the image in the openchamber
extension and in the opencode terminal directly.

## Diagnosis (2026-10-07, evidence-backed)

Drop sites (this repo, all text-only):

- `src/provider/tools.ts:116-118` — `toolResultToText()` maps
  `LanguageModelDataPart` to `[Attachment omitted: <mime> (<n> bytes) …]`.
- `src/provider/messages.ts:32-34` — `partText()` same placeholder for
  user-attached images; `src/provider/messages.ts:83-88`
  `extractToolResults()` therefore loses bytes before the shuttle.
- `src/server/client.ts:322-332` — `promptSession()` sends `{text}` only,
  no `files`. `src/provider/streaming.ts:292` admits that text; the
  continuation path (`src/provider/octProvider.ts:239`,
  `promptText: null`) admits nothing.
- `plugin/oct-tools/index.js:87-88` — executor returns
  `{content: text}`; image bytes have nowhere to go.
- Picker advertises vision (`src/provider/models.ts:212,233`
  `imageInput`) while `src/provider/models.ts:210-211` notes transport
  stays placeholder — UI promises what the bridge drops.
- Repeat loop then masks it: `src/provider/tools.ts:429-445`
  short-circuits the 3rd identical `view_image` call with `do not call
  it again`.

Producer (reference): Copilot `view_image` returns
`LanguageModelDataPart.image(data: Uint8Array, mime)` inside the tool
result — `%TEMP%/vscode/extensions/copilot/src/extension/tools/node/viewImageTool.tsx:41-59`,
types `%TEMP%/vscode/src/vscode-dts/vscode.d.ts:21018-21061`.

Correct transport (reference — engine accepts `files`, never bare paths):

- Route + schema:
  `%TEMP%/opencode/packages/protocol/src/groups/session.ts:392-412`,
  `%TEMP%/opencode/packages/schema/src/prompt-input.ts:8-34`
  (`{text, files?: [{uri, name?, description?, mention?}]}`,
  `uri: string` required).
- Server resolves `uri` as `data:<mime>;base64,…` (inline) or `file://…`
  (else `Unsupported attachment URI`, 20 MB cap):
  `%TEMP%/opencode/packages/core/src/session/prompt.ts:93-133,151-201,210-225`.
- Terminal TUI sends `files` with the prompt:
  `%TEMP%/opencode/packages/tui/src/component/prompt/index.tsx:1360-1374,480-494`,
  `local-attachment.ts:53-58`; mini transport maps `file` parts to `uri`:
  `mini/stream-v2.transport.ts:259-291,1730-1750`.
- openchamber sends `files: [{uri, name}]` on `session.prompt`/`command`:
  `%TEMP%/openchamber/packages/ui/src/lib/opencode/client.ts:1037-1040,1071-1144,1197-1223`;
  images stay `data:image/png;base64,…`
  (`sync/input-store.ts:48-58,60-87`), `file://` for server files
  (`input-store.ts:32-38,320-341`).

Two ingresses, one ferry:

1. User-attached image → `DataPart` in `messages` → placeholder in
   `partText` → lost in `buildPromptText`.
2. `view_image` tool result → `DataPart.image` in host result →
   placeholder in `toolResultToText` → `shuttle.resolve(sid, id, text)` →
   executor `{content: text}` → engine sees placeholder, retries, hits
   the repeat breaker.

Ruled out: model lacks vision (same model works elsewhere; `imageInput`
true); size-only failure (small images fail too); prompt-text truncation
as root (bytes never leave the bridge).

## Design (approved 2026-10-07, ready to implement)

Decisions (user sign-off 2026-10-07, all Recommended):

- Q1 Transport: `data:<mime>;base64,…` everywhere. Correction 2026-10-07:
  the `file://` shortcut is REJECTED for executor/tool-result content (EDH
  Test B: provider `invalid base64 in data URI`) — it stays valid only for
  prompt `files` (core `readFileAttachment`), which the bridge does not use.
- Q2 Caps: per-image 15 MB (tightened 20→15 2026-10-07: provider rejects
  >20 MB model-side, <15 MB EDH-verified viewable), per-turn max 50 images /
  40 MB total; oversize degrades to the current placeholder.
- Q3 Continuation: extend `resolve(files)` — shuttle resolve carries
  `files`, admitted before re-streaming the blocked turn.
- Q4 Body cap: raise loopback `/oct/execute` 1 MB JSON cap (e.g. ~25 MB)
  and enforce Q2 caps there; token + loopback unchanged.
- Q5 Scope: both ingresses — attached images + `view_image` results share
  one extractor + `files` admission.

Transport: engine prompt `files` field. `uri` is `data:<mime>;base64,…`
primary; `file://…` when the bytes name a file the engine can already
read (e.g. `erro1.png` inside the session directory — avoids re-sending
base64). Never a bare path (engine rejects non-`file:` URIs).

Ingress A (new turn, user-attached): extract `DataPart(image/*)` bytes +
mime from `messages` alongside `buildPromptText(messages)`; send as
`files` on the `promptSession` admission in `streaming.ts`. Text keeps a
`[Image N]` marker (TUI `promptAttachmentLabel` precedent) so the model
can reference it.

Ingress B (continuation, `view_image` result): the hard part. The
continuation admits nothing (`promptText: null`) — `resolve()` text-only
cannot carry bytes. Proposed: extend the shuttle resolve path to carry
`files` and admit them before re-streaming (smallest new admission, not
a fresh user turn). Plugin executor return grows from `{content}` to
`{content, files?}`; `/oct/execute` 1 MB body cap
(`src/provider/tools.ts:39-40,389-411`) is raised (per Q4 decision:
e.g. ~25 MB with Q2 caps enforced, loopback-only + bearer
token unchanged).

Caps (mirror both ends, oversize degrades to the current placeholder):

- Per-image: 20 MB (engine `MAX_ATTACHMENT_BYTES` + Copilot
  `MAX_IMAGE_FILE_SIZE` agree at 20 MB).
- Per-turn: 50 images / 40 MB total (openchamber precedent, per Q2
  decision).
- Non-`image/*` stays placeholder (video/pdf deferred again unless the
  `files` path covers them for free — engine also accepts `application/pdf`).

Security: image bytes are exfiltration-relevant (workspace screenshots,
error dialogs may carry secrets). Review per `dev/security.md` §2/§5:
tool-result images are untrusted input to the engine; user-attached
images are user intent (no extra approval); bridged `view_image` results
ride the existing tool-approval path (no new dialog, but log names/sizes
only, never bytes). Level: 1–2 depending on final admission shape.

Purity/testability: pure extractor `DataPart[] → {files, textMarkers}`
in `messages.ts`/`tools.ts` (unit-seam, mirrors `toolResultToText`);
thin VS Code base64 glue at the call site; `promptSession` gains optional
`files` (prompt path only). No model-side change (T-0014 `imageInput`
as-is).

Tests: extractor (png/jpeg/gif/webp → `data:` URI; oversize/unknown-mime
→ placeholder; empty → empty); prompt-body capture (`files` present +
marker text); shuttle continuation carries `files`; negative: `MAX_BODY`
/ `MAX_RESULT_CHARS` interaction covered.

EDH: image workspace redo (standing OPEN Steps 3–8): (a) attach png +
`explain attached image` → viewable; (b) `explain erro1.png file` via
`view_image` → viewable, no repeat short-circuit; (c) oversize image →
placeholder + clean turn.

## Sign-off (2026-10-07)

Q1–Q5 all confirmed as Recommended (data: transport, 20 MB / 50 /
40 MB caps, extended `resolve(files)`, raised body cap, both ingresses).
Amendments 2026-10-07 from EDH round 1: Q1 corrected to `data:`-only for
tool content (`file://` rejected by provider); Q2 per-image tightened to
15 MB. Security review still open (see Acceptance Criteria). Implementation may
proceed on the approved shape above.

## In Scope

- Implement the approved shape + unit tests + image-workspace EDH redo
  (Steps 3–8 standing OPEN item covers re-verification).
- Both ingresses (shared extractor + `files` admission).
- Caps + oversize-placeholder fallback + security review.

## Out of Scope

- Anything beyond images (video/pdf deferred again unless the `files`
  path covers them for free).
- Model-side vision changes (T-0014 `imageInput` stays as-is).
- Copilot-side rendering changes; engine-side resize/normalize (engine
  `normalizeImageAttachment` owns it).

## Dependencies / Inputs

- PL-0001, `src/provider/tools.ts` (placeholder + shuttle + body cap),
  `src/provider/messages.ts` (attach + extract ingresses),
  `src/server/client.ts` (prompt `files` transport),
  `src/provider/streaming.ts` + `src/provider/octProvider.ts` (admission +
  continuation wiring — requested below),
  `plugin/oct-tools/` (executor return shape),
  `dev/security.md`, T-0015 out-of-scope note, B-0004 follow-up
  (starvation guard interacts with the continuation admission).

## Allowed Product Files / Areas

- `src/provider/tools.ts`
- `src/provider/messages.ts` (extractor only: DataPart → files + markers)
- `src/server/client.ts` (prompt path only: optional `files`)
- `src/provider/streaming.ts` (admission only: send `files` alongside text)
- `src/provider/octProvider.ts` (turn wiring only: collect attach/files +
  continuation `files` admit; requested by design — ferry is impossible
  without touching the turn path)
- `plugin/oct-tools/` (executor return + body-cap handling)
- `test/...`

## Acceptance Criteria

- [x] Design sign-off recorded (Q1–Q5 approved 2026-10-07, all Recommended; Q1/Q2 amended post-EDH — see Evidence).
- [x] Security review done (targeted Level 1–2, 2026-10-07 — see Evidence; no blocking findings).
- [x] Attached-image prompt arrives viewable engine-side (EDH Test A green: `1 image file(s)` admitted, no error).
- [x] `view_image` tool results arrive viewable engine-side (EDH Test B green 2026-10-07: image explained, `view_image (286 chars, 1 file(s))`, no short-circuit).
- [x] Caps enforced; oversized results degrade to placeholder (unit-verified; EDH: >20 MB rejected model-side, <15 MB viewable).
- [x] `tsc` + `npm test` green.

## Evidence

- Implementation: IMPLEMENTED (2026-10-07: `images.ts` ferry helpers + Q2 caps;
  `tools.ts` executor `files` carry + 32 MB body cap; `messages.ts` markers +
  `extractToolResults`/`buildPromptWithImages` files; `client.ts` prompt `files`;
  `streaming.ts` `promptFiles`; `octProvider.ts` turn wiring + `file://` shortcut;
  `plugin/oct-tools` file-part content return. Correction to the approved
  sketch: tool-result bytes ride the held-executor return as engine-native
  `Tool.Result file` parts (no extra prompt admission on continuations —
  the engine consumes executor content directly); prompt `files` carries only
  user-attached images on new turns.)
- Tests: TESTED (`tsc` 0, `npm test` 147/147 incl. T-0023: caps,
  data-URI round-trip + strict validation, prompt-`files` body capture,
  shuttle `resolve(files)` delivery, marker + placeholder degradation)
- EDH round 1 (2026-10-07, user-run): Test A GREEN (attached png admitted:
  `1 image file(s)` on `ses_eea5990f…`, no error; engine continued with
  `list_dir` bridge calls, 1:1 reuse held). Test B RED with root cause:
  the Q1 `file://` shortcut in executor content — the model provider
  accepts only `data:` URIs in tool-result `file` parts and failed with
  `invalid base64 in data URI at input[7].output[1]`. Fixed same day:
  executor file parts are now `data:`-only (matches all engine-native
  producers: `read`, MCP, browser) + strict `isValidDataUri` guard that
  degrades to placeholder instead of poisoning the provider; `file://`
  remains valid only for prompt `files` (core `readFileAttachment`), which
  the bridge does not use (attachments are in-memory bytes). Per-image cap
  tightened 20→15 MB (provider rejects >20 MB model-side; <15 MB verified
  viewable per Test C try 2). Test B re-run pending.
- Runtime/manual verification: VERIFIED (EDH 2026-10-07, user-run: Test A
  attached png admitted with `1 image file(s)` and no error on
  `ses_eea5990f…`; Test B `explain erro1.png` → image explained, `Tool
  result to engine: view_image (286 chars, 1 file(s))` on `ses_eea157b1…`,
  no repeat short-circuit; regression text-only turn byte-identical PASS)
- Security: targeted review 2026-10-07 — Level 1–2. Body-cap raise is
  loopback-only + bearer-token unchanged; bytes flow host→extension→plugin→
  local engine (engine upstream providers out of scope, same as chat text);
  logs record names/sizes/counts only, never bytes; `view_image` rides the
  existing host tool-permission path (no new dialog); oversize degrades
  instead of truncating context. No blocking findings. Remaining
  uncertainty: live EDH proof (above) + external-mode (non-local engine)
  `file://` readability — falls back to `data:` only when no absolute
  image path is present.

## README Impact

Done 2026-10-07: tool-bridge bullet now describes the real image ferry + caps (was: placeholder/multimodal-deferred).

## Commit Checkpoint

Suggested commit message:

```text
feat: ferry image bytes from bridged tool results
```

Commit status:

```text
COMMITTED (038510b)
```
