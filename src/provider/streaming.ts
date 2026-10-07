import * as vscode from "vscode";
import {
  interruptSession,
  listSessionMessages,
  octAuthHeaders,
  octJoinUrl,
  promptSession,
  replySessionPermission,
  type PromptFileAttachment,
} from "../server/client";
import { logLine } from "../output";
import { parsePermissionAsked, type PermissionTranslator } from "./permissions";
import { isSessionGoneError } from "./sessions";
import { type BlockedCall, type ToolShuttle } from "./tools";

/**
 * Text streaming for one chat turn (opencode v2) with tool-bridge support.
 *
 * Flow:
 * 1. Open `GET /api/event` (SSE) *before* prompting so no deltas are missed
 *    (`promptText: null` skips prompting — a tool-result continuation).
 * 2. `POST /api/session/:id/prompt` with the current turn text (fire the
 *    prompt without awaiting completion — the server admits the input and
 *    schedules the agent loop; the turn boundary arrives on the stream).
 * 3. Consume `session.text.delta` for this session, reporting each delta via
 *    `progress.report(new LanguageModelTextPart(delta))`.
 * 4. Tool bridge: the SSE race includes shuttle callbacks. When a Copilot
 *    tool executor blocks, emit one `LanguageModelToolCallPart` per call and
 *    return `{kind:"tool-calls"}` — the host executes and the NEXT provider
 *    call feeds results back (continuation). Executors stay blocked across
 *    provider calls; `session.step.ended` is NOT terminal (multi-step turns).
 * 5. Stop at the turn boundary: `session.execution.*`, `session.idle`,
 *    `session.error`, or `session.step.failed` for this session.
 * 6. Fallback: when no deltas arrived (some turns emit none), fetch the
 *    newest assistant message and report its full text once.
 * 7. Approvals: `permission.asked` pauses inline for a user confirmation
 *    (default-deny); the reply resumes the engine.
 *
 * Cancellation aborts the SSE reader and best-effort interrupts the session.
 */

