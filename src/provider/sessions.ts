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

export const DEFAULT_SESSION_TITLE = "OCT Copilot chat";
export const MAX_SESSION_TITLE_LENGTH = 60;

/** `MM-DD HH:mm` stamp (local time) for fallback titles. */
function formatTitleStamp(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Unique fallback title for turns with no usable prompt text
 * (empty / attachment-only): `OCT: 4506f33d 10-02 10:42`.
 * The 8-char suffix comes from the conversation key (`conv:<uuid>` /
 * `hash:<hex>`), so it is distinct per conversation; the stamp is the
 * session-create time (≈ first user prompt time, set once at create).
 */
export function fallbackSessionTitle(key: string, now: Date = new Date()): string {
  const rest = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
  const short = (rest || "unknown").slice(0, 8);
  return `OCT: ${short} ${formatTitleStamp(now)}`;
}

/**
 * Derive an engine session title from free text: collapse whitespace,
 * trim, cap at ~60 chars. Empty/whitespace-only input falls back to the
 * default so the engine never receives an empty title.
 */
export function deriveSessionTitle(firstText: string | undefined | null): string {
  if (typeof firstText !== "string" || !firstText) {
    return DEFAULT_SESSION_TITLE;
  }
  const collapsed = firstText.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return DEFAULT_SESSION_TITLE;
  }
  return collapsed.slice(0, MAX_SESSION_TITLE_LENGTH).trim() || DEFAULT_SESSION_TITLE;
}

/**
 * Title seed for a new engine session: the human's actual request text.
 *
 * Copilot agent chats do NOT put the query in the first user message. The
 * first user message is the static global context (`<environment_info>` +
 * `<workspace_info>` + memory blocks), while the query arrives in a later
 * user message wrapped as `<userRequest>…</userRequest>` alongside per-turn
 * `<context>` / `<reminderInstructions>` blocks (see `agentPrompt.tsx`:
 * `GlobalAgentContext` vs `AgentUserMessage`, default
 * `userQueryTagName = 'userRequest'`). Naive `messageText(firstUser)` hence
 * titles every session after the OS string. Scan user messages newest-first
 * and unwrap the query (EDH 2026-10-02: all titles were
 * `"<environment_info> The user's current OS is: Windows </envir"`).
 * Returns "" when no usable prompt exists so the caller can apply the
 * key-aware `fallbackSessionTitle` (unique per conversation) instead of a
 * flat default.
 */
export function sessionTitleFromMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== vscode.LanguageModelChatMessageRole.User) {
      continue;
    }
    const prompt = extractUserPromptText(messageText(message));
    if (!prompt || /^(\[(Attachment omitted|Tool (call|result)))/.test(prompt.trim())) {
      continue;
    }
    return deriveSessionTitle(prompt);
  }
  return "";
}

/**
 * Unwrap the human request from a Copilot-assembled user message. Prefers
 * `<userRequest>` (plus `user_query` / `userquery` spellings); otherwise
 * strips the known Copilot context wrapper blocks and returns the remainder.
 * Attachment blocks (`<attachments>` / `<attachment …>`, EDH 2026-10-02:
 * attachment-only title leaked `filePath="c:\Us…"` into the session title)
 * are stripped from both paths: text + attachment keeps the text,
 * attachment-only yields "" so the caller falls back to the default title.
 */
export function extractUserPromptText(raw: string): string {
  if (typeof raw !== "string" || !raw) {
    return "";
  }
  for (const tag of ["userRequest", "user_query", "userquery"]) {
    const match = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (match?.[1]?.trim()) {
      return stripAttachmentBlocks(match[1]).trim();
    }
  }
  return stripAttachmentBlocks(
    raw
      .replace(/<environment_info>[\s\S]*?<\/environment_info>/gi, " ")
      .replace(/<workspace_info>[\s\S]*?<\/workspace_info>/gi, " ")
      .replace(/<userMemory>[\s\S]*?<\/userMemory>/gi, " ")
      .replace(/<sessionMemory>[\s\S]*?<\/sessionMemory>/gi, " ")
      .replace(/<repoMemory>[\s\S]*?<\/repoMemory>/gi, " ")
      .replace(/<context>[\s\S]*?<\/context>/gi, " ")
      .replace(/<reminderInstructions>[\s\S]*?<\/reminderInstructions>/gi, " "),
  ).trim();
}

