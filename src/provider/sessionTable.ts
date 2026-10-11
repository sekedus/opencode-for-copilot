import {
  UNKNOWN_DIRECTORY_GROUP,
  directoryGroupKey,
  formatLastChat,
  groupSnapshotsByDirectory,
  sessionLastActivityMs,
  shortConversationKey,
} from "./sessions";
import { formatUsageCell, limitForSession, snapshotFromSessionInfo, type ModelLimit } from "./usage";

/**
 * Session map table rows (T-0027, pure).
 *
 * Shapes `mappedSessions()` snapshots plus one engine `listSessions` pass
 * into grouped display rows. Grouping/sorting reuses
 * `groupSnapshotsByDirectory` so the table and the status list agree on
 * group order (directories sorted, `unknown` last; entries keep map order
 * within a group). The engine list is display-only here — never a prune
 * signal (pruning stays per-id 404, owned by the status/startup sweep).
 */

/** One mapped conversation as listed by the provider (status/table input). */
export interface SessionTableEntry {
  key: string;
  sessionId: string;
  modelKey: string;
  directory?: string;
}

/** One rendered table row: the 5 columns are last chat, copilot id, opencode id, opencode title, tokens. */
export interface SessionTableRow {
  /** Full conversation key (visible copilot id cell; double-click selects it whole). */
  key: string;
  /** Shortened conversation key (`conv:<12>…` / `hash:<12>…`, diagnostics only). */
  copilotId: string;
  /** Engine session id. */
  sessionId: string;
  /** Engine picker model key (kept for diagnostics; not a column). */
  modelKey: string;
  /** Workspace directory group label (`unknown` when unmapped). */
  group: string;
  /** Engine session title (`(title unavailable)` when unlisted). */
  title: string;
  /** Last-chat cell text (`yyyy-mm-dd hh:mm:ss (N units ago)`); undefined = age unknown. */
  lastChat?: string;
  /** Token usage cell text (`12.3k / 200k (6%) · out …`; `no usage yet` when unreported). */
  usage: string;
}

export interface SessionTableGroup {
  directory: string;
  entries: SessionTableRow[];
}

/**
 * Escape untrusted text for the sessions webview (engine titles, workspace
 * paths, ids). The table is read-only with scripts disabled, but titles and
 * paths are engine/user-controlled strings — never interpolate them raw.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build grouped table rows from the conversation map plus engine session
 * info by id (one `listSessions(500)` pass, display-only). Entries whose id
 * is absent from the engine list keep age-unknown + `(title unavailable)` +
 * `no usage yet` instead of dropping — liveness was already settled by the
 * prune sweep. Limits resolve per row (engine `Session.Info.model` ref first,
 * map modelKey fallback); unknown limits render `used (limit unknown)`.
 */
export function buildSessionTableGroups(
  mapped: readonly SessionTableEntry[],
  infoById: ReadonlyMap<string, unknown>,
  nowMs: number = Date.now(),
  limits?: ReadonlyMap<string, ModelLimit>,
): SessionTableGroup[] {
  const rows: Array<SessionTableRow & { directory?: string }> = mapped.map((entry) => {
    const info = infoById.get(entry.sessionId);
    const lastActiveMs = sessionLastActivityMs(info);
    const rawTitle = typeof info === "object" && info !== null
      ? (info as Record<string, unknown>)["title"]
      : undefined;
    const title = typeof rawTitle === "string" && rawTitle ? rawTitle : "(title unavailable)";
    const group = directoryGroupKey(entry.directory);
    const usage = formatUsageCell(snapshotFromSessionInfo(info), limits ? limitForSession(limits, info, entry.modelKey) : undefined);
    return {
      key: entry.key,
      copilotId: shortConversationKey(entry.key),
      sessionId: entry.sessionId,
      modelKey: entry.modelKey,
      group,
      title,
      usage,
      directory: group,
      ...(lastActiveMs === undefined ? {} : { lastChat: formatLastChat(lastActiveMs, nowMs) }),
    };
  });
  return groupSnapshotsByDirectory(rows).map((group) => ({
    directory: group.directory,
    entries: group.entries.map(({ directory: _dir, ...row }) => row),
  }));
}