export interface StreamDeps {
  baseUrl: string;
  password: string;
  sessionId: string;
  /** Null = continuation turn: stream without admitting a new prompt. */
  promptText: string | null;
  /** Image files admitted alongside the prompt (T-0023; new turns only). */
  promptFiles?: PromptFileAttachment[];
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
  // Turn boundary: the agent loop finished (or errored). NOTE: `step.ended`
  // is intentionally NOT terminal — a multi-step turn runs several steps
  // behind one prompt; stopping at the first step would truncate text turns
  // and break tool continuations.
  switch (event.type) {
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

/** Per-turn collaborators for the tool bridge (absent = text-only fallback). */
export interface TurnHooks {
  shuttle?: ToolShuttle;
  translator?: PermissionTranslator;
  permissionTimeoutMs?: number;
}

export type TurnOutcome = { kind: "done" } | { kind: "tool-calls"; calls: BlockedCall[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Minimal SSE reader over fetch: yields parsed `data:` JSON payloads. */
async function* readSse(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): AsyncGenerator<WireEvent> {
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
  hooks: TurnHooks = {},
): Promise<TurnOutcome> {
  const { baseUrl, password, sessionId, promptText, promptFiles } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shuttle = hooks.shuttle;
  const translator = hooks.translator;
  const permissionTimeoutMs = hooks.permissionTimeoutMs ?? 60_000;
  const controller = new AbortController();
  // Abort-reason tracking: `controller.signal.aborted` goes true on every
  // normal turn (we abort the SSE reader once the terminal event arrives),
  // so it must never be used as evidence of cancellation/timeout. Only the
  // explicit flags below mean the turn was cancelled or timed out.
  let cancelRequested = false;
  let timedOut = false;
  let admissionFailed = false;
  /** Raw admission error: a gone session must surface typed (T-0013) so the
   *  provider can map it to the start-a-new-chat sentence. */
  let admissionError: unknown;
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
  /** An approval denied (or timed out) during this turn. A denial is a user
   *  decision, not a system error: when the terminal failure is just the
   *  engine stopping after it, end the turn with a clean sentence instead of
   *  throwing engine internals (and our stack) into the chat. */
  let deniedThisTurn = false;
  let promptPromise: Promise<unknown> = Promise.resolve();
  /** True while the prompt admission is still in flight (continuations skip it). */
  let promptFlight = promptText !== null;
  let toolSignal: { promise: Promise<BlockedCall[]>; cancel: () => void } | null = null;
  const emitted = new Set<string>();
  /**
   * Steps are paragraphs: the engine streams no separators between steps and
   * Copilot concatenates reported parts verbatim, so without this the chat
   * renders "…what's here.Let me look…" on one line.
   */
  const breakParagraph = (): void => {
    if (streamed && !/\s$/.test(streamed)) {
      streamed += "\n\n";
      progress.report(new vscode.LanguageModelTextPart("\n\n"));
    }
  };
  /** Emit ToolCallParts and pause the provider call; executors stay blocked. */
  const pauseForTools = async (calls: BlockedCall[]): Promise<TurnOutcome> => {
    await promptPromise;
    if (admissionFailed) {
      if (isSessionGoneError(admissionError)) {
        throw admissionError;
      }
      throw new Error(`OCT: ${turnError ?? "prompt failed"}`);
    }
    breakParagraph();
    for (const call of calls) {
      emitted.add(call.engineId);
      const input = isRecord(call.input) ? call.input : {};
      progress.report(new vscode.LanguageModelToolCallPart(call.engineId, call.originalName, input));
    }
    shuttle?.markEmitted(
      sessionId,
      calls.map((call) => call.engineId),
    );
    logLine(`Turn on ${sessionId} paused for ${String(calls.length)} Copilot tool call(s); executors stay blocked.`);
    controller.abort();
    return { kind: "tool-calls", calls };
  };
  try {
    const stream = readSse(octJoinUrl(baseUrl, "/api/event"), octAuthHeaders(password), controller.signal);
    if (promptText !== null) {
      promptPromise = promptSession(
        baseUrl,
        password,
        sessionId,
        promptFiles && promptFiles.length > 0 ? { text: promptText, files: promptFiles } : { text: promptText },
      ).catch((error: unknown) => {
        // Admission failures (unknown session, validation, timeout) are
        // authoritative — no terminal event will follow, so mark the turn and
        // let the stream loop exit instead of hanging until the turn timeout.
        admissionFailed = true;
        admissionError = error;
        turnError = error instanceof Error ? error.message : String(error);
      });
    }
    const it = stream[Symbol.asyncIterator]();
    let nextEvent: Promise<IteratorResult<WireEvent>> | null = null;
    for (;;) {
      if (cancelRequested || timedOut || token.isCancellationRequested) {
        break;
      }
      if (admissionFailed) {
        break;
      }
      if (shuttle) {
        // Calls blocked before the waiter armed (missed-wakeup guard).
        const existing = shuttle.blockedFor(sessionId).filter((call) => !emitted.has(call.engineId));
        if (existing.length > 0) {
          return pauseForTools(existing);
        }
      }
      if (!nextEvent) {
        nextEvent = it.next();
      }
      if (shuttle && !toolSignal) {
        toolSignal = shuttle.waitForCalls(sessionId);
      }
      type Race =
        | { t: "event"; v: IteratorResult<WireEvent> }
        | { t: "tool"; c: BlockedCall[] }
        | { t: "prompt" };
      let winner: Race;
      try {
        const racers: Array<Promise<Race>> = [nextEvent.then((v): Race => ({ t: "event", v }))];
        if (toolSignal) {
          racers.push(toolSignal.promise.then((c): Race => ({ t: "tool", c })));
        }
        if (promptFlight) {
          // A rejected prompt has no terminal event following it — without
          // this racer the turn parks on a quiet stream until the turn
          // timeout (EDH 2026-10-04: deleted-session turn hung, then failed).
          racers.push(promptPromise.then((): Race => ({ t: "prompt" })));
        }
        winner = await Promise.race(racers);
      } catch (error) {
        if (timedOut) {
          await interruptSession(baseUrl, password, sessionId);
          throw new Error("OCT: turn timed out.");
        }
        if (cancelRequested || token.isCancellationRequested) {
          await interruptSession(baseUrl, password, sessionId);
          throw new Error("OCT: request cancelled.");
        }
        throw error;
      }
      if (winner.t === "prompt") {
        promptFlight = false;
        if (admissionFailed) {
          break;
        }
        continue;
      }
      if (winner.t === "tool") {
        toolSignal = null;
        const fresh = winner.c.filter((call) => !emitted.has(call.engineId));
        if (fresh.length === 0) {
          continue; // Spurious wake (abort race) — re-arm and keep streaming.
        }
        return pauseForTools(fresh);
      }
      nextEvent = null;
      const { value: event, done } = winner.v;
      if (done) {
        break;
      }
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
      const asked = parsePermissionAsked(event.type, event.data, sessionId);
      if (asked) {
        if (translator) {
          const approval = await translator.ask({ baseUrl, password, timeoutMs: permissionTimeoutMs }, asked, token);
          if (approval === "rejected") {
            deniedThisTurn = true;
          }
        } else {
          logLine(`Permission ${asked.id} (${asked.action}): no translator; default-deny.`);
          try {
            await replySessionPermission(baseUrl, password, sessionId, asked.id, "reject");
          } catch (error) {
            await interruptSession(baseUrl, password, sessionId);
            throw error;
          }
        }
        continue;
      }
      if (event.type === "session.error") {
        turnError = errorOf(event) ?? "OCT: session error.";
        sawTerminal = true;
        break;
      }
      if (event.type === "session.step.failed" || event.type === "session.execution.failed") {
        turnError = errorOf(event) ?? turnError;
        sawTerminal = true;
        break;
      }
      if (event.type === "session.step.ended") {
        breakParagraph();
        continue;
      }
      if (isTerminalFor(event, sessionId)) {
        sawTerminal = true;
        break;
      }
    }
    controller.abort();
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
      if (isSessionGoneError(admissionError)) {
        throw admissionError;
      }
      if (deniedThisTurn && /abort|interrupt|denied|reject/i.test(turnError)) {
        const notice = "The engine stopped because the request was not approved (denied, timed out, or dismissed). Nothing was applied.";
        progress.report(new vscode.LanguageModelTextPart(notice));
        streamed = notice;
        logLine(`Turn on ${sessionId} ended after a denial; reported cleanly instead of throwing.`);
        return { kind: "done" };
      }
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
    return { kind: "done" };
  } catch (error) {
    if (cancelRequested || timedOut || token.isCancellationRequested) {
      await interruptSession(baseUrl, password, sessionId);
      logLine(`Turn on ${sessionId} ended: ${timedOut ? "timed out" : "request cancelled"}.`);
      throw new Error(timedOut ? "OCT: turn timed out." : "OCT: request cancelled.");
    }
    throw error;
  } finally {
    toolSignal?.cancel();
    clearTimeout(timer);
    cancelSub.dispose();
  }
}
