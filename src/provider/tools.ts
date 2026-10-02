import * as http from "node:http";
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { logLine } from "../output";

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Copilot-tool shuttle (T-0006 execution loop).
 *
 * One engine turn spans MULTIPLE Copilot provider calls: the engine owns the
 * loop, the host owns execution. This module owns the extension side:
 *
 * - Pending-tool registry: per-session Copilot definitions the plugin pulls
 *   (`GET /oct/pending-tools`) and registers as direct `codemode:false` tools.
 * - Blocked-executor table: plugin executors POST (`/oct/execute`) and hold
 *   the response open; the next provider call delivers host results and the
 *   shuttle replies, resuming the engine.
 * - `callId` mapping: the engine tool id doubles as the Copilot `callId`
 *   (unique per call); sanitized plugin names map back to Copilot names here.
 *
 * Security: loopback-only server (`127.0.0.1`, ephemeral port), 1 MB body
 * cap, no timeout on held responses except a 10-minute safety abort. Inputs
 * may carry sensitive data — logs record tool names/sizes, never content.
 */

export const BRIDGE_TOOL_PREFIX = "oct__";

const MAX_BODY_BYTES = 1_000_000;
const HELD_RESPONSE_SAFETY_MS = 10 * 60_000;
/** Consecutive identical calls before the circuit breaker short-circuits. */
const REPEAT_BREAKER_N = 3;

export interface PendingTool {
  /** Sanitized registry name (`oct__...`); the plugin uses it verbatim. */
  name: string;
  description: string;
  input: Record<string, unknown>;
}

export interface ShuttleToolDef extends PendingTool {
  /** Original Copilot tool name (emitted in `ToolCallPart`). */
  originalName: string;
}

export interface BlockedCall {
  /** Engine tool id; also the Copilot `callId`. */
  engineId: string;
  sanitized: string;
  originalName: string;
  input: unknown;
  sessionID: string;
  messageID: string;
  receivedAt: number;
}

