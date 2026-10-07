# ADR-0001 — OCT Bridge via Copilot `LanguageModelChatProvider` + Managed Opencode v2 Server

- Status: ACCEPTED (partially superseded by M2–M4 — see Addenda 2026-10-02 / 2026-10-07)
- Date: 2026-09-29

## Context

The user wants opencode terminal v2 as a local engine behind native VS Code Copilot Chat. Five references were surveyed (in `%TEMP%`):

- `opencode v2 (f0f4c94)`: REST + SSE under `/api/*` (`session.create/prompt`, `model.list`, `event.subscribe`), started via `opencode serve`, health via `GET /api/info`. No `/chat/completions`.
- `openchamber v2 (90726f9)`: managed-or-external `opencode serve` lifecycle (`OpenCodeManager`, stdout `server listening on` parse, `waitForApiUrl` on `/api/info`), but ships its own webview, not Copilot Chat.
- `opencode-copilot-chat (191f6df)`: plugs Zen/Go into the Copilot picker via `languageModelChatProviders` vendor + `vscode.lm.registerLanguageModelChatProvider` (`provideLanguageModelChatInformation/Response/TokenCount`), `engines.vscode ^1.125.0`. No local engine.
- `opencode-llm-proxy v1 (8c262c4)`: stateless proxy creating + deleting one opencode session per request — the session-sprawl failure mode to avoid.
- `vscode (08d4889, tag 1.135.0)`: upstream `vscode.proposed.chatProvider.d.ts` still exposes `registerLanguageModelChatProvider` (`provideLanguageModelChatInformation/Response`), confirming the picker API targeted by the bridge.

The bridge must avoid per-turn session sprawl, must not run the engine unless explicitly enabled (RAM cost), and must target the Copilot picker API that only exists on recent VS Code.

## Decision

1. Expose vendor `oct` (`OCT`) through `languageModelChatProviders` + `vscode.lm.registerLanguageModelChatProvider`, following the `opencode-copilot-chat` pattern (thin provider delegating to model-list / chat-prep / transport modules).
2. Manage the engine like OpenChamber: default managed `opencode serve` on loopback `127.0.0.1` (spawn, parse ready, poll `GET /api/info`, stop on disable/deactivate) plus explicit `oct.opencodeUrl` external override. No engine runs while OCT is disabled.
3. Map 1 Copilot conversation to 1 opencode session, reused across turns (`session.create` on miss, `session.prompt` on hit, background reaper only — never per-turn create/delete).
4. Ship text-only MVP first (`capabilities.toolCalling=false`); Copilot tool-call passthrough becomes a separate follow-up.
5. Target VS Code `^1.125.0` only; no VSCodium support in MVP; opencode v2 only.

## Alternatives Considered

- OpenAI-compatible shim in front of opencode (proxy v1 style): rejected — forces transcript replay per request and recreates the sprawl.
- Own chat webview (OpenChamber style): rejected — user explicitly wants Copilot Chat as the GUI.
- External-only server (user runs `opencode serve` manually): rejected as default — worse UX; kept as opt-in override.
- Full tool passthrough in MVP: rejected — doubles scope (tool schema mapping, approval, streaming interleaving); deferred.

## Reasoning

- The picker API (`registerLanguageModelChatProvider`) is the only supported path into Copilot Chat; the reference extension proves it works for remote gateways, so reuse the pattern against a loopback engine.
- Managed + external covers both casual (auto-spawn) and advanced (existing service) users with one code path (resolve URL, health-check, auth header).
- Persistent 1:1 mapping is the minimal fix for the stated weakness; deltas go to the existing session instead of replaying full history into fresh sessions.
- Text-only keeps the MVP to three bounded units (gate, server, provider) that each verify independently.

## Consequences

- Positive: long Copilot conversations reuse one session; enable/disable bounds RAM; model list comes from the engine (`GET /api/model`).
- Negative: no tools/images in MVP (advertised as unsupported); VS Code <1.125 and VSCodium unsupported; `chatProvider` is proposed-API surface and may shift.
- Follow-ups: tool bridge, session title/sync, usage accounting, marketplace packaging.

## Revisit Condition

Revisit when: VS Code stabilizes/renames the chat-provider API; opencode v2 adds a native chat-completions endpoint; or tool passthrough is scoped (then revisit consequence #2).

## M2 Addendum (2026-10-02) — Tool Bridge Shipped (T-0006), No Reaper (T-0007)

Decision 3 (background reaper) and Decision 4 / Consequences (negative / follow-ups) above describe the M1 text-only state and are superseded:

- `capabilities.toolCalling=true`; Copilot tools execute on the host via the bundled `oct-tools` plugin + shuttle loop (`T-0006`, verified 2026-10-02).
- Engine-native actions (`permission.asked`) pause the turn with a VS Code confirmation (once / always-for-session / cancel) and default-deny on timeout, dismiss, disconnect, or cancellation.
- Copilot tools primary, engine tools fallback when the bridge is unavailable (external mode without the plugin, T-0015); non-text content stays placeholder-only (image-producing tools return a placeholder — multimodal deferred).
- No background reaper: sessions are never deleted on the hot path; dead entries are pruned via `OCT: Show Status` (`T-0007`).
- The Revisit Condition's "tool passthrough is scoped" trigger is met and closed by T-0006.

## M3 Addendum (2026-10-05) — Scale Hardening Shipped (T-0011..T-0017, `be123c1`)

Map management without changing the 1:1 reuse decision:

- Configurable `oct.maxSessions` cap (T-0011), raised to default 200 with evict-dead-first + per-entry workspace directory and grouped status with ages (T-0017).
- Dead sessions pruned on start and via status through shared per-id verify-and-prune (T-0012); mid-turn 404 tells the user to start a new chat (T-0013).
- `OCT / <name>` branding + vision flag (T-0014); Copilot-primary / engine-fallback tool priority (T-0015).
- Opt-in orphan graveyard (cap 200, persisted) + `OCT: Delete Orphaned Engine Sessions` dry-run → confirm → delete (T-0016); dropped mappings never silently fork (retired-chat notice lands in M4 via T-0019).

## M4 Addendum (2026-10-07) — Approval Gating, Picker Variants, Per-Chat Directory, Image Ferry (T-0018..T-0023)

- TS lint gate (`noUnusedLocals`/`noUnusedParameters`, `npm run lint`, T-0018).
- Dropped-mapping completeness: restore-cap overflow buries + records into `oct.droppedConversations.v1`; dropped chats retire with a start-a-new-chat notice instead of silent fork (T-0019; closes PL-0002/PL-0004).
- Copilot-gated approval (T-0020): engine-native actions follow ONLY global `chat.permissions.default` read fresh every time — `read` always silent, non-read Allow/Cancel on Default (also missing/unknown/`assisted`), silent on Bypass/Autopilot; session trust removed; managed mode injects ask-all permissions (overrides global + workspace files without touching them); external servers must set ask-all themselves; picker per-session level is invisible to providers (PL-0005) and OS toast has no extension-side path (PL-0006, code removed).
- Thinking Effort via configure-model: single picker entry per model, engine `variants[]` only, travels as variant on create/switch (T-0021).
- Per-chat workspace directory for multi-root (attachment > editor > first-folder, create-time pinning; T-0022; closes PL-0003).
- Image ferry (T-0023; closes PL-0001): tool-result bytes ride the executor return as engine-native `data:` file parts, attached images ride prompt `files` (15 MB/image, 50 images / 40 MB per turn, loopback body 32 MB; oversize/non-image degrades to placeholder). The M2 "placeholder-only" consequence is superseded for images; video/pdf remain deferred.
