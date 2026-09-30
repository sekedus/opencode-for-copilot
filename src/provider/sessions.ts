import { createHash } from "node:crypto";
import * as vscode from "vscode";
import { createSession, getSession, OctHttpError, switchSessionModel, type SessionInfo } from "../server/client";
import { logLine } from "../output";
import { messageText } from "./messages";

/**
 * Conversation-key → opencode session-id map (1:1 reuse), persisted across
 * window reloads via `vscode.Memento` (globalState).
 *
 * - Key: Copilot's per-chat `modelOptions._conversationId` when present
 *   (stable across turns, distinct across chats), else an explicit id from
 *   provider options when supplied, else a hash of
 *   (workspace + model + first message).
 * - LRU cap 50: evicting a key only forgets the mapping — sessions are never
 *   deleted on the hot path (background reaper only, out of MVP scope).
 * - One in-flight `getOrCreate` per key: concurrent turns share the promise.
 * - Persistence: entries are saved to globalState on every mutation and
 *   reloaded on construction. A restored entry is verified with
 *   `GET /api/session/:id` on first use — a 404 (server DB wiped, session
 *   deleted) remaps the conversation to a fresh session instead of failing
 *   the turn. `clear()` only drops in-memory state so reloads keep reuse.
 */

const MAX_ENTRIES = 50;
const STORAGE_KEY = "oct.conversationSessions.v1";

export interface SessionDeps {
  baseUrl: string;
  password: string;
  directory: string;
}

interface Entry {
  sessionId: string;
  modelKey: string;
}

function hashKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000"), "utf8").digest("hex").slice(0, 32);
}

/**
 * Derive the conversation key. Prefers a stable per-chat id from
 * `options.modelOptions` / `options` when present; falls back to a hash of
 * (workspace directory + model id + first user message).
 *
 * The public provider API exposes no conversation id, but Copilot Chat routes
 * extension-contributed models through `ExtensionContributedChatEndpoint`,
 * which forwards its per-chat-session id as `modelOptions._conversationId`
 * (stable across turns of one chat, distinct across chats). That entry must
 * stay first: without it, two chats opening with the same first message hash
 * to the same fallback key and share one opencode session.
 */
export function conversationKey(
  options: { modelOptions?: Record<string, unknown> } & Record<string, unknown>,
  modelId: string,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  directory: string,
): string {
  const candidates: unknown[] = [
    (options.modelOptions as Record<string, unknown> | undefined)?.["_conversationId"],
    (options.modelOptions as Record<string, unknown> | undefined)?.["conversationId"],
    (options.modelOptions as Record<string, unknown> | undefined)?.["conversationID"],
    (options.modelOptions as Record<string, unknown> | undefined)?.["sessionId"],
    options["conversationId"],
    options["conversationID"],
    options["sessionId"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return `conv:${candidate.trim()}`;
    }
  }
  const firstUser = messages.find((m) => m.role === vscode.LanguageModelChatMessageRole.User);
  const firstText = firstUser ? messageText(firstUser).slice(0, 500) : "";
  return `hash:${hashKey([directory, modelId, firstText])}`;
}

export class OctSessionMap {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<string>>();
  /** Keys restored from storage whose session existence is not yet verified. */
  private readonly unverified = new Set<string>();

  constructor(private readonly store?: vscode.Memento) {
    this.restore();
  }

  size(): number {
    return this.entries.size;
  }

  peek(key: string): string | undefined {
    return this.entries.get(key)?.sessionId;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.unverified.clear();
    // Intentionally in-memory only: persisted entries survive reloads so the
    // next window reuses the same opencode sessions. Provider dispose (which
    // calls clear) must not wipe reuse across a reload.
  }

