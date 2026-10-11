# Opencode Terminal for VS Code Copilot

<picture>![Badge Repo Size]</picture>
[![Badge License]](./LICENSE)
[![Badge OpenCode]](https://github.com/anomalyco/opencode/releases/tag/v2.0.21)
[![Badge Copilot]](https://github.com/microsoft/vscode/tree/1.135.0/extensions/copilot)

Chat with your local [opencode terminal (v2)](https://opencode.ai/v2) inside VS Code's Copilot Chat, as provider **OCT**.

Opencode runs in the background as the engine. Copilot Chat stays the interface. Each Copilot conversation reuses one opencode session, so long chats don't spray dozens of single-turn sessions.

<br>

## Requirements

- VS Code 1.125 or [newer](https://github.com/microsoft/vscode/releases/latest)
- Node.js 20 or newer
- [OpenCode Terminal v2](https://opencode.ai/download)  
  Check with `opencode --version`.

<br>

## Install

1. Get the code and build the install file:

   ```bash
   git clone https://github.com/sekedus/opencode-for-copilot.git
   cd opencode-for-copilot
   npm install
   npm run package
   ```
2. Open `opencode-for-copilot` in VS Code.
3. Install the built file: open the Extensions view (`Ctrl+Shift+X`) → `...` menu → **Install from VSIX…**.

   or run:
   ```bash
   code --install-extension opencode-for-copilot-0.1.0.vsix
   ```
4. Open the command palette (`Ctrl+Shift+P`) and run `OCT: Enable Opencode Engine`.
5. Reload the window when asked.  
   The extension starts its own `opencode serve` in the background.
6. Open Copilot Chat, click the model picker, and choose an `OCT / <name>` model.
7. Chat.

<br>

> [!NOTE]  
> - There is no marketplace release; the local VSIX install (above) is the distribution path.
> - OCT is **off by default**. Once enabled, the opencode cli runs in the background and uses RAM until VS Code is closed.

<br>

## Models

- The picker lists whatever models your local engine reports. If you add or remove models engine-side, run `OCT: Refresh Models`.
- Some models offer **Thinking Effort** (Low / Medium / High) behind the picker's `...` menu.  
  It only appears when the engine reports variants for that model, and your choice applies both to new chats and mid-chat model switches.

<br>

## Tools and approvals

Agent-mode turns can use tools end to end:

- **Copilot tools first.**  
  The engine calls them through a bundled plugin; VS Code runs them and the answer comes back with the results.  
  In managed mode (the default) the plugin is installed automatically. Parallel tool calls in one step work, and cancelling a turn interrupts the session.
- **Engine tools as fallback.**  
  If the bridge plugin isn't available (typically an external server without it), the engine just uses its own tools.

When the engine itself wants to do something (edit a file, run a shell command, …) you'll get an approval prompt.

The rules, in plain terms:

- Reading files never asks – reads are always allowed silently.
- Anything else asks **Allow / Cancel** when Copilot's global permission setting (`chat.permissions.default`) is at its Default value.
- If that global setting is at Bypass / Allow-all / Autopilot, non-read actions proceed silently.
- No answer (timeout, dismiss, VS Code cancel) means **deny**. A denied turn ends with one plain sentence, not an error dump.
- Moving the small per-chat permissions picker does **not** change engine approvals – only the global `chat.permissions.default` setting (Settings UI or JSON) matters. The picker still governs Copilot's own tools.

In managed mode the extension forces the engine to ask (ask-all permissions) so the Default → ask behavior is enforceable. On an external server you must configure ask-all yourself, otherwise the engine may allow silently.

<br>

## Images

You can attach images to a chat, and image-producing tools send their pictures to vision-capable models automatically.

Limits: 15 MB per image, up to 50 images / 40 MB per turn. Oversize images degrade to a short text placeholder instead of failing the turn.

<br>

## Sessions: 1 chat = 1 session

- Each Copilot conversation maps to 1 opencode session, created from your first message. Titles come from that message (empty or attachment-only chats get a unique `OCT: <id> <date>` fallback).
- Each chat is pinned to 1 workspace folder at creation: an attached file's folder wins, then the active editor's folder, then the first open folder. Switching editors mid-chat never moves a live chat.
- Copilot's **Session Info** popup shows context usage for OCT turns (e.g. `22.9K / 192K tokens 12%`). The popup itself belongs to VS Code; this extension just feeds it totals after each turn.

### Seeing your sessions

- `OCT: Show Status` prints the server state plus your mapped conversations, grouped by workspace folder, each with its age and token usage (`used / context (%) · out …`).  
  Dead entries are pruned first; unreachable checks keep the mapping rather than guessing.
- `OCT: Show Sessions` opens the same mapping as a table (Last chat, Copilot chat, Opencode session, Opencode title, Tokens), grouped by folder.  
  Group headers link to the folder; double-click a cell to select its full value for copying.

### Limits and notices

- At most **200 mapped conversations per workspace folder** (setting `oct.maxSessions`).  
  When a folder is full, entries for deleted sessions go first, then the oldest; other folders are never evicted to make room.
- If the engine session itself was deleted and you keep chatting there, you'll see: `OCT: the opencode session for this chat was deleted – start a new Copilot chat.` Nothing is recreated behind your back.
- If the *link* was dropped (eviction, prune) but the engine session may still exist, you'll see: `OCT: the opencode session link for this chat was dropped – start a new Copilot chat.` The leftover session id is remembered for cleanup (below).

<br>

## Cleanup

Dropping a mapping never deletes the engine session – only the map entry. Sessions OCT mapped and later dropped without proof they're gone are remembered in a graveyard (max 200). Your own CLI sessions are never candidates.

`OCT: Delete Orphaned Engine Sessions` checks each candidate (already-gone ones drop silently), shows you the dry-run list, then asks for explicit confirmation. Cancel deletes nothing.

<br>

## Commands

| Command | What it does |
|---|---|
| `OCT: Enable Opencode Engine` | Checks the `opencode` binary (v2 only), opts in, asks for a reload |
| `OCT: Disable Opencode Engine` | Stops the managed server, opts out, asks for a reload |
| `OCT: Show Status` | Server state + grouped conversation list with ages and token usage |
| `OCT: Show Sessions` | Same mapping as a grouped table (with Tokens column) |
| `OCT: Refresh Models` | Re-reads the model list from the engine |
| `OCT: Delete Orphaned Engine Sessions` | Dry-run + confirmed delete of leftover mapped-then-dropped sessions |

Most settings and commands need a window reload to take effect – the command will tell you when.

<br>

## Settings

| Setting | Default | What it does |
|---|---|---|
| `oct.enabled` | `false` | Master switch. Off = nothing runs. |
| `oct.opencodeUrl` | `""` | External server URL (e.g. `http://127.0.0.1:4096`). Empty = the extension spawns and manages its own server. |
| `oct.opencodeBinary` | `"opencode"` | Path/command for version checks and managed `serve`. |
| `oct.opencodePassword` | `""` | Server password fallback. Prefers the `OPENCODE_SERVER_PASSWORD` env var. |
| `oct.permissionTimeoutMs` | `60000` | Approval no-answer timeout (ms). Past it, the request is denied. |
| `oct.callbackToken` | `""` | Stable tool-bridge token for external servers only. Empty = random per window (managed mode). |
| `oct.maxSessions` | `200` | Mapped-conversation cap **per workspace folder** (deleted-first, then oldest). |

<br>

## External server (advanced)

You normally don't need this – empty `oct.opencodeUrl` (managed mode) just works. To point OCT at a server you run yourself:

1. Set `oct.opencodeUrl` to its URL and set `oct.callbackToken` to a stable value.
2. Copy `plugin/oct-tools` onto that server and add its absolute path to the server's `plugins` config.
3. Export `OCT_CALLBACK_URL` (shown by `OCT: Show Status`) and `OCT_CALLBACK_TOKEN` (your token) for that server.
4. Make that server ask-first for permissions (ask-all), otherwise Default → ask can't be enforced there.

<br>

## Limitations

- **Dead chats stay dead.**  
  If the opencode session was deleted – or its link was dropped – that Copilot chat can't continue; start a new chat. Nothing is recreated or forked behind your back.
- **No OS notifications.**  
  Approvals and notices appear inside VS Code only. If you're looking at another window, nothing pings you – extensions have no API for real system toasts.
- **Engine approvals ignore the per-chat permissions picker.**  
  Only the global `chat.permissions.default` setting (Settings UI or JSON) controls them; the picker still governs Copilot's own tools.

<br>

## Troubleshooting

| Symptom | Try |
|---|---|
| No `OCT` models in the picker | Enable OCT + reload; run `OCT: Show Status`; check `opencode --version` is v2 |
| `Enable blocked: …` | Install opencode v2 and make sure the binary in `oct.opencodeBinary` is on PATH |
| `Server not ready` after reload | `OCT: Show Status` shows the error; restart VS Code; check nothing else occupies the port |
| Enabled but provider not active | You skipped the reload – the Enable command asks for one |
| Approval dialogs never appear / everything auto-allows | Check global `chat.permissions.default` (Settings UI/JSON), not the per-chat picker; on external servers confirm ask-all is configured |
| `…session was deleted – start a new chat` | The engine session is gone; start a fresh Copilot chat (expected, not a bug) |
| `…session link was dropped – start a new chat` | The mapping was evicted/pruned; start a fresh chat, clean leftovers with `OCT: Delete Orphaned Engine Sessions` |
| Images fail or vanish | Check the 15 MB / 50-image / 40 MB caps; oversize becomes a placeholder |
| Status shows `limit unknown` / `no usage yet` | Model didn't advertise limits, or the chat has no turns yet – normal |

<br>

Still stuck? [Open an issue](https://github.com/sekedus/opencode-for-copilot/issues) and paste the `OCT: Show Status` output (plus the `OCT` output channel contents) into it.

<br>

## Development

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/sekedus/opencode-for-copilot.git
   cd opencode-for-copilot
   npm install
   ```
2. Open `opencode-for-copilot` in VS Code.
3. Press `F5` to open an Extension Development Host window.
4. Open the command palette (`Ctrl+Shift+P`) and run `OCT: Enable Opencode Engine`, then reload when asked.
5. Open Copilot Chat, pick an `OCT / <name>` model, and chat.

<br>

Available dev commands:

```bash
npm install      # dependencies
npm run check    # strict typecheck of src/
npm run lint     # check + test-compile gate (run before tests)
npm test         # unit tests (zero extra deps)
npm run compile  # production build into out/
npm run package  # build the VSIX for local install
```

<br>

## For contributors and agents

- `AGENTS.md` – project operating rules.
- `dev/now.md` – current-state checkpoint; read first when resuming.
- `dev/roadmap.md` – milestones and task direction.
- `docs/adr/0001-oct-bridge-architecture.md` – architecture decision.
- `CONTEXT.md` – domain vocabulary (`OCT`, engine, bridge, session sprawl).

<br>

## Credits

- [OpenCode v2](https://github.com/anomalyco/opencode/tree/v2?tab=readme-ov-file#readme)
- [OpenChamber](https://github.com/anomalyco/openchamber?tab=readme-ov-file#readme)
- [OpenCode for GitHub Copilot Chat](https://github.com/ltmoerdani/opencode-copilot-chat?tab=readme-ov-file#readme)
- [opencode-llm-proxy](https://github.com/KochC/opencode-llm-proxy?tab=readme-ov-file#readme)
- [VS Code Workspace Storage Cleanup](https://github.com/mehyaa/vscode-workspace-storage-cleanup?tab=readme-ov-file#readme)

<br>

## License

MIT – see [LICENSE](LICENSE).


<!-- Badges -->
[Badge Repo Size]: https://img.shields.io/github/repo-size/sekedus/opencode-for-copilot?label=Size
[Badge License]: https://img.shields.io/github/license/sekedus/opencode-for-copilot?label=License
[Badge OpenCode]: https://img.shields.io/badge/OpenCode-2.0.21-000000.svg?logo=opencode
[Badge Copilot]: https://img.shields.io/badge/Copilot-0.63.0-8256d0.svg?logo=github-copilot
