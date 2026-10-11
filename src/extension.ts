import * as vscode from "vscode";
import * as path from "node:path";
import { checkOpencodeBinary } from "./binary";
import { OCT_DISPLAY_NAME, OCT_VENDOR, readSettings, resolveServerPassword, setEnabled } from "./config";
import { disposeOutputChannel, getOutputChannel, logLine } from "./output";
import { OctChatProvider } from "./provider/octProvider";
import { deleteSession, getSession, listSessions } from "./server/client";
import { PermissionTranslator } from "./provider/permissions";
import {
  canonicalDirectory,
  extractMentionedPaths,
  isSessionGoneError,
  groupSnapshotsByDirectory,
  resolveChatDirectory,
  sessionCreatedMs,
  formatSessionAge,
  shortConversationKey,
} from "./provider/sessions";
import { buildSessionTableGroups, createNonce, renderSessionsHtml } from "./provider/sessionTable";
import { ToolShuttle } from "./provider/tools";
import { OctServerManager } from "./server/manager";

let serverManager: OctServerManager | undefined;
let chatProvider: OctChatProvider | undefined;
const shuttle = new ToolShuttle();
const translator = new PermissionTranslator();

function workspaceCwd(): string {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return canonicalDirectory(folder ?? process.cwd());
}

/**
 * Per-turn workspace directory (T-0022, thin VS Code glue).
 *
 * Resolution chain (first hit wins): message `filePath="..."` attachments >
 * active editor > first-folder fallback. Only open-folder values are ever
 * returned; the result is canonicalized. No open folder falls back to
 * `process.cwd()` (empty to undefined). The server manager `cwd` stays
 * `workspaceCwd()` (process-wide); only session-create `location.directory`
 * goes per-chat.
 */
export function resolveTurnDirectory(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): string | undefined {
  const folders = (vscode.workspace.workspaceFolders ?? [])
    .map((folder) => folder?.uri?.fsPath)
    .filter((p): p is string => typeof p === "string" && p.trim() !== "");
  const messagePaths = extractMentionedPaths(messages);
  const activeEditorPath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
  const resolved = resolveChatDirectory({ messagePaths, activeEditorPath, workspaceFolders: folders });
  if (typeof resolved === "string" && resolved.trim()) {
    return canonicalDirectory(resolved);
  }
  if (folders.length === 0) {
    const canon = canonicalDirectory(process.cwd() ?? "");
    return canon.trim() ? canon : undefined;
  }
  return undefined;
}

