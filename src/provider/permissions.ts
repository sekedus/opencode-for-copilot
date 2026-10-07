import * as vscode from "vscode";
import { interruptSession, replySessionPermission, type PermissionRequestItem } from "../server/client";
import { logLine } from "../output";

/**
 * Permission translator (T-0006 approvals; T-0020 Copilot-gated).
 *
 * Engine-native actions (edit/write/shell/…) pause the turn with
 * `permission.asked`; this module surfaces each request as a VS Code
 * confirmation and replies `once`/`reject` — the two permission systems are
 * translated, not merged:
 *
 * - Opencode tools follow ONLY Copilot's global default
 *   (`chat.permissions.default`, read fresh on every non-read request):
 *   `read` (exact action match) is always auto-`once` silently under every
 *   setting; `default`/missing/unknown/`assisted` ask with Allow/Cancel;
 *   `autoApprove`/`autopilot` auto-`once` silently for that one request.
 *   Copilot tools (bridge `ToolCallPart`) are host-owned and untouched.
 * - Default-deny: timeout, dismiss, VS Code cancellation, or a failed reply
 *   all resolve to `reject` (plus an interrupt fallback when the reply could
 *   not be delivered). Nothing auto-approves except `read` and Copilot
 *   Bypass/Autopilot levels.
 * - No session trust: there is no always-for-session option, no `trusted`
 *   set, nothing persisted. The bridge NEVER sends `always` (which would
 *   persist a server-side rule).
 * - Every decision is logged (action + resources only, never secrets).
 */

export interface PermissionAsked {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  message?: string;
  filesPreview: Array<{ file: string; status: string; patch: string }>;
}

const DIFF_PREVIEW_CHARS = 2000;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Parse a `permission.asked` SSE payload. Returns undefined when not ours. */
export function parsePermissionAsked(
  eventType: string,
  data: Record<string, unknown> | undefined,
  sessionId: string,
): PermissionAsked | undefined {
  if (eventType !== "permission.asked" || !data) {
    return undefined;
  }
  if (data["sessionID"] !== sessionId) {
    return undefined;
  }
  const id = data["id"];
  const action = data["action"];
  if (typeof id !== "string" || !id || typeof action !== "string" || !action) {
    return undefined;
  }
  const metadata = data["metadata"];
  const filesPreview: Array<{ file: string; status: string; patch: string }> = [];
  const rawFiles = (metadata as { files?: unknown } | null)?.files;
  if (Array.isArray(rawFiles)) {
    for (const entry of rawFiles.slice(0, 3)) {
      if (entry !== null && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        filesPreview.push({
          file: typeof record["file"] === "string" ? (record["file"] as string) : "(unknown file)",
          status: typeof record["status"] === "string" ? (record["status"] as string) : "",
          patch:
            typeof record["patch"] === "string"
              ? (record["patch"] as string).slice(0, DIFF_PREVIEW_CHARS)
              : "",
        });
      }
    }
  }
  const message = data["message"];
  return {
    id,
    sessionID: sessionId,
    action,
    resources: asStringArray(data["resources"]),
    message: typeof message === "string" && message ? message : undefined,
    filesPreview,
  };
}

/** Parse a `GET .../permission` list item (status/count path). */
export function parsePermissionItem(item: PermissionRequestItem, sessionId: string): PermissionAsked | undefined {
  if (!item || item.sessionID !== sessionId || !item.id || !item.action) {
    return undefined;
  }
  return {
    id: item.id,
    sessionID: sessionId,
    action: item.action,
    resources: Array.isArray(item.resources) ? item.resources.filter((r): r is string => typeof r === "string") : [],
    message: typeof item.message === "string" && item.message ? item.message : undefined,
    filesPreview: [],
  };
}

export interface TranslatorDeps {
  baseUrl: string;
  password: string;
  /** No-answer timeout; default-deny fires past it. */
  timeoutMs: number;
}

export type ApprovalOutcome = "continued" | "rejected";

/** Exact engine action that is always allowed (no side effects). */
export function isReadAction(action: string): boolean {
  return action === "read";
}

/**
 * Read Copilot's global permission default fresh (no caching).
 * Returns the raw string (`default|assisted|autoApprove|autopilot`) or
 * undefined when unset/unknown (older VS Code predates the setting).
 */
