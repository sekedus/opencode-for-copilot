import * as vscode from "vscode";
import { checkOpencodeBinary } from "./binary";
import { OCT_DISPLAY_NAME, OCT_VENDOR, readSettings, setEnabled } from "./config";
import { disposeOutputChannel, getOutputChannel, logLine } from "./output";

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
  // T-0002 will stop the managed server here before clearing the flag.
  await setEnabled(false);
  logLine("Disabled. Managed server stop will be wired in T-0002.");
  await promptReload(`${OCT_DISPLAY_NAME} disabled. Reload the window to unload the provider.`);
}

async function statusCommand(): Promise<void> {
  const settings = readSettings();
  const check = await checkOpencodeBinary(settings.opencodeBinary);
  const lines = [
    `${OCT_DISPLAY_NAME} status`,
    `enabled: ${String(settings.enabled)}`,
    `binary: ${settings.opencodeBinary} (${check.ok ? `v${check.version}` : "not usable"})`,
    `server: ${settings.opencodeUrl || "managed (T-0002 wires spawn/health)"}`,
    `vendor: ${OCT_VENDOR}`,
  ];
  if (!check.ok) {
    lines.push(`binary problem: ${check.message}`);
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

/** Thin wiring only; server + provider land in T-0002/T-0003. */
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

  // T-0002: start managed/external server here.
  // T-0003: register vscode.lm.registerLanguageModelChatProvider(OCT_VENDOR, provider) here.
  logLine("OCT is enabled. Server + provider wiring lands in T-0002/T-0003.");
}

export function deactivate(): void {
  // T-0002: stop owned server here.
  disposeOutputChannel();
}
