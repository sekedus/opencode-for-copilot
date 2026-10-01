import * as vscode from "vscode";
import { interruptSession, listSessionMessages, octAuthHeaders, octJoinUrl, promptSession } from "../server/client";
import { logLine } from "../output";

/**
 * Text streaming for one chat turn (opencode v2, text-only MVP).
 *
 * Flow:
 * 1. Open `GET /api/event` (SSE) *before* prompting so no deltas are missed.
 * 2. `POST /api/session/:id/prompt` with the current turn text (fire the
 *    prompt without awaiting completion — the server admits the input and
 *    schedules the agent loop; the turn boundary arrives on the stream).
 * 3. Consume `session.text.delta` for this session, reporting each delta via
 *    `progress.report(new LanguageModelTextPart(delta))`.
 * 4. Stop at the turn boundary: `session.step.ended`, `session.step.failed`,
 *    `session.execution.*`, or `session.error` for this session.
 * 5. Fallback: when no deltas arrived (some turns emit none), fetch the
 *    newest assistant message and report its full text once.
 *
 * Cancellation aborts the SSE reader and best-effort interrupts the session.
 */

export interface StreamDeps {
  baseUrl: string;
  password: string;
  sessionId: string;
  promptText: string;
  timeoutMs?: number;
}

interface WireEvent {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const FALLBACK_MESSAGE_LIMIT = 10;

function sessionOf(event: WireEvent): string | undefined {
  const data = event.data;
  if (data && typeof data["sessionID"] === "string") {
    return data["sessionID"] as string;
  }
  return undefined;
}

function deltaOf(event: WireEvent): string | undefined {
  const data = event.data;
  if (data && typeof data["delta"] === "string") {
    return data["delta"] as string;
  }
  return undefined;
}

function errorOf(event: WireEvent): string | undefined {
  const data = event.data;
  const error = data?.["error"];
  if (typeof error === "string" && error) {
    return error;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record["message"];
    const type = record["type"];
    if (typeof message === "string" && message) {
      // Keep the engine error type (e.g. `provider.auth`) — it tells the
      // user whether to sign in, pick another model, or retry. The generic
      // `unknown` bucket carries no signal, so it is omitted.
      if (typeof type === "string" && type && type !== "unknown") {
        return `[${type}] ${message}`;
      }
      return message;
    }
  }
  return undefined;
}

/**
 * True when a turn error means the session's instruction state could never
 * initialize (`core/instructions` source unavailable: an AGENTS.md file was
 * unreadable or instruction discovery failed). The engine records no baseline
 * for such sessions, so every subsequent prompt on the same id fails the same
 * way — the caller must map the conversation to a fresh session instead of
 * retrying the poisoned one.
 */
export function isInstructionBlockedError(message: string): boolean {
  return /instruction initialization blocked by unavailable sources/i.test(message);
}

function isTerminalFor(event: WireEvent, sessionId: string): boolean {
  if (sessionOf(event) !== sessionId) {
    return false;
  }
  switch (event.type) {
    case "session.step.ended":
    case "session.step.failed":
    case "session.execution.succeeded":
    case "session.execution.failed":
    case "session.execution.interrupted":
    case "session.error":
    case "session.idle":
      return true;
    default:
      return false;
  }
}

/** Minimal SSE reader over fetch: yields parsed `data:` JSON payloads. */
async function* readSse(url: string, headers: Record<string, string>, signal: AbortSignal): AsyncGenerator<WireEvent> {
  const response = await fetch(url, { method: "GET", headers: { ...headers, Accept: "text/event-stream" }, signal });
  if (!response.ok || !response.body) {
    throw new Error(`OCT: event stream failed (HTTP ${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          try {
            yield JSON.parse(data) as WireEvent;
          } catch {
            // Ignore malformed frames (heartbeats carry no data).
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (next.done) {
        return;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader already closed.
    }
    reader.releaseLock();
  }
}

function assistantTextFromMessages(messages: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>): string {
  const assistants = messages.filter((m) => m.type === "assistant");
  for (let i = assistants.length - 1; i >= 0; i--) {
    const text = (assistants[i].content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string" && part.text)
      .map((part) => part.text as string)
      .join("");
    if (text) {
      return text;
    }
  }
  return "";
}

export async function streamTurn(
  deps: StreamDeps,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken,
): Promise<void> {
  const { baseUrl, password, sessionId, promptText } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  // Abort-reason tracking: `controller.signal.aborted` goes true on every
  // normal turn (we abort the SSE reader once the terminal event arrives),
  // so it must never be used as evidence of cancellation/timeout. Only the
  // explicit flags below mean the turn was cancelled or timed out.
  let cancelRequested = false;
  let timedOut = false;
  let admissionFailed = false;
  const onCancel = () => {
    cancelRequested = true;
    controller.abort();
  };
  if (token.isCancellationRequested) {
    throw new Error("OCT: request cancelled.");
  }
  const cancelSub = token.onCancellationRequested(onCancel);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let streamed = "";
  let sawTerminal = false;
  let turnError: string | undefined;
  try {
    const stream = readSse(octJoinUrl(baseUrl, "/api/event"), octAuthHeaders(password), controller.signal);
    const promptPromise = promptSession(baseUrl, password, sessionId, { text: promptText }).catch((error: unknown) => {
      // Admission failures (unknown session, validation, timeout) are
      // authoritative — no terminal event will follow, so mark the turn and
      // let the stream loop exit instead of hanging until the turn timeout.
      admissionFailed = true;
      turnError = error instanceof Error ? error.message : String(error);
    });
    try {
      for await (const event of stream) {
        if (cancelRequested || timedOut || token.isCancellationRequested) {
          break;
        }
        if (admissionFailed) {
          break;
        }
        if (sessionOf(event) !== sessionId) {
          continue;
        }
        if (event.type === "session.text.delta") {
          const delta = deltaOf(event);
          if (delta) {
            streamed += delta;
            progress.report(new vscode.LanguageModelTextPart(delta));
          }
          continue;
        }
        if (event.type === "session.error") {
          turnError = errorOf(event) ?? "OCT: session error.";
          continue;
        }
        if (event.type === "session.step.failed" || event.type === "session.execution.failed") {
          turnError = errorOf(event) ?? turnError;
          sawTerminal = true;
          break;
        }
        if (isTerminalFor(event, sessionId)) {
          sawTerminal = true;
          break;
        }
      }
    } catch (error) {
      if (cancelRequested || timedOut || token.isCancellationRequested) {
        if (timedOut) {
          await interruptSession(baseUrl, password, sessionId);
          throw new Error("OCT: turn timed out.");
        }
        await interruptSession(baseUrl, password, sessionId);
        throw new Error("OCT: request cancelled.");
      }
      throw error;
    } finally {
      // Expected close of the SSE reader after the terminal event (or an
      // early break above). Not evidence of cancellation.
      controller.abort();
    }
    await promptPromise;
    if (cancelRequested || token.isCancellationRequested) {
      await interruptSession(baseUrl, password, sessionId);
      throw new Error("OCT: request cancelled.");
    }
    if (timedOut) {
      await interruptSession(baseUrl, password, sessionId);
      throw new Error("OCT: turn timed out.");
    }
    if (turnError && !streamed) {
      throw new Error(`OCT: ${turnError}`);
    }
    if (!streamed) {
      // Fallback: some turns emit no deltas — report the newest assistant text once.
      const messages = await listSessionMessages(baseUrl, password, sessionId, FALLBACK_MESSAGE_LIMIT);
      const full = assistantTextFromMessages(messages);
      if (full) {
        progress.report(new vscode.LanguageModelTextPart(full));
        streamed = full;
      } else if (!sawTerminal && turnError) {
        throw new Error(`OCT: ${turnError}`);
      } else if (!sawTerminal && !full) {
        logLine(`Turn on ${sessionId} produced no text (no deltas, no assistant message).`);
      }
    }
    if (turnError && streamed) {
      logLine(`Turn on ${sessionId} completed with a non-fatal error after streaming: ${turnError}`);
    }
  } catch (error) {
    if (cancelRequested || timedOut || token.isCancellationRequested) {
      await interruptSession(baseUrl, password, sessionId);
      throw new Error(timedOut ? "OCT: turn timed out." : "OCT: request cancelled.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    cancelSub.dispose();
  }
}