interface HeldResponder {
  respond: (reply: { text: string; aborted: boolean }) => void;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultInputSchema(): Record<string, unknown> {
  return { type: "object", properties: {} };
}

/**
 * Map Copilot tools to bridge definitions. Sanitization mirrors the engine
 * rule (`[^a-zA-Z0-9_-]` → `_`); the `oct__` prefix namespaces bridge tools
 * and collision suffixes (`__2`, …) keep names unique within the turn.
 * Invalid schemas drop the tool (an engine registration throw would disable
 * the whole plugin transform).
 */
export function mapCopilotTools(tools: readonly vscode.LanguageModelChatTool[]): ShuttleToolDef[] {
  const used = new Set<string>();
  const out: ShuttleToolDef[] = [];
  for (const tool of tools) {
    const originalName = typeof tool?.name === "string" ? tool.name : "";
    if (!originalName) {
      continue;
    }
    const base = `${BRIDGE_TOOL_PREFIX}${originalName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    let name = base;
    for (let n = 2; used.has(name); n++) {
      name = `${base}__${n}`;
    }
    used.add(name);
    const description =
      typeof tool.description === "string" && tool.description ? tool.description : `Copilot tool ${originalName}`;
    const input =
      isPlainObject(tool.inputSchema) && Object.keys(tool.inputSchema).length > 0
        ? (tool.inputSchema as Record<string, unknown>)
        : defaultInputSchema();
    out.push({ name, description, input, originalName });
  }
  return out;
}

/** Cap host result text: pathological outputs must not blow up engine context. */
const MAX_RESULT_CHARS = 100_000;

/** Serialize host tool-result content to the plain text the executor returns. */
export function toolResultToText(content: readonly unknown[]): string {
  const parts: string[] = [];
  for (const part of content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      if (part.value) {
        parts.push(part.value);
      }
      continue;
    }
    if (part instanceof vscode.LanguageModelDataPart) {
      parts.push(`[Attachment omitted: ${part.mimeType} (${part.data.byteLength} bytes) — text-only result]`);
      continue;
    }
    if (typeof part === "string") {
      if (part) {
        parts.push(part);
      }
      continue;
    }
    if (isPlainObject(part)) {
      const value = part["value"];
      if (typeof value === "string" && value) {
        parts.push(value);
        continue;
      }
      const text = part["text"];
      if (typeof text === "string" && text) {
        parts.push(text);
        continue;
      }
    }
    try {
      parts.push(JSON.stringify(part) ?? "(unserializable)");
    } catch {
      parts.push("(unserializable)");
    }
  }
  const text = parts.join("\n");
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated ${String(text.length - MAX_RESULT_CHARS)} chars by OCT bridge)`
    : text;
}

export class ToolShuttle {
  private readonly pending = new Map<string, ShuttleToolDef[]>();
  private readonly blocked = new Map<string, Map<string, BlockedCall & HeldResponder>>();
  private readonly waiters = new Set<{ sessionID: string; resolve: (calls: BlockedCall[]) => void }>();
  /** callIds already emitted as ToolCallParts per session (never re-emit). */
  private readonly emitted = new Map<string, Set<string>>();
  /** Consecutive identical-call circuit breaker per session. */
  private readonly repeat = new Map<string, { key: string; count: number }>();
  private server: http.Server | null = null;
  private callbackUrl = "";
  /** Bearer token for callback routes (loopback defense-in-depth). Never logged. */
  private token = "";
  /** True once any engine plugin has contacted the callback (external-mode gate). */
  private pluginContact = false;

  get url(): string {
    return this.callbackUrl;
  }

  get active(): boolean {
    return this.server !== null;
  }

  /** Start the loopback callback server. Idempotent. */
  start(fixedToken?: string): Promise<string> {
    if (this.server) {
      return Promise.resolve(this.callbackUrl);
    }
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handle(req, res).catch((error: unknown) => {
          logLine(`Callback error: ${error instanceof Error ? error.message : String(error)}`);
          if (!res.writableEnded) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
          }
        });
      });
      server.requestTimeout = 0;
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address !== "object") {
          reject(new Error("Callback server address unavailable."));
          return;
        }
        this.server = server;
        this.callbackUrl = `http://127.0.0.1:${String(address.port)}`;
        this.token = fixedToken || randomToken();
        logLine(`Tool callback listening at ${this.callbackUrl}.`);
        resolve(this.callbackUrl);
      });
    });
  }

  /** Token the managed plugin sends back (`OCT_CALLBACK_TOKEN`). */
  get callbackToken(): string {
    return this.token;
  }

  /** Abort every held executor and close the server. */
  async dispose(reason: string): Promise<void> {
    for (const [sessionID] of this.blocked) {
      this.abortAll(sessionID, reason);
    }
    this.pending.clear();
    const server = this.server;
    this.server = null;
    this.callbackUrl = "";
    this.token = "";
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // -- pending tools -------------------------------------------------------

  setPending(sessionID: string, tools: ShuttleToolDef[]): void {
    this.pending.set(sessionID, tools);
  }

  clearPending(sessionID: string): void {
    this.pending.delete(sessionID);
    this.repeat.delete(sessionID);
  }

  pendingFor(sessionID: string): ShuttleToolDef[] {
    return this.pending.get(sessionID) ?? [];
  }

  hasPending(sessionID: string): boolean {
    return (this.pending.get(sessionID)?.length ?? 0) > 0;
  }

  originalName(sessionID: string, sanitized: string): string {
    return this.pending.get(sessionID)?.find((t) => t.name === sanitized)?.originalName ?? sanitized;
  }

  /** External-mode gate: true once the bundled plugin has contacted us. */
  get bridgeSeen(): boolean {
    return this.pluginContact;
  }

  // -- blocked executors ---------------------------------------------------

  blockedFor(sessionID: string): BlockedCall[] {
    return [...(this.blocked.get(sessionID)?.values() ?? [])];
  }

  hasBlocked(sessionID: string): boolean {
    return (this.blocked.get(sessionID)?.size ?? 0) > 0;
  }

  blockedCount(sessionID: string): number {
    return this.blocked.get(sessionID)?.size ?? 0;
  }

  /** Resolve one held executor with host result text. Returns false when unknown. */
  resolve(sessionID: string, engineId: string, text: string): boolean {
    const table = this.blocked.get(sessionID);
    const held = table?.get(engineId);
    if (!held) {
      return false;
    }
    table!.delete(engineId);
    this.emitted.get(sessionID)?.delete(engineId);
    logLine(`Tool result to engine: ${held.originalName} (${text.length} chars).`);
    held.respond({ text, aborted: false });
    return true;
  }

  /** Abort every held executor for a session (cancel / supersede / dispose). */
  abortAll(sessionID: string, reason: string): void {
    const table = this.blocked.get(sessionID);
    this.emitted.delete(sessionID);
    if (!table || table.size === 0) {
      return;
    }
    logLine(`Aborting ${String(table.size)} blocked tool call(s) on ${sessionID} (${reason}).`);
    for (const held of table.values()) {
      held.respond({ text: `Tool ${held.originalName} aborted (${reason}).`, aborted: true });
    }
    table.clear();
    this.notify(sessionID);
  }

  /** Record callIds emitted as ToolCallParts (re-emission spins the host). */
  markEmitted(sessionID: string, engineIds: readonly string[]): void {
    let set = this.emitted.get(sessionID);
    if (!set) {
      set = new Set();
      this.emitted.set(sessionID, set);
    }
    for (const id of engineIds) {
      set.add(id);
    }
  }

  /**
   * Blocked calls never yet emitted (genuinely new work for the host).
   * Re-emitting an already-emitted callId spins the host (it dedupes
   * repeats, so no result ever returns) — callers must route that case to
   * abort + fresh turn instead.
   */
  unemittedBlocked(sessionID: string): BlockedCall[] {
    const sent = this.emitted.get(sessionID);
    return this.blockedFor(sessionID).filter((call) => !sent?.has(call.engineId));
  }

  /**
   * Await newly blocked calls for a session (streaming race). The waiter
   * resolves on the next registration; `cancel` drops a stale waiter so
   * finished turns never leak entries.
   */
  waitForCalls(sessionID: string): { promise: Promise<BlockedCall[]>; cancel: () => void } {
    const waiter: { sessionID: string; resolve: (calls: BlockedCall[]) => void } = {
      sessionID,
      resolve: () => undefined,
    };
    const promise = new Promise<BlockedCall[]>((resolve) => {
      waiter.resolve = resolve;
    });
    this.waiters.add(waiter);
    return {
      promise,
      cancel: () => {
        this.waiters.delete(waiter);
      },
    };
  }

  private notify(sessionID: string): void {
    const calls = this.blockedFor(sessionID);
    for (const waiter of [...this.waiters]) {
      if (waiter.sessionID === sessionID) {
        this.waiters.delete(waiter);
        waiter.resolve(calls);
      }
    }
  }

  // -- HTTP ----------------------------------------------------------------

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/oct/pending-tools" || url.pathname === "/oct/execute") {
      if (req.headers["x-oct-token"] !== this.token || !this.token) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/oct/pending-tools") {
      const sessionID = url.searchParams.get("sessionID") ?? "";
      this.pluginContact = true;
      const tools: PendingTool[] = (this.pending.get(sessionID) ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        input: t.input,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tools }));
      return;
    }
    if (req.method === "DELETE" && url.pathname === "/oct/pending-tools") {
      const sessionID = url.searchParams.get("sessionID") ?? "";
      this.pending.delete(sessionID);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/oct/execute") {
      await this.handleExecute(req, res);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false }));
  }

  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          reject(new Error("Callback body exceeds 1 MB."));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      req.on("error", reject);
    });
  }

  private async handleExecute(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = (await this.readBody(req)) as Record<string, unknown>;
    const sessionID = typeof body["sessionID"] === "string" ? (body["sessionID"] as string) : "";
    const engineId = typeof body["id"] === "string" ? (body["id"] as string) : "";
    const sanitized = typeof body["tool"] === "string" ? (body["tool"] as string) : "";
    if (!sessionID || !engineId || !sanitized) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    this.pluginContact = true;
    const originalName = this.originalName(sessionID, sanitized);
    const input = body["input"] ?? {};
    const repeatKey = `${sanitized} ${JSON.stringify(input)}`;
    const previous = this.repeat.get(sessionID);
    const consecutive = previous && previous.key === repeatKey ? previous.count + 1 : 1;
    this.repeat.set(sessionID, { key: repeatKey, count: consecutive });
    if (consecutive >= REPEAT_BREAKER_N) {
      // Model retry loop (e.g. image tools whose results degrade to text):
      // answer directly so the engine moves on instead of blocking forever.
      logLine(`Tool call ${originalName} repeated ${String(consecutive)}x consecutively; short-circuiting.`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          aborted: false,
          text:
            `OCT: '${originalName}' was already called ${String(consecutive)} times in a row with identical input ` +
            `and the result did not change. Do not call it again with the same input — proceed with what you have.`,
        }),
      );
      return;
    }
    let table = this.blocked.get(sessionID);
    if (!table) {
      table = new Map();
      this.blocked.set(sessionID, table);
    }
    if (table.has(engineId)) {
      // Duplicate delivery for a known call: acknowledge without double-blocking.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, text: "", aborted: true }));
      return;
    }
    const inputSize = JSON.stringify(input).length;
    logLine(`Tool call from engine: ${originalName} on ${sessionID} (input ${String(inputSize)} bytes).`);
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        table!.delete(engineId);
        logLine(`Tool call ${originalName} hit the 10-minute safety timeout; aborting.`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, text: `Tool ${originalName} aborted (bridge timeout).`, aborted: true }));
      }
    }, HELD_RESPONSE_SAFETY_MS);
    const call: BlockedCall & HeldResponder = {
      engineId,
      sanitized,
      originalName,
      input,
      sessionID,
      messageID: typeof body["messageID"] === "string" ? (body["messageID"] as string) : "",
      receivedAt: Date.now(),
      respond: (reply) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        try {
          if (!res.writableEnded) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, text: reply.text, aborted: reply.aborted }));
          }
        } catch (error) {
          logLine(`Tool reply to ${originalName} failed (executor gone): ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    };
    table.set(engineId, call);
    req.on("close", () => {
      // Executor went away (interrupt / restart) before we replied.
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        table!.delete(engineId);
      }
    });
    this.notify(sessionID);
    // The response stays open until resolve/abort/timeout above.
  }
}
