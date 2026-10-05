# ADR-0001 — OCT Bridge via Copilot `LanguageModelChatProvider` + Managed Opencode v2 Server

- Status: ACCEPTED (partially superseded by M2 — see Addendum 2026-10-02)
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