export function readCopilotPermissionLevel(): string | undefined {
  try {
    const cfg = vscode.workspace.getConfiguration("chat");
    const value = cfg?.get<unknown>("permissions.default");
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export type ApprovalMode = "allow-silent" | "ask";

/**
 * Map one engine request to its approval mode (T-0020 simplified rule).
 * `read` is always silent; non-read follows ONLY the global default:
 * `autoApprove`/`autopilot` allow silently, everything else asks.
 */
export function resolveApprovalMode(copilotLevel: unknown, action: string): ApprovalMode {
  if (isReadAction(action)) {
    return "allow-silent";
  }
  if (copilotLevel === "autoApprove" || copilotLevel === "autopilot") {
    return "allow-silent";
  }
  return "ask";
}

export class PermissionTranslator {
  private pending = 0;

  pendingCount(): number {
    return this.pending;
  }

  /**
   * Confirm one engine request with the user and reply. Never throws for a
   * denial path — denials resolve to `"rejected"`. Throws only when the reply
   * could not be delivered AND the interrupt fallback also failed… in
   * practice: throws when reply delivery failed so the caller interrupts.
   */
  async ask(
    deps: TranslatorDeps,
    asked: PermissionAsked,
    token: vscode.CancellationToken,
  ): Promise<ApprovalOutcome> {
    const { baseUrl, password } = deps;
    const label = `${asked.action}${asked.resources.length > 0 ? ` ${asked.resources.join(", ")}` : ""}`;
    if (isReadAction(asked.action)) {
      const delivered = await this.reply(baseUrl, password, asked, "once");
      logLine(`Permission ${asked.id} (${label}): auto-continued (read always allowed).`);
      return delivered ? "continued" : "rejected";
    }
    const level = readCopilotPermissionLevel();
    if (level === "autoApprove" || level === "autopilot") {
      const delivered = await this.reply(baseUrl, password, asked, "once");
      logLine(`Permission ${asked.id} (${label}): auto-continued (Copilot ${level}).`);
      return delivered ? "continued" : "rejected";
    }
    if (level !== undefined && level !== "default") {
      logLine(`Permission ${asked.id} (${label}): Copilot level '${level}' treated as ask.`);
    }
    logLine(`Permission ${asked.id} (${label}): asking (Copilot permissions: ${level ?? "default"}).`);
    this.pending++;
    try {
      const choice = await this.confirm(asked, deps.timeoutMs, token);
      if (choice !== "once") {
        const why =
          choice === "timeout"
            ? "timeout default-deny"
            : choice === "cancelled"
              ? "VS Code cancellation"
              : choice === "dismissed"
                ? "dismissed (default-deny)"
                : "user cancel";
        logLine(`Permission ${asked.id} (${label}): denied (${why}).`);
        await this.reply(baseUrl, password, asked, "reject");
        return "rejected";
      }
      const delivered = await this.reply(baseUrl, password, asked, "once");
      logLine(`Permission ${asked.id} (${label}): continued once.`);
      return delivered ? "continued" : "rejected";
    } finally {
      this.pending--;
    }
  }

  private async reply(
    baseUrl: string,
    password: string,
    asked: PermissionAsked,
    decision: "once" | "reject",
  ): Promise<boolean> {
    try {
      const result = await replySessionPermission(baseUrl, password, asked.sessionID, asked.id, decision);
      if (result === "gone") {
        logLine(`Permission ${asked.id}: already resolved server-side (404 benign).`);
        return true;
      }
      return true;
    } catch (error) {
      // Undelivered reply: the turn would hang. Signal the caller to interrupt.
      logLine(
        `Permission ${asked.id}: reply ${decision} failed (${error instanceof Error ? error.message : String(error)}); interrupting.`,
      );
      await interruptSession(baseUrl, password, asked.sessionID);
      return false;
    }
  }

  private async confirm(
    asked: PermissionAsked,
    timeoutMs: number,
    token: vscode.CancellationToken,
  ): Promise<"once" | "dismissed" | "timeout" | "cancelled"> {
    if (token.isCancellationRequested) {
      return "cancelled";
    }
    const files = asked.filesPreview
      .filter((change) => change.file && change.file !== "(unknown file)")
      .slice(0, 3);
    const kindByFile = new Map(files.map((change) => [change.file, change.status]));
    const kindWord = (status: string | undefined): string => {
      switch (status) {
        case "added":
          return "new file";
        case "modified":
          return "modified";
        case "deleted":
          return "deleted";
        default:
          return "";
      }
    };
    const lines = [`OCT needs approval: ${asked.action}`];
    for (const resource of asked.resources.slice(0, 5)) {
      const kind = kindWord(kindByFile.get(resource));
      lines.push(`  ${resource}${kind ? ` (${kind})` : ""}`);
    }
    if (asked.resources.length > 5) {
      lines.push(`  …and ${String(asked.resources.length - 5)} more`);
    }
    if (asked.message) {
      lines.push("", asked.message.slice(0, 500));
    }
    for (const change of files) {
      if (change.patch) {
        const truncated = change.patch.length >= DIFF_PREVIEW_CHARS;
        // Plain header, not a markdown fence: notification rendering
        // collapses backtick runs into the surrounding line.
        lines.push("", `--- diff (${change.file}) ---`, change.patch, ...(truncated ? ["…(diff truncated)"] : []));
      }
    }
    if (files.length === 0 && !asked.message) {
      lines.push("", "(No further detail provided by the engine.)");
    }
    let message = lines.join("\n");
    if (message.length > 3000) {
      message = `${message.slice(0, 3000)}\n…(truncated)`;
    }
    const choicePromise = Promise.resolve(
      vscode.window.showWarningMessage(message, "Allow", "Cancel"),
    ).then((choice): "once" | "dismissed" => {
        if (choice === "Allow") {
          return "once";
        }
        return "dismissed";
      });
    const cancelPromise = new Promise<"cancelled">((resolve) => {
      if (token.isCancellationRequested) {
        resolve("cancelled");
        return;
      }
      const sub = token.onCancellationRequested(() => {
        sub.dispose();
        resolve("cancelled");
      });
      void choicePromise.finally(() => sub.dispose());
    });
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), timeoutMs);
      void choicePromise.finally(() => clearTimeout(timer));
    });
    return Promise.race([choicePromise, cancelPromise, timeoutPromise]);
  }
}
