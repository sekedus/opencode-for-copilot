import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { checkOpencodeBinary } from "./binary";
import { OCT_DISPLAY_NAME, OCT_VENDOR, readSettings, resolveServerPassword, setEnabled } from "./config";
import { disposeOutputChannel, getOutputChannel, logLine } from "./output";
import { OctChatProvider } from "./provider/octProvider";
import { listSessions } from "./server/client";
import { PermissionTranslator } from "./provider/permissions";
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
 * Canonicalize a workspace directory before handing it to the engine.
 * The engine compares location paths case-sensitively (the instruction
 * plugin walks ancestors until string equality with no cycle guard), so a
 * lowercase drive letter (`c:\...`, as VS Code may report it) recurses
 * forever at the drive root, marks `core/instructions` unavailable, and
 * poisons every session with `instruction initialization blocked`. Prefer the
 * on-disk spelling; fall back to an uppercased drive letter.
 */
function canonicalDirectory(dir: string): string {
  const trimmed = dir.trim();
  if (!trimmed) {
    return trimmed;
  }
  try {
    return fs.realpathSync.native(trimmed);
  } catch {
    const drive = trimmed.match(/^([a-z]):/);
    if (drive?.[1]) {
      return `${drive[1].toUpperCase()}${trimmed.slice(2)}`;
    }
    return trimmed;
  }
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
  vscode.window.showInformationMessage(lines.join("\n"));
}

/** Shorten a conversation key for the status list (`conv:<id>` / `hash:<hex>`). */
function shortConversationKey(key: string): string {
  const idx = key.indexOf(":");
  if (idx < 0) {
    return key;
  }
  const prefix = key.slice(0, idx);
  const rest = key.slice(idx + 1);
  return rest.length > 12 ? `${prefix}:${rest.slice(0, 12)}…` : key;
}

/**
 * Append the conversation→session list to the status output. One engine
 * `GET /api/session` pass supplies titles + existence; entries missing from
 * the engine list are pruned from the persisted map (operator-initiated,
 * same remap philosophy as B-0001). No background polling: this runs only
 * on `OCT: Show Status`. Never prunes when the list call itself fails.
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
  const mapped = chatProvider.mappedSessions();
  if (mapped.length === 0) {
    lines.push("sessions: 0 mapped conversation(s)");
    return;
  }
  const { baseUrl, password } = chatProvider.serverTarget();
  let byId: Map<string, string>;
  let engineCount = 0;
  try {
    const listed = await listSessions(baseUrl, password, { limit: 100 });
    engineCount = listed.length;
    byId = new Map(
      listed.map((s) => [s.id, typeof s.title === "string" && s.title ? s.title : "(untitled)"]),
    );
  } catch (error) {
    lines.push(
      `sessions: ${String(mapped.length)} mapped conversation(s) (list failed, map unchanged: ${error instanceof Error ? error.message : String(error)})`,
    );
    return;
  }
  const deadEntries = mapped.filter((entry) => !byId.has(entry.sessionId));
  if (deadEntries.length > 0) {
    chatProvider.pruneMappedSessions(new Set(deadEntries.map((entry) => entry.sessionId)));
  }
  lines.push(`sessions: ${String(mapped.length)} mapped conversation(s), ${String(engineCount)} engine session(s)`);
  for (const entry of mapped) {
    if (byId.has(entry.sessionId)) {
      const title = byId.get(entry.sessionId) ?? "(untitled)";
      lines.push(`  ${shortConversationKey(entry.key)} -> ${entry.sessionId} [${entry.modelKey}] "${title}" (found)`);
    } else {
      lines.push(`  ${shortConversationKey(entry.key)} -> ${entry.sessionId} [${entry.modelKey}] (missing — pruned)`);
    }
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

/** Wiring: gate + server lifecycle + chat provider registration. */
export function activate(context: vscode.ExtensionContext): void {
  const settings = readSettings();
  logLine(`Activating (enabled=${String(settings.enabled)}).`);

  context.subscriptions.push(
    vscode.commands.registerCommand("oct.enable", enableCommand),
    vscode.commands.registerCommand("oct.disable", disableCommand),
    vscode.commands.registerCommand("oct.status", statusCommand),
    vscode.commands.registerCommand("oct.refreshModels", refreshModelsCommand),
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
        });
        const provider = chatProvider;
        context.subscriptions.push(
          vscode.lm.registerLanguageModelChatProvider(OCT_VENDOR, provider),
          { dispose: () => provider.dispose() },
        );
        logLine(`Server ready at ${url}. OCT provider registered.`);
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
