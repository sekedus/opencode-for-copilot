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

export interface SessionInfo {
  id: string;
  title?: string;
  [key: string]: unknown;
}

/** `POST /api/session` — create a session at the requested location. */
export async function createSession(
  baseUrl: string,
  password: string,
  input: { title?: string; directory?: string; model?: { id: string; providerID: string } },
  timeoutMs = 15000,
): Promise<SessionInfo> {
  const body: Record<string, unknown> = {};
  if (input.title) {
    body["title"] = input.title;
  }
  if (input.model) {
    body["model"] = { id: input.model.id, providerID: input.model.providerID };
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

/** `POST /api/session/:id/model` — pin the session to the picker model. */
export async function switchSessionModel(
  baseUrl: string,
  password: string,
  sessionId: string,
  model: { id: string; providerID: string },
  timeoutMs = 15000,
): Promise<void> {
  await requestJson(baseUrl, password, "POST", `/api/session/${encodeURIComponent(sessionId)}/model`, {
    model: { id: model.id, providerID: model.providerID },
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
 * execution. T-0003 consumes this for chat turns.
 */
export async function promptSession(
  baseUrl: string,
  password: string,
  sessionId: string,
  input: { text: string },
  timeoutMs = 15000,
): Promise<unknown> {
  return requestJson(baseUrl, password, "POST", `/api/session/${encodeURIComponent(sessionId)}/prompt`, {
    text: input.text,
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
