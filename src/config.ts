import * as vscode from "vscode";

export const OCT_VENDOR = "oct";
export const OCT_DISPLAY_NAME = "OCT";

/** Minimum opencode major version (v1 proxy protocol is unsupported). */
export const MIN_OPENCODE_MAJOR = 2;

export interface OctSettings {
  enabled: boolean;
  opencodeUrl: string;
  opencodeBinary: string;
  /** May be empty; env OPENCODE_SERVER_PASSWORD takes precedence at request time. */
  opencodePassword: string;
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("oct");
}

export function readSettings(): OctSettings {
  const cfg = getConfig();
  return {
    enabled: cfg.get<boolean>("enabled", false),
    opencodeUrl: (cfg.get<string>("opencodeUrl", "") ?? "").trim(),
    opencodeBinary: (cfg.get<string>("opencodeBinary", "opencode") ?? "").trim() || "opencode",
    opencodePassword: cfg.get<string>("opencodePassword", "") ?? "",
  };
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await getConfig().update("enabled", enabled, vscode.ConfigurationTarget.Global);
}

/** Server password: explicit setting wins, else env var, else empty (no auth header). */
export function resolveServerPassword(settings: OctSettings): string {
  if (settings.opencodePassword) {
    return settings.opencodePassword;
  }
  return process.env["OPENCODE_SERVER_PASSWORD"] ?? process.env["OPENCODE_PASSWORD"] ?? "";
}
