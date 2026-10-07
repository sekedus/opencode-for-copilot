# Opencode Terminal for VS Code Copilot

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
- Engine sessions carry titles derived from the first user message (empty/attachment-only → unique `OCT: <key8> <MM-DD HH:mm>` fallback); `OCT: Show Status` lists mapped conversations grouped by workspace directory with per-entry ages and prunes dead entries.

## Setup

Prerequisites:

- VS Code 1.125+
- Node.js 20+
- [OpenCode Terminal v2](https://opencode.ai/v2/)

Run:

```bash
npm install
npx tsc --noEmit -p ./
npm run lint
```

Press `F5` for the Extension Development Host, then run `OCT: Enable Opencode Engine` from the command palette, reload, pick an `OCT` model in Copilot Chat.

Or install the packaged artifact: `npm run package`, then `code --install-extension opencode-for-copilot-0.1.0.vsix`.

Settings: `oct.enabled`, `oct.opencodeUrl` (empty = managed `opencode serve`), `oct.opencodeBinary`, `oct.opencodePassword` (fallback to `OPENCODE_SERVER_PASSWORD`), `oct.permissionTimeoutMs` (approval no-answer timeout, default 60000), `oct.callbackToken` (stable callback token for external servers; empty = per-window random), `oct.maxSessions` (mapped-conversation cap, default 200; entries for deleted sessions evicted first, then oldest).

## Tool bridge

Agent-mode turns work end to end: Copilot tools are primary — the engine calls them through the bundled `oct-tools` plugin, the host executes them, results flow back, and the engine answers with them. Engine tools are the fallback when the bridge is unavailable (external mode without the plugin): the turn is sent as-is and the engine may use its own tools, with ask-policy approvals still surfacing as confirmations (default-deny). Parallel calls in one step are supported; 1 conversation = 1 session holds across tool turns; cancelling interrupts the session and unblocks executors.

Engine-native actions (edit/write/shell/…) pause the turn with an `OCT needs approval` warning that follows ONLY Copilot's global default (`chat.permissions.default`, read fresh every time): `read` is always allowed silently under every setting (no side effects); other actions ask with **Allow** / **Cancel** on Default (also on missing/unknown/`assisted`), and proceed silently on Bypass (`autoApprove`) / Autopilot. The ONLY way to auto-allow non-read engine actions is Copilot's global or picker permission at Allow-all/Autopilot — no per-session trust, no engine `always`, nothing persisted. Timeout (configurable), dismiss, or VS Code cancellation all resolve to deny; an undeliverable reply falls back to interrupting the session. A denied turn ends with one clean sentence, not an error. Every decision is logged (action + resources only). Copilot tools keep the host's own permissions untouched (mode-dependent + per-tool patterns like `chat.tools.edits.autoApprove`). Limitation: the chat-view permissions picker is per-session host state invisible to provider extensions (verified in VS Code source), so moving the picker does NOT change engine approvals — auto-allow follows the global `chat.permissions.default` setting (Settings UI/JSON), not the picker; the picker still governs Copilot's own tools.

- Managed mode installs the plugin automatically (`OPENCODE_CONFIG_CONTENT` merges with user plugins) and wires the loopback callback (`OCT_CALLBACK_URL`/`OCT_CALLBACK_TOKEN`). It also injects ask-all engine permissions (`{"permissions":[{"action":"*","resource":"*","effect":"ask"}]}`, appended last so it overrides global + workspace files without touching them) so Copilot Default→ask is enforceable; `opencode.json(c)` permission rules are otherwise ignored.
- External mode (`oct.opencodeUrl`) needs manual install: copy `plugin/oct-tools` to the server, add its absolute path to the server's `plugins` config, and export `OCT_CALLBACK_URL` (from `OCT: Show Status`) plus `OCT_CALLBACK_TOKEN` matching `oct.callbackToken` (set one — the default per-window token cannot be pasted into a persistent server env). Without the plugin, engine-native tools are the fallback (no text-only notice, no crash). External servers must set permissions ask-all themselves, otherwise Copilot Default→ask is unenforceable (the engine allows silently).
- Text-only results: image-producing tools return a placeholder (multimodal deferred); a circuit breaker stops runaway identical-call loops with a proceed-with-what-you-have instruction.

## Orphaned engine sessions

Dropping a mapping (LRU eviction, forget, restore-cap overflow at reload, status prune) never deletes the engine session — only the map entry. Sessions OCT mapped and later dropped without a 404 confirming them gone are remembered in a persisted graveyard (cap 200, restore-cap drops included). `OCT: Delete Orphaned Engine Sessions` resolves each id (already-gone entries drop silently), shows a dry-run list, then asks for explicit confirmation before deleting; cancel deletes nothing. Sessions that were never in the map (your own CLI sessions) are never candidates.

A later turn in a dropped chat is retired: it reports `OCT: the opencode session link for this chat was dropped — start a new Copilot chat.` and creates nothing (retrying repeats the notice; the chat never silently forks a history-less session). This differs from the deleted-session notice (there the session itself was deleted).

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

## License

MIT — see [LICENSE](LICENSE).
