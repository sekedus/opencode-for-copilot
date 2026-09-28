import * as vscode from "vscode";

/**
 * Central output channel for OCT diagnostics.
 * Passwords and full auth headers must never be written here.
 */
let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("OCT");
  }
  return channel;
}

export function logLine(message: string): void {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function disposeOutputChannel(): void {
  channel?.dispose();
  channel = undefined;
}