async function promptReload(reason: string): Promise<void> {
  const action = await vscode.window.showInformationMessage(reason, "Reload Window");
  if (action === "Reload Window") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

async function enableCommand(): Promise<void> {
  const settings = readSettings();
  if (settings.enabled) {
    vscode.window.showInformationMessage(`${OCT_DISPLAY_NAME} is already enabled.`);
    return;
  }
  const check = await checkOpencodeBinary(settings.opencodeBinary);
  if (!check.ok) {
    getOutputChannel().show(true);
    logLine(`Enable blocked: ${check.message}`);
    vscode.window.showErrorMessage(`OCT: ${check.message}`);
    return;
  }
  logLine(`Binary check ok: opencode v${check.version}. Enabling ${OCT_DISPLAY_NAME}.`);
  await setEnabled(true);
  await promptReload(
    `${OCT_DISPLAY_NAME} enabled (opencode v${check.version}). Reload the window to start the engine and register the provider.`,
  );
}

async function disableCommand(): Promise<void> {
  const settings = readSettings();
  if (!settings.enabled) {
    vscode.window.showInformationMessage(`${OCT_DISPLAY_NAME} is already disabled.`);
    return;
  }
  if (serverManager) {
    await serverManager.stop();
    serverManager = undefined;
    logLine("Managed server stopped.");
  }
  await setEnabled(false);
  await promptReload(`${OCT_DISPLAY_NAME} disabled. Reload the window to unload the provider.`);
}

async function statusCommand(): Promise<void> {
  const settings = readSettings();
  const check = await checkOpencodeBinary(settings.opencodeBinary);
  const server = serverManager?.getState();
  const configuredUrl = settings.opencodeUrl ? settings.opencodeUrl : null;
  const lines = [
    `${OCT_DISPLAY_NAME} status`,
    `enabled: ${String(settings.enabled)}`,
    `binary: ${settings.opencodeBinary} (${check.ok ? `v${check.version}` : "not usable"})`,
    `server: ${server?.url ?? configuredUrl ?? "(not started)"}`,
    `server mode: ${server?.mode ?? (configuredUrl ? "external" : "managed")}`,
    `server status: ${server?.status ?? "disconnected"}`,
    `vendor: ${OCT_VENDOR}`,
    `tool callback: ${shuttle.url || "(not started)"}`,
    `pending approvals: ${String(translator.pendingCount())}`,
    `bridge plugin: ${server?.mode === "external" ? "manual install required (see README)" : "bundled via managed server"}`,
  ];
  if (server?.lastError) {
    lines.push(`server error: ${server.lastError}`);
  }
  if (!check.ok) {
    lines.push(`binary problem: ${check.message}`);
  }
  if (settings.enabled && !serverManager) {
    lines.push("hint: enabled but the server was never started in this window — reload the window (the Enable command asks for this). ");
  }
  await appendSessionList(lines);
  getOutputChannel().show(true);
  for (const line of lines) {
    logLine(line);
  }
}

/** Reused sessions panel for `oct.showSessions` (revealed + refreshed on each open). */
let sessionsPanel: vscode.WebviewPanel | undefined;

/**
 * Verify-and-prune pass shared by startup and status (T-0012).
 *
 * Per-id `GET /api/session/:id` per mapped conversation: exact at any
 * engine session count (the old list-and-compare false-pruned live mappings
 * once the engine held 100+ sessions). 404 = dead (prune); any other error
 * (network/auth/timeout) keeps the mapping — never prune on uncertainty.
 * Returns the pruned conversation keys.
 */
async function verifyAndPruneConversations(): Promise<string[]> {
  if (!chatProvider) {
    return [];
  }
  if (serverManager?.getState().status !== "connected") {
    return [];
  }
  const { baseUrl, password } = chatProvider.serverTarget();
  const deadIds = new Set<string>();
  for (const entry of chatProvider.mappedSessions()) {
    try {
      await getSession(baseUrl, password, entry.sessionId);
    } catch (error) {
      if (isSessionGoneError(error)) {
        deadIds.add(entry.sessionId);
      } else {
        logLine(`Session check failed for ${entry.sessionId} (kept): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (deadIds.size === 0) {
    return [];
  }
  return chatProvider.pruneMappedSessions(deadIds);
}

/**
 * Append the conversation→session list to the status output. Dead entries
 * are pruned first via per-id verification; one engine `GET /api/session`
 * pass then supplies titles + creation times for display only (never for
 * prune decisions). Entries group by workspace directory (T-0017) with a
 * per-entry age from the engine `time.created` millis field (verified live
 * 2026-10-05 against opencode v2.0.21); unmapped/missing times print
 * "age unknown".
 */
async function appendSessionList(lines: string[]): Promise<void> {
  if (!chatProvider) {
    lines.push("sessions: (provider not active)");
    return;
  }
  if (serverManager?.getState().status !== "connected") {
    lines.push("sessions: (server not connected — map not checked)");
    return;
  }
  const prunedKeys = await verifyAndPruneConversations();
  const mapped = chatProvider.mappedSessions();
  if (mapped.length === 0) {
    lines.push(
      prunedKeys.length > 0
        ? `sessions: 0 mapped conversation(s) (${String(prunedKeys.length)} missing — pruned)`
        : "sessions: 0 mapped conversation(s)",
    );
    return;
  }
  const { baseUrl, password } = chatProvider.serverTarget();
  const titles = new Map<string, string>();
  const created = new Map<string, number>();
  try {
    const listed = await listSessions(baseUrl, password, { limit: 500 });
    for (const item of listed) {
      titles.set(item.id, typeof item.title === "string" && item.title ? item.title : "(untitled)");
      const ms = sessionCreatedMs(item);
      if (ms !== undefined) {
        created.set(item.id, ms);
      }
    }
  } catch (error) {
    logLine(`Session title list failed (map unchanged): ${error instanceof Error ? error.message : String(error)}`);
  }
  const nowMs = Date.now();
  lines.push(`sessions: ${String(mapped.length)} mapped conversation(s)${prunedKeys.length > 0 ? `, ${String(prunedKeys.length)} missing — pruned` : ""}`);
  for (const group of groupSnapshotsByDirectory(mapped)) {
    lines.push(`  [${group.directory}] ${String(group.entries.length)} conversation(s)`);
    for (const entry of group.entries) {
      const title = titles.get(entry.sessionId) ?? "(title unavailable)";
      const age = formatSessionAge(created.get(entry.sessionId), nowMs);
      lines.push(
        `    ${shortConversationKey(entry.key)} -> ${entry.sessionId} [${entry.modelKey}] "${title}" (found, ${age === undefined ? "age unknown" : `${age} old`})`,
      );
    }
  }
}

/**
 * Session map table (T-0027, read-only webview).
 *
 * Same data pass as the status list: prune dead mappings first via per-id
 * verification, then one engine `GET /api/session` (limit 500) for titles +
 * last-activity times (display only, never a prune signal). Rows group by
 * workspace directory with `unknown` last. No actions, no deletes — cleanup
 * stays `oct.cleanupOrphans`; stats stay T-0028.
 */
async function showSessionsCommand(): Promise<void> {
  if (!chatProvider) {
    vscode.window.showInformationMessage("OCT: provider is not active. Enable OCT and reload first.");
    return;
  }
  if (serverManager?.getState().status !== "connected") {
    vscode.window.showInformationMessage("OCT: server is not connected. Nothing to show.");
    return;
  }
  const prunedKeys = await verifyAndPruneConversations();
  const mapped = chatProvider.mappedSessions();
  const { baseUrl, password } = chatProvider.serverTarget();
  const infoById = new Map<string, unknown>();
  try {
    const listed = await listSessions(baseUrl, password, { limit: 500 });
    for (const item of listed) {
      infoById.set(item.id, item);
    }
  } catch (error) {
    logLine(`Session table list failed (map unchanged): ${error instanceof Error ? error.message : String(error)}`);
  }
  const groups = buildSessionTableGroups(mapped, infoById, Date.now());
  const html = renderSessionsHtml(groups, mapped.length, prunedKeys.length, createNonce());
  if (sessionsPanel) {
    sessionsPanel.reveal(vscode.ViewColumn.One, false);
    sessionsPanel.webview.html = html;
    return;
  }
  sessionsPanel = vscode.window.createWebviewPanel(
    "octSessions",
    "OCT Sessions",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  sessionsPanel.webview.onDidReceiveMessage((message: unknown) => {
    void handleSessionsMessage(message);
  });
  sessionsPanel.onDidDispose(() => {
    sessionsPanel = undefined;
  });
  sessionsPanel.webview.html = html;
}

/**
 * Answer webview `open-folder` clicks (folder links in the sessions table).
 * The path comes from our own rendered markup, but it is still validated as
 * a non-empty string before `openExternal` — never executed, only opened in
 * the OS file manager.
 */
async function handleSessionsMessage(message: unknown): Promise<void> {
  if (typeof message !== "object" || message === null) {
    return;
  }
  const msg = message as Record<string, unknown>;
  if (msg["command"] !== "open-folder" || typeof msg["path"] !== "string" || !msg["path"].trim()) {
    return;
  }
  const folder = msg["path"];
  try {
    const opened = await vscode.env.openExternal(vscode.Uri.file(folder));
    if (!opened) {
      vscode.window.showErrorMessage(`OCT: could not open folder '${folder}'.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `OCT: could not open folder '${folder}' (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
}

async function refreshModelsCommand(): Promise<void> {
  if (!chatProvider) {
    logLine("Refresh models requested but the provider is not registered (OCT disabled or server not ready).");
    vscode.window.showInformationMessage("OCT: provider is not active. Enable OCT and reload first.");
    return;
  }
  chatProvider.refreshModels();
  logLine("Model refresh requested.");
  vscode.window.showInformationMessage("OCT: refreshing models from the engine.");
}

/**
 * Opt-in orphaned engine session cleanup (T-0016).
 *
 * The graveyard holds only engine sessions OCT mapped and later dropped
 * (LRU eviction, forget) without a 404 confirming them gone — never the
 * user's own CLI sessions. Flow: resolve each id (404 = already gone, drop
 * silently; other errors = keep), dry-run list in the output channel, an
 * explicit VS Code confirmation, then `DELETE` + graveyard removal on
 * success-or-404. Nothing is ever deleted without the Delete action.
 */
async function cleanupOrphansCommand(): Promise<void> {
  if (!chatProvider) {
    vscode.window.showInformationMessage("OCT: provider is not active. Enable OCT and reload first.");
    return;
  }
  if (serverManager?.getState().status !== "connected") {
    vscode.window.showInformationMessage("OCT: server is not connected. Nothing was deleted.");
    return;
  }
  const { baseUrl, password } = chatProvider.serverTarget();
  const listed = chatProvider.orphanedSessions();
  if (listed.length === 0) {
    logLine("Orphan cleanup: graveyard empty, nothing to do.");
    vscode.window.showInformationMessage("OCT: no orphaned engine sessions. Nothing to do.");
    return;
  }
  const alive: string[] = [];
  const alreadyGone: string[] = [];
  const unreached: string[] = [];
  for (const sessionId of listed) {
    try {
      await getSession(baseUrl, password, sessionId);
      alive.push(sessionId);
    } catch (error) {
      if (isSessionGoneError(error)) {
        alreadyGone.push(sessionId);
      } else {
        unreached.push(sessionId);
        logLine(`Orphan check failed for ${sessionId} (kept): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  chatProvider.clearOrphaned(alreadyGone);
  getOutputChannel().show(true);
  const preview = alive.slice(0, 10).join(", ");
  logLine(
    `Orphan cleanup dry-run: ${String(alive.length)} candidate(s)` +
      (preview ? `: ${preview}` : "") +
      (alive.length > 10 ? `, …and ${String(alive.length - 10)} more` : "") +
      `; already-gone ${String(alreadyGone.length)}, unreachable ${String(unreached.length)} (kept).`,
  );
  if (alive.length === 0) {
    const nothing = `OCT: no live orphaned sessions (${String(alreadyGone.length)} already gone, ${String(unreached.length)} unreachable — kept). Nothing was deleted.`;
    logLine(nothing);
    vscode.window.showInformationMessage(nothing);
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    `Delete ${String(alive.length)} orphaned engine session(s)? Only sessions OCT mapped and later dropped are candidates — your other engine sessions are never touched.`,
    "Delete",
    "Cancel",
  );
  if (choice !== "Delete") {
    logLine("Orphan cleanup cancelled; deleted nothing.");
    return;
  }
  let deleted = 0;
  const goneLate: string[] = [];
  const failed: string[] = [];
  for (const sessionId of alive) {
    try {
      const outcome = await deleteSession(baseUrl, password, sessionId);
      if (outcome === "deleted") {
        deleted++;
      } else {
        goneLate.push(sessionId);
      }
    } catch (error) {
      failed.push(sessionId);
      logLine(`Orphan delete failed for ${sessionId} (kept): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  chatProvider.clearOrphaned(alive.filter((id) => !failed.includes(id)));
  const summary =
    `Orphan cleanup: deleted ${String(deleted)}, already-gone ${String(alreadyGone.length + goneLate.length)}` +
    `, failed ${String(failed.length)}${failed.length > 0 ? ` (${failed.join(", ")})` : ""}` +
    `, unreachable ${String(unreached.length)} (kept).`;
  logLine(summary);
  vscode.window.showInformationMessage(`OCT: ${summary}`);
}

/** Wiring: gate + server lifecycle + chat provider registration. */
export function activate(context: vscode.ExtensionContext): void {
  const settings = readSettings();
  logLine(`Activating (enabled=${String(settings.enabled)}).`);

  context.subscriptions.push(
    vscode.commands.registerCommand("oct.enable", enableCommand),
    vscode.commands.registerCommand("oct.disable", disableCommand),
    vscode.commands.registerCommand("oct.status", statusCommand),
    vscode.commands.registerCommand("oct.showSessions", showSessionsCommand),
    vscode.commands.registerCommand("oct.refreshModels", refreshModelsCommand),
    vscode.commands.registerCommand("oct.cleanupOrphans", cleanupOrphansCommand),
    { dispose: () => disposeOutputChannel() },
  );

  if (!settings.enabled) {
    logLine("OCT is disabled. Run 'OCT: Enable Opencode Engine' to opt in.");
    return;
  }

  serverManager = new OctServerManager();
  const manager = serverManager;
  context.subscriptions.push({ dispose: () => void manager.stop() });
  context.subscriptions.push({ dispose: () => void shuttle.dispose("window unload") });
  void shuttle
    .start(settings.callbackToken || undefined)
    .then((callbackUrl) => manager.start({
      binary: settings.opencodeBinary,
      externalUrl: settings.opencodeUrl,
      password: resolveServerPassword(settings),
      cwd: workspaceCwd(),
      pluginDir: path.join(context.extensionUri.fsPath, "plugin", "oct-tools"),
      callbackUrl,
      callbackToken: shuttle.callbackToken,
    }))
    .then((state) => {
      if (state.status === "connected" && state.url) {
        const url = state.url;
        chatProvider = new OctChatProvider({
          baseUrl: url,
          password: manager.getPassword(),
          directory: workspaceCwd(),
          sessionStore: context.globalState,
          shuttle,
          translator,
          permissionTimeoutMs: settings.permissionTimeoutMs,
          managed: state.mode === "managed",
          maxSessions: settings.maxSessions,
        });
        const provider = chatProvider;
        context.subscriptions.push(
          vscode.lm.registerLanguageModelChatProvider(OCT_VENDOR, provider),
          { dispose: () => provider.dispose() },
        );
        logLine(`Server ready at ${url}. OCT provider registered.`);
        // T-0012: sweep stale mappings once at startup (log-only, never blocks activation).
        void verifyAndPruneConversations().then(
          (pruned) => {
            logLine(
              pruned.length > 0
                ? `Startup session sweep: pruned ${String(pruned.length)} dead mapping(s).`
                : "Startup session sweep: all mapped sessions alive.",
            );
          },
          (error: unknown) => {
            logLine(`Startup session sweep failed (map unchanged): ${error instanceof Error ? error.message : String(error)}`);
          },
        );
      } else {
        logLine(`Server not ready: ${state.lastError ?? "unknown error"}. Run 'OCT: Show Status'.`);
        vscode.window.showWarningMessage(`OCT: server not ready (${state.lastError ?? "unknown error"}).`);
      }
    }, (error) => {
      const message = error instanceof Error ? error.message : String(error);
      logLine(`Server start failed unexpectedly: ${message}`);
      vscode.window.showWarningMessage(`OCT: server start failed (${message}).`);
    });
}

export function deactivate(): void {
  void serverManager?.stop();
  serverManager = undefined;
  chatProvider?.dispose();
  chatProvider = undefined;
  void shuttle.dispose("deactivate");
  disposeOutputChannel();
}