/** Remove Copilot file-attachment blocks (paths/ids are title noise). */
function stripAttachmentBlocks(text: string): string {
  return text
    .replace(/<attachments>[\s\S]*?<\/attachments>/gi, " ")
    .replace(/<attachment\b[^>]*>[\s\S]*?<\/attachment>/gi, " ")
    .replace(/<attachment\b[^>]*\/>/gi, " ");
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

  /**
   * Drop one conversation mapping so the next turn creates a fresh session.
   * Used when the mapped session is poisoned: some engine failures (e.g.
   * `Instruction initialization blocked`) are recorded against session state
   * that can never succeed on retry, so reusing the id would fail forever.
   */
  forget(key: string): void {
    if (this.entries.delete(key)) {
      this.unverified.delete(key);
      this.persist();
      logLine(`Conversation ${key} mapping dropped; the next turn will create a fresh session.`);
    }
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
   * Drop every mapping whose session id is in `deadIds` (operator-initiated
   * prune during the status pass). Returns the pruned conversation keys.
   * Non-dead entries are untouched; persistence follows only when changed.
   */
  pruneBySessionIds(deadIds: Set<string>): string[] {
    const pruned: string[] = [];
    for (const [key, entry] of [...this.entries.entries()]) {
      if (deadIds.has(entry.sessionId)) {
        this.entries.delete(key);
        this.unverified.delete(key);
        pruned.push(key);
        logLine(`Session ${entry.sessionId} for ${key} no longer exists; pruned from the map.`);
      }
    }
    if (pruned.length > 0) {
      this.persist();
    }
    return pruned;
  }

  /** Snapshot of the conversation→session map for status/diagnostics. */
  snapshot(): Array<{ key: string; sessionId: string; modelKey: string }> {
    return [...this.entries.entries()].map(([key, entry]) => ({
      key,
      sessionId: entry.sessionId,
      modelKey: entry.modelKey,
    }));
  }

  /**
   * Get the mapped session or create one. Restored entries are verified with
   * `GET /api/session/:id` on first use: a 404 remaps the conversation to a
   * fresh session instead of failing the turn. When the mapped session was
   * created under a different picker model, pin it via `switchModel` so
   * subsequent turns use the requested model. `titleSeed` is the raw first
   * user text used only at create time (no retitle-on-drift).
   */
  getOrCreate(
    key: string,
    deps: SessionDeps,
    model: { id: string; providerID: string; pickerId: string },
    token?: vscode.CancellationToken,
    titleSeed?: string,
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
    const resolved = this.resolveSlow(key, deps, model, token, titleSeed).finally(() => {
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
    titleSeed?: string,
  ): Promise<string> {
    const existing = this.entries.get(key);
    if (existing) {
      this.touch(key, existing);
      if (this.unverified.has(key)) {
        const alive = await this.verify(key, existing, deps);
        if (!alive) {
          return this.create(key, deps, model, token, titleSeed);
        }
      }
      if (existing.modelKey !== model.pickerId) {
        return this.ensureModel(key, existing, deps, model);
      }
      return existing.sessionId;
    }
    return this.create(key, deps, model, token, titleSeed);
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
    titleSeed?: string,
  ): Promise<string> {
    if (token?.isCancellationRequested) {
      throw new Error("OCT: request cancelled before session create.");
    }
    const seed = titleSeed?.trim() ? deriveSessionTitle(titleSeed) : fallbackSessionTitle(key);
    const info: SessionInfo = await createSession(deps.baseUrl, deps.password, {
      title: seed,
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
