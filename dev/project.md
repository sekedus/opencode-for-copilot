# Project

## Purpose

VS Code extension (`oct`) that bridges a local opencode terminal v2 server into native VS Code Copilot Chat as provider "OCT". Opencode runs as a background local server (engine); Copilot Chat stays the GUI; this extension maps picker models, conversations, and streaming between them.

## Problem

- `opencode-llm-proxy` (v1) creates 1 opencode session per Copilot request, so a long conversation sprays massive single-turn sessions.
- `opencode-copilot-chat` plugs Zen/Go subscriptions directly, bypassing a local opencode engine.
- OpenChamber proves the managed-server pattern but ships its own webview, not the Copilot Chat UI the user already uses.

## Scope

- Opt-in activation gate: `OCT: Enable` / `OCT: Disable` + window reload (opencode eats RAM in background).
- Opencode binary check (`opencode --version`, v2 only) at enable time.
- Managed `opencode serve` lifecycle (spawn, health via `GET /api/info`, stop) + explicit external-URL override.
- `languageModelChatProviders` vendor `oct` with model list from `GET /api/model`.
- Chat streaming with persistent 1 Copilot conversation = 1 opencode session mapping (no per-turn create/delete).
- Copilot tool bridge (M2): Copilot tools execute on the host via the bundled `oct-tools` plugin + shuttle loop; engine-native actions surface as VS Code approvals with default-deny. Text-only fallback only when the bridge is unavailable (external mode without the plugin); image/data tool results serialize to text placeholders (multimodal deferred).
- Status command + output-channel diagnostics.

## Out of Scope

- Image/multimodal tool results (text placeholders only; multimodal deferred).
- VSCodium support (target is VS Code 1.125+ where `chatProvider` API exists).
- PTY terminal features, OpenChamber webview parity, Zen/Go direct auth.
- Marketplace release automation (local VSIX first).

## Tech Stack

- Language(s): TypeScript (strict)
- Framework(s): VS Code Extension API (`lm.registerLanguageModelChatProvider`); opencode v2 REST + SSE (`/api/session`, `/api/model`, `/api/event`)
- Runtime: Node 20+ (extension host); opencode v2.0.x (verified against 2.0.21)
- State: conversation→session map persisted in `vscode.Memento` globalState (`oct.conversationSessions.v1`, LRU 50, 404-remap on restore) + opencode server state; no separate DB.
- Build tools: TypeScript `tsc`, esbuild (planned), `vsce` packaging
- Test tools: `node:test` (built-in, zero new deps) for session-map + message-convert units; EDH regression cases committed (`test/`, `npm test`).

## Project Constraints

- OCT disabled by default; background server only runs after explicit enable + reload.
- `capabilities.toolCalling=true` (tool bridge via `oct-tools` plugin + shuttle loop, T-0006); text-only fallback only when the bridge is unavailable.
- opencode v2 only; v1 proxy protocol is not supported.

## Success Criteria

- After Enable + reload, "OCT" appears in the Copilot model picker with models from the local engine.
- A multi-turn Copilot conversation reuses one opencode session (verifiable via `GET /api/session` list, no per-turn sprawl).
- Disable stops the managed server; no orphan `opencode serve` remains.
- `opencode --version` missing/incompatible blocks enable with a clear message.

## Discovery Status

COMPLETE (2026-09-29). Decisions: VS Code 1.125+, managed+external server, 1:1 session map. M1 shipped text-only; M2 (2026-10-02) added the Copilot tool bridge + approvals.
