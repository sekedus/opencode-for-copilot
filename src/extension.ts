import * as vscode from "vscode";
import { checkOpencodeBinary } from "./binary";
import { OCT_DISPLAY_NAME, OCT_VENDOR, readSettings, resolveServerPassword, setEnabled } from "./config";
import { disposeOutputChannel, getOutputChannel, logLine } from "./output";
import { OctServerManager } from "./server/manager";

let serverManager: OctServerManager | undefined;

function workspaceCwd(): string {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return folder ?? process.cwd();
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
  getOutputChannel().show(true);
  for (const line of lines) {
    logLine(line);
  }
  vscode.window.showInformationMessage(lines.join("\n"));
}

async function refreshModelsCommand(): Promise<void> {
  // T-0003 wires this to the provider's model-list refresh.
  logLine("Refresh models requested (provider wiring lands in T-0003).");
  vscode.window.showInformationMessage("OCT: model refresh will be available once the chat provider lands (T-0003).");
}

/** Wiring: gate + server lifecycle; provider registers in T-0003. */
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
  void manager
    .start({
      binary: settings.opencodeBinary,
      externalUrl: settings.opencodeUrl,
      password: resolveServerPassword(settings),
      cwd: workspaceCwd(),
    })
    .then((state) => {
      if (state.status === "connected") {
        // T-0003: register vscode.lm.registerLanguageModelChatProvider(OCT_VENDOR, provider) here.
        logLine(`Server ready at ${state.url}. Provider wiring lands in T-0003.`);
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
  disposeOutputChannel();
}