  /** Load persisted entries; every restored key needs a server check on first use. */
  private restore(): void {
    if (!this.store) {
      return;
    }
    try {
      const raw: unknown = this.store.get(STORAGE_KEY);
      if (!Array.isArray(raw)) {
        return;
      }
      let restored = 0;
      for (const item of raw) {
        if (!Array.isArray(item) || item.length !== 2) {
          continue;
        }
        const [key, value] = item as [unknown, unknown];
        if (typeof key !== "string" || !key) {
          continue;
        }
        if (typeof value !== "object" || value === null) {
          continue;
        }
        const record = value as Record<string, unknown>;
        const sessionId = record["sessionId"];
        const modelKey = record["modelKey"];
        if (typeof sessionId !== "string" || !sessionId || typeof modelKey !== "string" || !modelKey) {
          continue;
        }
        if (this.entries.size >= MAX_ENTRIES) {
          break;
        }
        this.entries.set(key, { sessionId, modelKey });
        this.unverified.add(key);
        restored++;
      }
      if (restored > 0) {
        logLine(`Restored ${restored} conversation session mapping(s) from storage.`);
      }
    } catch (error) {
      logLine(`Session map restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Best-effort persist of the current map (fire-and-forget). */
  private persist(): void {
    if (!this.store) {
      return;
    }
    try {
      const snapshot: Array<[string, Entry]> = [...this.entries.entries()];
      void Promise.resolve(this.store.update(STORAGE_KEY, snapshot)).catch((error: unknown) => {
        logLine(`Session map persist failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      logLine(`Session map persist failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private touch(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  /**
   * Get the mapped session or create one. Restored entries are verified with
   * `GET /api/session/:id` on first use: a 404 remaps the conversation to a
   * fresh session instead of failing the turn. When the mapped session was
   * created under a different picker model, pin it via `switchModel` so
   * subsequent turns use the requested model.
   */
  getOrCreate(
    key: string,
    deps: SessionDeps,
    model: { id: string; providerID: string; pickerId: string },
    token?: vscode.CancellationToken,
  ): Promise<string> {
    const existing = this.entries.get(key);
    if (existing && !this.unverified.has(key)) {
      // Fast path: verified this window, no I/O.
      this.touch(key, existing);
      if (existing.modelKey !== model.pickerId) {
        return this.ensureModel(key, existing, deps, model);
      }
      return Promise.resolve(existing.sessionId);
    }
    const running = this.inflight.get(key);
    if (running) {
      return running;
    }
    const resolved = this.resolveSlow(key, deps, model, token).finally(() => {
      if (this.inflight.get(key) === resolved) {
        this.inflight.delete(key);
      }
    });
    this.inflight.set(key, resolved);
    return resolved;
  }

  private async resolveSlow(
    key: string,
    deps: SessionDeps,
    model: { id: string; providerID: string; pickerId: string },
    token?: vscode.CancellationToken,
  ): Promise<string> {
    const existing = this.entries.get(key);
    if (existing) {
      this.touch(key, existing);
      if (this.unverified.has(key)) {
        const alive = await this.verify(key, existing, deps);
        if (!alive) {
          return this.create(key, deps, model, token);
        }
      }
      if (existing.modelKey !== model.pickerId) {
        return this.ensureModel(key, existing, deps, model);
      }
      return existing.sessionId;
    }
    return this.create(key, deps, model, token);
  }

  /**
   * Check a restored session still exists on the server. Returns true when
   * the turn may proceed on the mapped session; false when the entry was
   * dropped (404) and the caller must create a fresh session.
   */
  private async verify(key: string, entry: Entry, deps: SessionDeps): Promise<boolean> {
    try {
      await getSession(deps.baseUrl, deps.password, entry.sessionId);
      this.unverified.delete(key);
      return true;
    } catch (error) {
      if (error instanceof OctHttpError && error.status === 404) {
        this.entries.delete(key);
        this.unverified.delete(key);
        this.persist();
        logLine(`Session ${entry.sessionId} for ${key} no longer exists (404); remapping conversation.`);
        return false;
      }
      // Non-404 (server unreachable, auth, timeout): keep the mapping and let
      // the turn surface the real error instead of forking a duplicate session.
      this.unverified.delete(key);
      logLine(`Session verify failed for ${entry.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  }

  private async ensureModel(
    key: string,
    entry: Entry,
    deps: SessionDeps,
    model: { id: string; providerID: string; pickerId: string },
  ): Promise<string> {
    try {
      await switchSessionModel(deps.baseUrl, deps.password, entry.sessionId, {
        id: model.id,
        providerID: model.providerID,
      });
      entry.modelKey = model.pickerId;
      this.persist();
      logLine(`Session ${entry.sessionId} switched to ${model.pickerId}.`);
    } catch (error) {
      // Non-fatal: the turn still runs on the session's current model.
      logLine(`Model switch failed for ${entry.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return entry.sessionId;
  }

  private async create(
    key: string,
    deps: SessionDeps,
    model: { id: string; providerID: string; pickerId: string },
    token?: vscode.CancellationToken,
  ): Promise<string> {
    if (token?.isCancellationRequested) {
      throw new Error("OCT: request cancelled before session create.");
    }
    const info: SessionInfo = await createSession(deps.baseUrl, deps.password, {
      title: "OCT Copilot chat",
      directory: deps.directory || undefined,
      model: { id: model.id, providerID: model.providerID },
    });
    const entry: Entry = { sessionId: info.id, modelKey: model.pickerId };
    this.entries.set(key, entry);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this.entries.delete(oldest);
      this.unverified.delete(oldest);
      logLine(`Session map evicted oldest conversation (cap ${MAX_ENTRIES}).`);
    }
    this.persist();
    logLine(`Conversation ${key} mapped to session ${info.id} (${model.pickerId}).`);
    return info.id;
  }
}
