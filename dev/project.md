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
- Copilot tool bridge (M2–M4): Copilot tools execute on the host via the bundled `oct-tools` plugin + shuttle loop (primary); engine-native tools are the fallback when the bridge is unavailable (external mode without the plugin, T-0015). Engine-native actions surface as VS Code approvals that follow ONLY Copilot's global `chat.permissions.default` with default-deny (`read` always allowed silently; other actions ask Allow/Cancel on Default, silent on Bypass/Autopilot; no session trust; managed mode injects ask-all, T-0020). Image tool results ferry bytes to the vision model (executor `data:` file parts; attached images via prompt `files`; 15 MB/image, 50 images / 40 MB per turn; oversize degrades to placeholder, T-0023).
- Status command + output-channel diagnostics.

## Out of Scope

- Video/pdf tool results (image ferry shipped in T-0023; non-image content still degrades to a text placeholder).
- VSCodium support (target is VS Code 1.125+ where `chatProvider` API exists).
- PTY terminal features, OpenChamber webview parity, Zen/Go direct auth.
- Marketplace release automation (local VSIX first).

## Tech Stack

- Language(s): TypeScript (strict)
- Framework(s): VS Code Extension API (`lm.registerLanguageModelChatProvider`); opencode v2 REST + SSE (`/api/session`, `/api/model`, `/api/event`)
- Runtime: Node 20+ (extension host); opencode v2.0.x (verified against 2.0.21)
- State: conversation→session map persisted in `vscode.Memento` globalState (`oct.conversationSessions.v1`, cap default 200 via `oct.maxSessions`, evict-dead-first, per-entry workspace directory + grouped status with ages; 404-remap on restore) + persisted dropped-mapping record (`oct.droppedConversations.v1`, retired-chat notice) + persisted orphan graveyard (cap 200, `OCT: Delete Orphaned Engine Sessions`) + opencode server state; no separate DB.
- Build tools: TypeScript `tsc` + `npm run lint` (`noUnusedLocals`/`noUnusedParameters`, T-0018), `vsce` packaging
- Test tools: `node:test` (built-in, zero new deps) for session-map + message-convert units; EDH regression cases committed (`test/`, `npm test`).

## Project Constraints

- OCT disabled by default; background server only runs after explicit enable + reload.
- `capabilities.toolCalling=true` (tool bridge via `oct-tools` plugin + shuttle loop, T-0006); Copilot tools primary, engine tools fallback when the bridge is unavailable (T-0015).
- opencode v2 only; v1 proxy protocol is not supported.

## Success Criteria

- After Enable + reload, "OCT" appears in the Copilot model picker with models from the local engine.
- A multi-turn Copilot conversation reuses one opencode session (verifiable via `GET /api/session` list, no per-turn sprawl).
- Disable stops the managed server; no orphan `opencode serve` remains.
- `opencode --version` missing/incompatible blocks enable with a clear message.

## Discovery Status

COMPLETE (2026-09-29). Decisions: VS Code 1.125+, managed+external server, 1:1 session map. M1 shipped text-only; M2 (2026-10-02) added the Copilot tool bridge + approvals. M3 (COMPLETE 2026-10-05, `be123c1`): scale hardening — `oct.maxSessions` setting (T-0011), prune dead sessions on start (T-0012), deleted-session notice (T-0013), `OCT / <name>` branding + vision flag (T-0014), Copilot-primary/engine-fallback priority (T-0015), orphan graveyard + cleanup command (T-0016), cap default 200 + evict-dead-first + grouped status (T-0017). M4 (COMPLETE 2026-10-07): TS lint gate (T-0018), dropped-mapping record + retired-chat notice (T-0019, resolves PL-0002/PL-0004), Copilot-gated approval + trust removal + managed ask-all (T-0020, OS ping parked PL-0006, picker limit PL-0005), Thinking Effort variants (T-0021), per-chat workspace directory (T-0022, resolves PL-0003), image ferry (T-0023, resolves PL-0001).
