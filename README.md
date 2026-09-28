# opencode-for-copilot

VS Code extension bridging a local opencode terminal v2 server into native VS Code Copilot Chat as provider **OCT**.

Opencode runs as a background local engine; Copilot Chat stays the GUI; this extension maps picker models, conversations, and streaming between them.

## Problem solved

- `opencode-llm-proxy` (v1) creates 1 opencode session per Copilot request, spraying sessions in long conversations. This bridge reuses 1 opencode session per Copilot conversation.
- Direct Zen/Go extensions bypass a local engine. This bridge targets `opencode serve` on loopback.
- OpenChamber proves managed-server lifecycle but ships its own webview. This bridge plugs into the Copilot model picker instead.

## Current state

- Milestone M1 (text-only MVP): `T-0001` shell + gate verified; `T-0002` server manager verified; `T-0003` chat provider active.
- Provider vendor `oct`, display `OCT`, VS Code `^1.125.0`, opencode v2 only.
- Disabled by default; explicit `OCT: Enable` + reload required (background RAM cost).

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

Settings: `oct.enabled`, `oct.opencodeUrl` (empty = managed `opencode serve`), `oct.opencodeBinary`, `oct.opencodePassword` (fallback to `OPENCODE_SERVER_PASSWORD`).

## Workflow entry points

- `AGENTS.md` — project operating rules.
- `dev/now.md` — current-state checkpoint; read first when resuming.
- `dev/roadmap.md` — milestones and task direction.
- `dev/tasks/T-0003-chat-provider-sessions.md` — active task.
- `docs/adr/0001-oct-bridge-architecture.md` — architecture decision.
- `CONTEXT.md` — domain vocabulary (`OCT`, engine, bridge, session sprawl).
