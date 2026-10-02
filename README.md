# opencode-for-copilot

VS Code extension bridging a local opencode terminal v2 server into native VS Code Copilot Chat as provider **OCT**.

Opencode runs as a background local engine; Copilot Chat stays the GUI; this extension maps picker models, conversations, and streaming between them.

## Problem solved

- `opencode-llm-proxy` (v1) creates 1 opencode session per Copilot request, spraying sessions in long conversations. This bridge reuses 1 opencode session per Copilot conversation.
- Direct Zen/Go extensions bypass a local engine. This bridge targets `opencode serve` on loopback.
- OpenChamber proves managed-server lifecycle but ships its own webview. This bridge plugs into the Copilot model picker instead.

## Current state

- Milestone M1 (text-only MVP) COMPLETE: `T-0001` shell + gate, `T-0002` server manager, `T-0003` chat provider with 1 conversation = 1 session reuse — all verified 2026-09-29.
- Milestone M2 tool bridge (`T-0006`) COMPLETE and verified 2026-10-02: Copilot tools execute through the engine via a bundled plugin + shuttle loop; engine-native permission requests surface as VS Code confirmations with default-deny.
- Provider vendor `oct`, display `OCT`, VS Code `^1.125.0`, opencode v2 only (verified against 2.0.21).
- Disabled by default; explicit `OCT: Enable` + reload required (background RAM cost).
- Pick an `OCT` model in the Copilot model picker; multi-turn conversations reuse one opencode session.
- Engine sessions carry titles derived from the first user message (empty/attachment-only → unique `OCT: <key8> <MM-DD HH:mm>` fallback); `OCT: Show Status` lists mapped conversations with titles and prunes dead entries.

## Setup

Prerequisites:

- VS Code 1.125+
- Node.js 20+
- [OpenCode Terminal v2](https://opencode.ai/v2/)

Run:

```bash
npm install
npx tsc --noEmit -p ./
```

Press `F5` for the Extension Development Host, then run `OCT: Enable Opencode Engine` from the command palette, reload, pick an `OCT` model in Copilot Chat.

Settings: `oct.enabled`, `oct.opencodeUrl` (empty = managed `opencode serve`), `oct.opencodeBinary`, `oct.opencodePassword` (fallback to `OPENCODE_SERVER_PASSWORD`), `oct.permissionTimeoutMs` (approval no-answer timeout, default 60000), `oct.callbackToken` (stable callback token for external servers; empty = per-window random).

## Tool bridge

Agent-mode turns work end to end: the engine calls Copilot tools through the bundled `oct-tools` plugin, the host executes them, results flow back, and the engine answers with them. Parallel calls in one step are supported; 1 conversation = 1 session holds across tool turns; cancelling interrupts the session and unblocks executors.

Engine-native actions (edit/write/shell under the engine's ask policy) pause the turn with a `OCT needs approval` warning: **Continue Once** (`once`), **Always for This Session** (client-side auto-`once` for the rest of that session — the bridge never sends `always`, and VS Code's Allow-all never propagates), or **Cancel**. Timeout (configurable), dismiss, disconnect, or VS Code cancellation all resolve to deny; an undeliverable reply falls back to interrupting the session. A denied turn ends with one clean sentence, not an error. Every decision is logged (action + resources only).

- Managed mode installs the plugin automatically (`OPENCODE_CONFIG_CONTENT` merges with user plugins) and wires the loopback callback (`OCT_CALLBACK_URL`/`OCT_CALLBACK_TOKEN`).
- External mode (`oct.opencodeUrl`) needs manual install: copy `plugin/oct-tools` to the server, add its absolute path to the server's `plugins` config, and export `OCT_CALLBACK_URL` (from `OCT: Show Status`) plus `OCT_CALLBACK_TOKEN` matching `oct.callbackToken` (set one — the default per-window token cannot be pasted into a persistent server env). Without the plugin, turns stay text-only with a notice (no crash).
- Text-only results: image-producing tools return a placeholder (multimodal deferred); a circuit breaker stops runaway identical-call loops with a proceed-with-what-you-have instruction.

## Workflow entry points

- `AGENTS.md` — project operating rules.
- `dev/now.md` — current-state checkpoint; read first when resuming.
- `dev/roadmap.md` — milestones and task direction.
- `dev/tasks/T-0003-chat-provider-sessions.md` — completed task (provider + session reuse).
- `docs/adr/0001-oct-bridge-architecture.md` — architecture decision.
- `CONTEXT.md` — domain vocabulary (`OCT`, engine, bridge, session sprawl).

## Credits

- [OpenCode v2](https://github.com/anomalyco/opencode/tree/v2?tab=readme-ov-file#readme)
- [OpenChamber](https://github.com/anomalyco/openchamber?tab=readme-ov-file#readme)
- [OpenCode for GitHub Copilot Chat](https://github.com/ltmoerdani/opencode-copilot-chat?tab=readme-ov-file#readme)
- [opencode-llm-proxy](https://github.com/KochC/opencode-llm-proxy?tab=readme-ov-file#readme)
