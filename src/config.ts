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
  /** No-answer timeout for engine approval confirmations (ms). */
  permissionTimeoutMs: number;
  /**
   * Stable callback token for external-mode servers (empty = per-window
   * random). Lets a manually-installed plugin authenticate without copying
   * a fresh token every reload. Loopback-only secret — never logged.
   */
  callbackToken: string;
  /** Max mapped conversations per workspace directory group (session map cap, LRU within the group). */
  maxSessions: number;
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("oct");
}

const DEFAULT_PERMISSION_TIMEOUT_MS = 60_000;
/** Default conversation→session map cap per workspace directory group (overridden by `oct.maxSessions`). */
export const DEFAULT_MAX_SESSIONS = 200;

export function readSettings(): OctSettings {
  const cfg = getConfig();
  const rawTimeout = cfg.get<number>("permissionTimeoutMs", DEFAULT_PERMISSION_TIMEOUT_MS) ?? DEFAULT_PERMISSION_TIMEOUT_MS;
  const permissionTimeoutMs =
    typeof rawTimeout === "number" && Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.floor(rawTimeout)
      : DEFAULT_PERMISSION_TIMEOUT_MS;
  const rawMax = cfg.get<number>("maxSessions", DEFAULT_MAX_SESSIONS) ?? DEFAULT_MAX_SESSIONS;
  const maxSessions =
    typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax >= 1
      ? Math.floor(rawMax)
      : DEFAULT_MAX_SESSIONS;
  return {
    enabled: cfg.get<boolean>("enabled", false),
    opencodeUrl: (cfg.get<string>("opencodeUrl", "") ?? "").trim(),
    opencodeBinary: (cfg.get<string>("opencodeBinary", "opencode") ?? "").trim() || "opencode",
    opencodePassword: cfg.get<string>("opencodePassword", "") ?? "",
    permissionTimeoutMs,
    callbackToken: cfg.get<string>("callbackToken", "") ?? "",
    maxSessions,
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
