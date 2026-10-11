/** Minimal REST client for the local opencode v2 server (`/api/*`). */

export class OctHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`opencode request failed: ${path} -> HTTP ${status}`);
  }
}

function authHeader(password: string): Record<string, string> {
  if (!password) {
    return {};
  }
  // Opencode v2 accepts only the `opencode` username.
  return { Authorization: `Basic ${Buffer.from(`opencode:${password}`, "utf8").toString("base64")}` };
}

/**
 * Auth headers for non-JSON requests (e.g. the SSE event stream).
 * Exported so streaming can reuse the exact credential scheme.
 * Never log these values.
 */
export function octAuthHeaders(password: string): Record<string, string> {
  return authHeader(password);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Join a base URL and path (exported for the SSE event stream). */
export function octJoinUrl(baseUrl: string, path: string): string {
  return joinUrl(baseUrl, path);
}

/**
 * JSON request helper. Never includes the password in errors or logs —
 * only the path and HTTP status are exposed.
 */
export async function requestJson(
  baseUrl: string,
  password: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 15000,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(joinUrl(baseUrl, path), {
      method,
      headers: { ...authHeader(password), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new OctHttpError(response.status, text.slice(0, 500), path);
    }
    return text ? (JSON.parse(text) as unknown) : undefined;
  } catch (error) {
    if (timedOut) {
      throw new Error(`opencode request timed out: ${method} ${path} (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface ServerInfo {
  version: string;
  pid: number;
  urls: string[];
  paths: { tmp: string };
}

/** `GET /api/info` — health check and server identity. */
export async function getInfo(baseUrl: string, password: string, timeoutMs = 5000): Promise<ServerInfo> {
  const raw = (await requestJson(baseUrl, password, "GET", "/api/info", undefined, timeoutMs)) as ServerInfo;
  return raw;
}

export interface ModelVariant {
  id: string;
  [key: string]: unknown;
}

export interface ModelInfo {
  id: string;
  modelID: string;
  providerID: string;
  family?: string;
  name?: string;
  limit?: { context: number; input?: number; output: number };
  capabilities?: { tools: boolean; input: string[]; output: string[] };
  status?: string;
  enabled?: boolean;
  /** Engine thinking-effort variants (`Model.Info.variants[]`); absent/empty = no effort control. */
  variants?: ModelVariant[];
}

export interface ModelList {
  location: { directory: string };
  data: ModelInfo[];
}

/**
 * `GET /api/model` — snapshot of available models ordered by release date.
 * The directory query is optional; the server falls back to its default.
 */
export async function listModels(
  baseUrl: string,
  password: string,
  directory?: string,
  timeoutMs = 15000,
): Promise<ModelList> {
  const path = directory ? `/api/model?location%5Bdirectory%5D=${encodeURIComponent(directory)}` : "/api/model";
  const raw = (await requestJson(baseUrl, password, "GET", path, undefined, timeoutMs)) as ModelList;
  return raw;
}

export interface SessionTokenCache {
  read: number;
  write: number;
}

export interface SessionTokens {
  input: number;
  output: number;
  reasoning: number;
  cache: SessionTokenCache;
}

export interface SessionModelRef {
  id: string;
  providerID: string;
  variant?: string;
}

export interface SessionInfo {
  id: string;
  title?: string;
  /** Cumulative engine token accounting (`TokenUsage.Info`); absent on older servers. */
  tokens?: unknown;
  /** Model coordinates serving the session (`Model.Ref`); absent when unset. */
  model?: unknown;
  /** Engine timestamps (`time.created/updated/idle`); display-only. */
  time?: unknown;
  [key: string]: unknown;
}

/** `POST /api/session` — create a session at the requested location. */
export async function createSession(
  baseUrl: string,
  password: string,
  input: { title?: string; directory?: string; model?: { id: string; providerID: string; variant?: string } },
  timeoutMs = 15000,
): Promise<SessionInfo> {
  const body: Record<string, unknown> = {};
  if (input.title) {
    body["title"] = input.title;
  }
  if (input.model) {
    body["model"] =
      input.model.variant !== undefined
        ? { id: input.model.id, providerID: input.model.providerID, variant: input.model.variant }
        : { id: input.model.id, providerID: input.model.providerID };
  }
  if (input.directory) {
    body["location"] = { directory: input.directory };
  }
  const raw = (await requestJson(baseUrl, password, "POST", "/api/session", body, timeoutMs)) as {
    data: SessionInfo;
  };
  return raw.data;
}

/** `GET /api/session/:id` — fetch one session (existence check for reuse). */
export async function getSession(
  baseUrl: string,
  password: string,
  sessionId: string,
  timeoutMs = 15000,
): Promise<SessionInfo> {
  const raw = (await requestJson(
    baseUrl,
    password,
    "GET",
    `/api/session/${encodeURIComponent(sessionId)}`,
    undefined,
    timeoutMs,
  )) as { data: SessionInfo };
  return raw.data;
}

export interface SessionListQuery {
  directory?: string;
  limit?: number;
}

/**
 * `GET /api/session` — list sessions (newest first by default).
 * Returns the `data` page only; callers needing full history must follow
 * `cursor.next` themselves. T-0017 uses one page (limit 500) for the status
 * list — the conversation map caps at 200, so a single page covers it plus
 * the user's unmapped CLI sessions.
 * No directory filter by default: filtering would hide sessions from other
 * directories and cause false prune positives in the status pass.
 */
export async function listSessions(
  baseUrl: string,
  password: string,
  query?: SessionListQuery,
  timeoutMs = 15000,
): Promise<SessionInfo[]> {
  const params = new URLSearchParams();
  if (query?.directory) {
    params.set("directory", query.directory);
  }
  if (query?.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const raw = (await requestJson(
    baseUrl,
    password,
    "GET",
    `/api/session${suffix}`,
    undefined,
    timeoutMs,
  )) as { data: SessionInfo[] };
  return raw.data ?? [];
}

/**
 * `PATCH /api/session/:id` — update mutable session properties (title).
 * Returns NoContent on success. Added for T-0007 diagnostics/future use;
 * the bridge sets the title at create time and does no auto-retitle.
 */
export async function updateSession(
  baseUrl: string,
  password: string,
  sessionId: string,
  input: { title?: string },
  timeoutMs = 15000,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) {
    body["title"] = input.title;
  }
  await requestJson(baseUrl, password, "PATCH", `/api/session/${encodeURIComponent(sessionId)}`, body, timeoutMs);
}

/**
 * `DELETE /api/session/:id` — delete an engine session (T-0016 orphan
 * cleanup; never called on the hot path).
 * Returns `"gone"` when the session was already deleted (404 is benign);
 * throws on any other failure so the caller keeps the graveyard entry.
 */
export async function deleteSession(
  baseUrl: string,
  password: string,
  sessionId: string,
  timeoutMs = 15000,
): Promise<"deleted" | "gone"> {
  try {
    await requestJson(baseUrl, password, "DELETE", `/api/session/${encodeURIComponent(sessionId)}`, undefined, timeoutMs);
    return "deleted";
  } catch (error) {
    if (error instanceof OctHttpError && error.status === 404) {
      return "gone";
    }
    throw error;
  }
}

/** `POST /api/session/:id/model` — pin the session to the picker model. */
export async function switchSessionModel(
  baseUrl: string,
  password: string,
  sessionId: string,
  model: { id: string; providerID: string; variant?: string },
  timeoutMs = 15000,
): Promise<void> {
  await requestJson(baseUrl, password, "POST", `/api/session/${encodeURIComponent(sessionId)}/model`, {
    model:
      model.variant !== undefined
        ? { id: model.id, providerID: model.providerID, variant: model.variant }
        : { id: model.id, providerID: model.providerID },
  }, timeoutMs);
}

/** `POST /api/session/:id/interrupt` — best-effort cancel of a running turn. */
export async function interruptSession(
  baseUrl: string,
  password: string,
  sessionId: string,
  timeoutMs = 5000,
): Promise<void> {
  try {
    await requestJson(baseUrl, password, "POST", `/api/session/${encodeURIComponent(sessionId)}/interrupt`, {}, timeoutMs);
  } catch {
    // Best effort: the turn may already be idle.
  }
}

export interface SessionMessageItem {
  id: string;
  type: string;
  content?: Array<{ type: string; text?: string }>;
  [key: string]: unknown;
}

/** `GET /api/session/:id/message` — newest-first projected messages (fallback path). */
export async function listSessionMessages(
  baseUrl: string,
  password: string,
  sessionId: string,
  limit = 20,
  timeoutMs = 15000,
): Promise<SessionMessageItem[]> {
  const raw = (await requestJson(
    baseUrl,
    password,
    "GET",
    `/api/session/${encodeURIComponent(sessionId)}/message?limit=${limit}&order=desc`,
    undefined,
    timeoutMs,
  )) as { data: SessionMessageItem[] };
  return raw.data ?? [];
}

/**
 * `POST /api/session/:id/prompt` — admit one input, schedule agent-loop
 * execution. T-0003 consumes this for chat turns; T-0023 adds optional
 * prompt `files` (image ferry: `{uri, name?}` — `data:` URIs or `file://`).
 */
export interface PromptFileAttachment {
  uri: string;
  name?: string;
}

export async function promptSession(
  baseUrl: string,
  password: string,
  sessionId: string,
  input: { text: string; files?: PromptFileAttachment[] },
  timeoutMs = 15000,
): Promise<unknown> {
  return requestJson(baseUrl, password, "POST", `/api/session/${encodeURIComponent(sessionId)}/prompt`, {
    text: input.text,
    ...(input.files && input.files.length > 0 ? { files: input.files } : {}),
  }, timeoutMs);
}

export interface PermissionFileChange {
  file?: string;
  patch?: string;
  status?: string;
  [key: string]: unknown;
}

export interface PermissionRequestItem {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  save?: string[];
  metadata?: { files?: PermissionFileChange[]; [key: string]: unknown };
  source?: { type?: string; messageID?: string; id?: string };
  message?: string;
  [key: string]: unknown;
}

export type PermissionDecision = "once" | "always" | "reject";

/** `GET /api/session/:id/permission` — list pending approval requests. */
export async function listSessionPermissions(
  baseUrl: string,
  password: string,
  sessionId: string,
  timeoutMs = 15000,
): Promise<PermissionRequestItem[]> {
  const raw = (await requestJson(
    baseUrl,
    password,
    "GET",
    `/api/session/${encodeURIComponent(sessionId)}/permission`,
    undefined,
    timeoutMs,
  )) as { data: PermissionRequestItem[] };
  return raw.data ?? [];
}

/**
 * `POST /api/session/:id/permission/:req/reply` — answer an approval.
 * Returns `"gone"` when the request already resolved (404 is benign);
 * throws on any other failure so the caller can interrupt as fallback.
 */
export async function replySessionPermission(
  baseUrl: string,
  password: string,
  sessionId: string,
  requestId: string,
  decision: PermissionDecision,
  message?: string,
  timeoutMs = 15000,
): Promise<"replied" | "gone"> {
  try {
    await requestJson(
      baseUrl,
      password,
      "POST",
      `/api/session/${encodeURIComponent(sessionId)}/permission/${encodeURIComponent(requestId)}/reply`,
      message === undefined ? { decision } : { decision, message },
      timeoutMs,
    );
    return "replied";
  } catch (error) {
    if (error instanceof OctHttpError && error.status === 404) {
      return "gone";
    }
    throw error;
  }
}

/** Coerce an engine token counter to a safe non-negative integer (garbage → 0). */
function tokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * Parse cumulative engine token accounting from a `Session.Info` value
 * (T-0028, pure): `tokens {input, output, reasoning, cache {read, write}}`
 * per `@opencode/schema/token-usage`. Tolerant — missing/malformed fields
 * yield 0, never a throw — so status/table/usage callers degrade to
 * "no usage yet" instead of failing the turn.
 */
export function parseSessionTokens(info: unknown): SessionTokens {
  if (typeof info !== "object" || info === null) {
    return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
  }
  const tokens = (info as Record<string, unknown>)["tokens"];
  if (typeof tokens !== "object" || tokens === null) {
    return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
  }
  const record = tokens as Record<string, unknown>;
  const cache = record["cache"];
  const cacheRecord = typeof cache === "object" && cache !== null ? (cache as Record<string, unknown>) : {};
  return {
    input: tokenCount(record["input"]),
    output: tokenCount(record["output"]),
    reasoning: tokenCount(record["reasoning"]),
    cache: {
      read: tokenCount(cacheRecord["read"]),
      write: tokenCount(cacheRecord["write"]),
    },
  };
}

/** Sum all engine token fields (matches `TokenUsage.total` server-side). */
export function sessionTokensTotal(tokens: SessionTokens): number {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

/**
 * Parse the serving model coordinates from a `Session.Info` value
 * (T-0028, pure): `model {id, providerID, variant?}` per `Model.Ref`.
 * Returns undefined when absent/malformed (caller falls back to the map's
 * modelKey or reports limits unknown).
 */
export function sessionModelRef(info: unknown): SessionModelRef | undefined {
  if (typeof info !== "object" || info === null) {
    return undefined;
  }
  const model = (info as Record<string, unknown>)["model"];
  if (typeof model !== "object" || model === null) {
    return undefined;
  }
  const record = model as Record<string, unknown>;
  const id = record["id"];
  const providerID = record["providerID"];
  if (typeof id !== "string" || !id || typeof providerID !== "string" || !providerID) {
    return undefined;
  }
  const variant = record["variant"];
  return typeof variant === "string" && variant
    ? { id, providerID, variant }
    : { id, providerID };
}
