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
 * - LRU cap (`oct.maxSessions`, default 200): evicting a key only forgets
 *   the mapping — sessions are never deleted on the hot path (dead entries
 *   are pruned via the status command). When the cap is hit at create time,
 *   entries already known dead (conversation flagged by a prior 404 via
 *   `markDead`) go first without a server round trip — they are
 *   gone-confirmed, so nothing joins the graveyard — then oldest-live as
 *   before (T-0017). Dropped-but-possibly-live session
 *   ids are remembered in the orphan graveyard (T-0016) for the explicit
 *   opt-in cleanup command; nothing is ever deleted automatically.
 * - One in-flight `getOrCreate` per key: concurrent turns share the promise.
 * - Persistence: entries are saved to globalState on every mutation and
 *   reloaded on construction. A restored entry is verified with
 *   `GET /api/session/:id` on first use — a 404 (server DB wiped, session
 *   deleted) remaps the conversation to a fresh session instead of failing
 *   the turn. `clear()` only drops in-memory state so reloads keep reuse.
 */

/** Default map cap; `oct.maxSessions` overrides it per `OctSessionMap` instance. */
export const DEFAULT_MAX_SESSIONS = 200;
const STORAGE_KEY = "oct.conversationSessions.v1";
/** Persisted set of conversation keys whose engine session was deleted
 *  mid-chat (T-0013 follow-up): later turns repeat the notice instead of
 *  silently opening an amnesiac session. */
const DEAD_KEY = "oct.deadConversations.v1";
/** Persisted graveyard of possibly-live engine session ids whose mapping
 *  was dropped (T-0016): the allowlist for the explicit opt-in cleanup
 *  command. Only ids that were never confirmed gone belong here. */
const GRAVEYARD_KEY = "oct.orphanedSessions.v1";
/** Graveyard bound: dropping a mapping must never grow storage without limit. */
export const MAX_ORPHANED_SESSIONS = 200;

/**
 * Pure graveyard append (T-0016): oldest-first, capped, duplicate-free.
 * Empty ids are ignored. Exported for unit tests; the map owns persistence.
 */
export function trackOrphaned(
  current: readonly string[],
  sessionId: string,
  cap: number = MAX_ORPHANED_SESSIONS,
): string[] {
  if (!sessionId) {
    return [...current];
  }
  if (current.includes(sessionId)) {
    return [...current];
  }
  const next = [...current, sessionId];
  while (next.length > cap) {
    next.shift();
  }
  return next;
}

/**
 * True when a server error means the session is gone (HTTP 404), as opposed
 * to an uncertain failure (network/auth/timeout) that must never trigger a
 * prune. Shared by the startup/status sweep (T-0012) and the mid-turn
 * recovery message (T-0013).
 */
export function isSessionGoneError(error: unknown): boolean {
  return error instanceof OctHttpError && error.status === 404;
}

/**
 * Single user-facing sentence for a mid-conversation deleted session
 * (T-0013): the mapping is dropped and the user starts a new Copilot chat.
 * No silent recreate, no history replay, no error dump.
 */
export const DELETED_SESSION_MESSAGE =
  "OCT: the opencode session for this chat was deleted — start a new Copilot chat.";

export interface SessionDeps {
  baseUrl: string;
  password: string;
  directory: string;
}

interface Entry {
  sessionId: string;
  modelKey: string;
  /** Workspace directory at create time (T-0017, optional for v1 compat). */
  directory?: string;
}

/**
 * Eviction choice for a full map (T-0017, pure): oldest dead-flagged key
 * first (known gone via a prior 404 — no server round trip, no graveyard),
 * else oldest-live. `keysInOrder` is oldest-first (Map insertion order).
 * Returns undefined when empty. Exported for unit tests; `create` owns I/O.
 */
export function chooseEvictionKey(
  keysInOrder: Iterable<string>,
  dead: ReadonlySet<string>,
): string | undefined {
  let oldest: string | undefined;
  for (const key of keysInOrder) {
    if (oldest === undefined) {
      oldest = key;
    }
    if (dead.has(key)) {
      return key;
    }
  }
  return oldest;
}

/** Group label for map entries without a stored workspace directory. */
export const UNKNOWN_DIRECTORY_GROUP = "unknown";

/**
 * Group map snapshots by workspace directory (T-0017, pure): entries keep
 * their relative order within a group; groups sort by directory with
 * "unknown" last. Exported for unit tests; the status command owns display.
 */
export function groupSnapshotsByDirectory<
  T extends { key: string; sessionId: string; modelKey: string; directory?: string },
