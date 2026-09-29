import { createHash } from "node:crypto";
import * as vscode from "vscode";
import { createSession, switchSessionModel, type SessionInfo } from "../server/client";
import { logLine } from "../output";
import { messageText } from "./messages";

/**
 * In-memory conversation-key → opencode session-id map (1:1 reuse).
 *
 * - Key: stable conversation id from provider options when VS Code supplies
 *   one, else a hash of (workspace + model + first message).
 * - LRU cap 50: evicting a key only forgets the mapping — sessions are never
 *   deleted on the hot path (background reaper only, out of MVP scope).
 * - One in-flight `getOrCreate` per key: concurrent turns share the promise.
 */

const MAX_ENTRIES = 50;

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
 * Derive the conversation key. Prefers an explicit conversation id from
 * `options.modelOptions` / `options` when present; falls back to a hash of
 * (workspace directory + model id + first user message).
 */
export function conversationKey(
  options: { modelOptions?: Record<string, unknown> } & Record<string, unknown>,
  modelId: string,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  directory: string,
): string {
  const candidates: unknown[] = [
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

  size(): number {
    return this.entries.size;
  }

  peek(key: string): string | undefined {
    return this.entries.get(key)?.sessionId;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  /**
   * Get the mapped session or create one. When the mapped session was created
   * under a different picker model, pin it via `switchModel` so subsequent
   * turns use the requested model.
   */
  getOrCreate(
    key: string,
    deps: SessionDeps,
    model: { id: string; providerID: string; pickerId: string },
    token?: vscode.CancellationToken,
  ): Promise<string> {
    const existing = this.entries.get(key);
    if (existing) {
      // LRU touch.
      this.entries.delete(key);
      this.entries.set(key, existing);
      if (existing.modelKey !== model.pickerId) {
        return this.ensureModel(key, existing, deps, model);
      }
      return Promise.resolve(existing.sessionId);
    }
    const running = this.inflight.get(key);
    if (running) {
      return running;
    }
    const created = this.create(key, deps, model, token).finally(() => {
      if (this.inflight.get(key) === created) {
        this.inflight.delete(key);
      }
    });
    this.inflight.set(key, created);
    return created;
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
      logLine(`Session map evicted oldest conversation (cap ${MAX_ENTRIES}).`);
    }
    logLine(`Conversation mapped to session ${info.id} (${model.pickerId}).`);
    return info.id;
  }
}