/** Random nonce for the webview content-security policy (one per render). */
export function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/**
 * Render the sessions table as HTML (pure; the caller owns the panel).
 *
 * One section per workspace group (the header names the folder, so there is
 * no Group column); columns are Last chat, Copilot chat, Opencode session,
 * Opencode title, Tokens. Ids and titles render as full plain text; a double-click
 * delegate selects the whole cell value for copy, while single click keeps
 * normal caret behavior. Only the group header links to open the workspace
 * folder in the file manager (except `unknown`, which has no folder). Cells
 * wrap with column min-widths; each table scrolls x/y inside its wrapper when the panel is
 * too narrow. Scripts stay out of the markup except a nonce-authorized
 * click delegate that posts `open-folder` messages — every dynamic string
 * passes through `escapeHtml`.
 */
export function renderSessionsHtml(
  groups: SessionTableGroup[],
  total: number,
  pruned: number,
  nonce: string,
): string {
  const heading = `OCT Sessions — ${String(total)} mapped conversation(s)` +
    (pruned > 0 ? ` (${String(pruned)} missing — pruned)` : "");
  let body: string;
  if (total === 0) {
    body = "<p>No mapped conversations yet. Start a Copilot chat with an OCT model to create one.</p>";
  } else {
    body = groups.map((group) => {
      const openable = group.directory !== UNKNOWN_DIRECTORY_GROUP;
      const headerPath = openable
        ? `<a href="#" class="folder-link" data-folder="${escapeHtml(group.directory)}" title="Open folder in file manager">${escapeHtml(group.directory)}</a>`
        : escapeHtml(group.directory);
      const rows = group.entries.map((entry) => {
        const lastChat = entry.lastChat === undefined ? "age unknown" : escapeHtml(entry.lastChat);
        return `<tr><td class="col-last">${lastChat}</td>` +
          `<td class="col-copilot selectable">${escapeHtml(entry.key)}</td>` +
          `<td class="col-opencode selectable">${escapeHtml(entry.sessionId)}</td>` +
          `<td class="col-title selectable">${escapeHtml(entry.title)}</td>` +
          `<td class="col-usage selectable">${escapeHtml(entry.usage)}</td></tr>`;
      }).join("");
      return `<h2>${headerPath} — ${String(group.entries.length)} conversation(s)</h2>` +
        `<div class="table-wrap"><table>` +
        `<thead><tr><th>Last chat</th><th>Copilot chat</th><th>Opencode session</th><th>Opencode title</th><th>Tokens</th></tr></thead>` +
        `<tbody>${rows}</tbody></table></div>`;
    }).join("");
  }
  const style = `body{font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);` +
    `padding:12px 16px;}` +
    `h1{font-size:1.5em;margin:0 0 0.6em;}h2{font-size:var(--vscode-font-size);margin:1.4em 0 0.4em;overflow-wrap:anywhere;}` +
    `a.folder-link{color:var(--vscode-textLink-foreground);text-decoration:none;}` +
    `a.folder-link:hover{text-decoration:underline;}` +
    `.table-wrap{overflow:auto;max-width:100%;max-height:60vh;border:1px solid var(--vscode-panel-border);}` +
    `table{border-collapse:collapse;width:100%;min-width:1160px;}` +
    `th,td{border:1px solid var(--vscode-panel-border);padding:6px 10px;text-align:left;` +
    `vertical-align:top;font-size:1.05em;white-space:normal;overflow-wrap:anywhere;}` +
    `th{background:var(--vscode-editor-lineHighlightBackground);}` +
    `td.selectable{user-select:text;}` +
    `td.col-last{min-width:250px;}td.col-copilot{min-width:200px;}` +
    `td.col-opencode{min-width:220px;}td.col-title{min-width:220px;}td.col-usage{min-width:220px;}`;
  const script = `<script nonce="${escapeHtml(nonce)}">` +
    `(function(){var api=acquireVsCodeApi();` +
    `document.addEventListener("click",function(e){var t=e.target;` +
    `while(t&&t!==document){if(t instanceof Element&&t.hasAttribute("data-folder")){` +
    `e.preventDefault();api.postMessage({command:"open-folder",path:t.getAttribute("data-folder")});return;}` +
    `t=t.parentNode;}});` +
    `document.addEventListener("dblclick",function(e){var t=e.target;` +
    `while(t&&t!==document){if(t instanceof Element&&t.classList&&t.classList.contains("selectable")){` +
    `e.preventDefault();var r=document.createRange();r.selectNodeContents(t);` +
    `var s=window.getSelection();if(s){s.removeAllRanges();s.addRange(r);}return;}` +
    `t=t.parentNode;}});})();</script>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
    `style-src 'unsafe-inline'; script-src 'nonce-${escapeHtml(nonce)}';">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<title>OCT Sessions</title><style>${style}</style></head>` +
    `<body><h1>${escapeHtml(heading)}</h1>${body}${script}</body></html>`;
}