>(entries: readonly T[]): Array<{ directory: string; entries: T[] }> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const dir = entry.directory && entry.directory.trim() ? entry.directory : UNKNOWN_DIRECTORY_GROUP;
    const list = groups.get(dir);
    if (list) {
      list.push(entry);
    } else {
      groups.set(dir, [entry]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === UNKNOWN_DIRECTORY_GROUP) {
        return 1;
      }
      if (b === UNKNOWN_DIRECTORY_GROUP) {
        return -1;
      }
      return a.localeCompare(b);
    })
    .map(([directory, groupEntries]) => ({ directory, entries: groupEntries }));
}

/**
 * Extract the engine session creation millis from a `listSessions` item
 * (T-0017). Live shape (opencode v2.0.21, verified 2026-10-05):
 * `time: { created: <millis>, updated: <millis>, idle?: <millis> }`.
 * Tolerates ISO-string dates; anything else yields undefined (age unknown).
 */
export function sessionCreatedMs(info: unknown): number | undefined {
  if (typeof info !== "object" || info === null) {
    return undefined;
  }
  const time = (info as Record<string, unknown>)["time"];
  if (typeof time !== "object" || time === null) {
    return undefined;
  }
  const created = (time as Record<string, unknown>)["created"];
  if (typeof created === "number" && Number.isFinite(created) && created > 0) {
    return Math.floor(created);
  }
  if (typeof created === "string" && created.trim()) {
    const parsed = Date.parse(created);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * Human age from engine creation millis (T-0017, pure): `45s` / `12m` /
 * `5h` / `3d` / `2w` / `4mo` / `1y`. Returns undefined when the timestamp
 * is missing or in the future (caller prints "age unknown").
 */
export function formatSessionAge(createdMs: unknown, nowMs: number = Date.now()): string | undefined {
  if (typeof createdMs !== "number" || !Number.isFinite(createdMs) || createdMs <= 0) {
    return undefined;
  }
  const diffMs = nowMs - createdMs;
  if (diffMs < 0) {
    return undefined;
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 14) {
    return `${days}d`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 9) {
    return `${weeks}w`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo`;
  }
  return `${Math.floor(days / 365)}y`;
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
  /** Configured conversation→session cap (LRU). */
  private readonly maxEntries: number;
  /** Keys restored from storage whose session existence is not yet verified. */
  private readonly unverified = new Set<string>();
  /** Conversations whose engine session was deleted mid-chat (persisted). */
  private readonly dead = new Set<string>();
  /** Possibly-live engine session ids whose mapping was dropped (persisted,
   *  oldest-first, capped). Allowlist for the explicit cleanup command. */
  private readonly orphaned: string[] = [];

  constructor(private readonly store?: vscode.Memento, maxEntries: number = DEFAULT_MAX_SESSIONS) {
    this.maxEntries =
      typeof maxEntries === "number" && Number.isFinite(maxEntries) && maxEntries >= 1
        ? Math.floor(maxEntries)
        : DEFAULT_MAX_SESSIONS;
    this.restore();
    this.restoreDead();
    this.restoreOrphaned();
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
   * The dropped session may still be alive server-side, so its id joins the
   * orphan graveyard — unless the caller already knows it is gone (404),
   * e.g. the T-0013 mid-turn recovery path (`{ gone: true }`).
   */
  forget(key: string, opts?: { gone?: boolean }): void {
    const sessionId = this.entries.get(key)?.sessionId;
    if (this.entries.delete(key)) {
      this.unverified.delete(key);
      if (sessionId && !opts?.gone) {
        this.bury(sessionId);
      }
      this.persist();
      logLine(`Conversation ${key} mapping dropped; the next turn will create a fresh session.`);
    }
  }

  /**
   * Mark a conversation permanently dead: its engine session was deleted
   * mid-chat, so later turns must repeat the start-a-new-chat notice instead
   * of silently opening an amnesiac session (T-0013 follow-up). Persisted
   * across reloads; bounded by the map cap. `forget` does not un-dead.
   */
  markDead(key: string): void {
    if (!key || this.dead.has(key)) {
      return;
    }
    this.dead.add(key);
    while (this.dead.size > this.maxEntries) {
      const oldest = this.dead.values().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this.dead.delete(oldest);
    }
    this.persistDead();
    logLine(`Conversation ${key} marked dead (engine session deleted); later turns will repeat the start-a-new-chat notice.`);
  }

  /** True when the conversation's engine session was deleted mid-chat. */
  isDead(key: string): boolean {
    return this.dead.has(key);
  }

  /** Snapshot of the orphan graveyard (oldest-first) for the cleanup command. */
  orphanedSessions(): string[] {
    return [...this.orphaned];
  }

  /**
   * Drop graveyard ids after the cleanup command resolved them (deleted or
   * already gone). Ids still present server-side stay listed on failure.
   */
  clearOrphaned(sessionIds: readonly string[]): void {
    if (sessionIds.length === 0) {
      return;
    }
    const drop = new Set(sessionIds);
    const before = this.orphaned.length;
    for (let i = this.orphaned.length - 1; i >= 0; i--) {
      if (drop.has(this.orphaned[i])) {
        this.orphaned.splice(i, 1);
      }
    }
    if (this.orphaned.length !== before) {
      this.persistOrphaned();
    }
  }

  /** Remember a possibly-live dropped session id (bounded, persisted). */
  private bury(sessionId: string): void {
    if (!sessionId || this.orphaned.includes(sessionId)) {
      return;
    }
    const next = trackOrphaned(this.orphaned, sessionId);
    this.orphaned.length = 0;
    this.orphaned.push(...next);
    this.persistOrphaned();
    logLine(`Session ${sessionId} orphaned (mapping dropped); listed for opt-in cleanup.`);
  }

  /** Load persisted dead-conversation keys (tolerates missing/garbage). */
  private restoreDead(): void {
    if (!this.store) {
      return;
    }
    try {
      const raw: unknown = this.store.get(DEAD_KEY);
      if (!Array.isArray(raw)) {
        return;
      }
      for (const item of raw) {
        if (typeof item === "string" && item && this.dead.size < this.maxEntries) {
          this.dead.add(item);
        }
      }
    } catch (error) {
      logLine(`Dead-conversation restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Best-effort persist of the dead-conversation keys (fire-and-forget). */
  private persistDead(): void {
    if (!this.store) {
      return;
    }
    try {
      void Promise.resolve(this.store.update(DEAD_KEY, [...this.dead])).catch((error: unknown) => {
        logLine(`Dead-conversation persist failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      logLine(`Dead-conversation persist failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Load persisted graveyard ids (tolerates missing/garbage; capped). */
  private restoreOrphaned(): void {
    if (!this.store) {
      return;
    }
    try {
      const raw: unknown = this.store.get(GRAVEYARD_KEY);
      if (!Array.isArray(raw)) {
        return;
      }
      for (const item of raw) {
        if (typeof item === "string" && item) {
          const next = trackOrphaned(this.orphaned, item);
          this.orphaned.length = 0;
          this.orphaned.push(...next);
        }
      }
    } catch (error) {
      logLine(`Orphan-graveyard restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Best-effort persist of the graveyard ids (fire-and-forget). */
  private persistOrphaned(): void {
    if (!this.store) {
      return;
    }
    try {
      void Promise.resolve(this.store.update(GRAVEYARD_KEY, [...this.orphaned])).catch((error: unknown) => {
        logLine(`Orphan-graveyard persist failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      logLine(`Orphan-graveyard persist failed: ${error instanceof Error ? error.message : String(error)}`);
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
        // T-0017: `directory` is optional — v1 rows without it restore fine
        // (group "unknown"). Non-string values are dropped, never crash.
        const rawDir = record["directory"];
        const directory = typeof rawDir === "string" && rawDir.trim() ? rawDir : undefined;
        if (this.entries.size >= this.maxEntries) {
          break;
        }
        this.entries.set(key, directory === undefined ? { sessionId, modelKey } : { sessionId, modelKey, directory });
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
   * No graveyard entries: callers pass only ids already confirmed gone
   * (404), so there is nothing alive to clean up later.
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
  snapshot(): Array<{ key: string; sessionId: string; modelKey: string; directory?: string }> {
    return [...this.entries.entries()].map(([key, entry]) => ({
      key,
      sessionId: entry.sessionId,
      modelKey: entry.modelKey,
      ...(entry.directory === undefined ? {} : { directory: entry.directory }),
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
        return this.ensureModel(existing, deps, model);
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
        return this.ensureModel(existing, deps, model);
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
    const dir = deps.directory && deps.directory.trim() ? deps.directory : undefined;
    const entry: Entry = dir === undefined ? { sessionId: info.id, modelKey: model.pickerId } : { sessionId: info.id, modelKey: model.pickerId, directory: dir };
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const victim = chooseEvictionKey(this.entries.keys(), this.dead);
      if (!victim) {
        break;
      }
      if (this.dead.has(victim)) {
        // Known gone (prior 404): drop without a graveyard entry — there is
        // nothing alive to clean up later.
        this.entries.delete(victim);
        this.unverified.delete(victim);
        logLine(`Session map evicted dead conversation (cap ${this.maxEntries}).`);
        continue;
      }
      const evictedId = this.entries.get(victim)?.sessionId;
      this.entries.delete(victim);
      this.unverified.delete(victim);
      if (evictedId) {
        this.bury(evictedId);
      }
      logLine(`Session map evicted oldest conversation (cap ${this.maxEntries}).`);
    }
    this.persist();
    logLine(`Conversation ${key} mapped to session ${info.id} (${model.pickerId}).`);
    return info.id;
  }
}
