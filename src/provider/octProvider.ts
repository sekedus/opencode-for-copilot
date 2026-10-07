import * as vscode from "vscode";
import { interruptSession, listModels } from "../server/client";
import { logLine } from "../output";
import { toOctModels, resolveReasoningEffort, type OctModel } from "./models";
import { buildPromptWithImages, extractToolResults, hasToolParts } from "./messages";
import { conversationKey, DELETED_SESSION_MESSAGE, DROPPED_SESSION_MESSAGE, canonicalDirectory, extractMentionedPaths, isSessionGoneError, OctSessionMap, resolveChatDirectory, sessionTitleFromMessages, type SessionModelRef } from "./sessions";
import { isInstructionBlockedError, streamTurn } from "./streaming";
import { mapCopilotTools, type ToolShuttle } from "./tools";
import type { ToolFilePart } from "./images";
import { type PermissionTranslator } from "./permissions";

/**
 * OCT chat provider: exposes engine models in the Copilot picker and serves
 * turns with 1 conversation = 1 session reuse, plus the tool bridge:
 * Copilot tools execute on the host via the shuttle loop (primary),
 * engine-native tools are the fallback when the bridge is unavailable, and
 * engine-native actions surface as approvals.
 */

export interface OctProviderDeps {
  baseUrl: string;
  password: string;
  directory: string;
  /** Persisted conversation→session map across window reloads. */
  sessionStore?: vscode.Memento;
  /** Shared tool shuttle (callback server + blocked-executor table). */
  shuttle: ToolShuttle;
  translator: PermissionTranslator;
  permissionTimeoutMs: number;
  /** Managed mode installs the bridge plugin itself; external mode needs it manually. */
  managed: boolean;
  /** Conversation→session map cap (`oct.maxSessions`). */
  maxSessions: number;
}

function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Per-turn workspace directory (T-0022).
 *
 * Mirror of `resolveTurnDirectory` in `extension.ts` (kept local to avoid a
 * provider→extension import cycle; `extension.ts` owns the provider). Chain:
 * message `filePath="..."` > active editor > first folder; no folder falls
 * back to `process.cwd()` (empty to undefined). Only open-folder values are
 * ever returned; the result is canonicalized.
 */
function resolveProviderTurnDirectory(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): string | undefined {
  const rawFolders = vscode.workspace.workspaceFolders;
  const folders: string[] = Array.isArray(rawFolders)
    ? rawFolders
        .map((folder) => (folder as { uri?: { fsPath?: unknown } })?.uri?.fsPath)
        .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  let messagePaths: string[] = [];
  try {
    messagePaths = extractMentionedPaths(messages);
  } catch {
    messagePaths = [];
  }
  const activeEditorPath = (
    vscode.window as {
      activeTextEditor?: { document?: { uri?: { fsPath?: unknown } } };
    }
  )?.activeTextEditor?.document?.uri?.fsPath;
  const resolved = resolveChatDirectory({
    messagePaths,
    activeEditorPath: typeof activeEditorPath === "string" ? activeEditorPath : undefined,
    workspaceFolders: folders,
  });
  if (typeof resolved === "string" && resolved.trim()) {
    return canonicalDirectory(resolved);
  }
  if (folders.length === 0) {
    try {
      const canon = canonicalDirectory(process.cwd() ?? "");
      return canon.trim() ? canon : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export class OctChatProvider implements vscode.LanguageModelChatProvider<OctModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly sessions: OctSessionMap;
  private modelsCache: OctModel[] = [];

  constructor(private readonly deps: OctProviderDeps) {
    this.sessions = new OctSessionMap(deps.sessionStore, deps.maxSessions);
  }

  /** Force VS Code to re-query the model list. */
  refreshModels(): void {
    this.changeEmitter.fire();
  }

  /** Snapshot of the conversation→session map for status/diagnostics. */
  mappedSessions(): Array<{ key: string; sessionId: string; modelKey: string; directory?: string }> {
    return this.sessions.snapshot();
  }

  /** Drop mappings whose engine sessions are gone (status prune pass). */
  pruneMappedSessions(deadSessionIds: Set<string>): string[] {
    return this.sessions.pruneBySessionIds(deadSessionIds);
  }

  /** Snapshot of the orphan graveyard for the opt-in cleanup command. */
  orphanedSessions(): string[] {
    return this.sessions.orphanedSessions();
  }

  /** Drop graveyard ids the cleanup command resolved (deleted or gone). */
  clearOrphaned(sessionIds: readonly string[]): void {
    this.sessions.clearOrphaned(sessionIds);
  }

  /** Credentials for status/diagnostics passes. Never log the password. */
  serverTarget(): { baseUrl: string; password: string } {
    return { baseUrl: this.deps.baseUrl, password: this.deps.password };
  }

  dispose(): void {
    this.changeEmitter.dispose();
    this.sessions.clear();
  }

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<OctModel[]> {
    if (token.isCancellationRequested) {
      return this.modelsCache;
    }
    try {
      const snapshot = await listModels(this.deps.baseUrl, this.deps.password, this.deps.directory || undefined);
      const models = toOctModels(snapshot.data);
      this.modelsCache = models;
      if (models.length === 0) {
        logLine("Model list returned 0 models; picker will show none until the engine reports models.");
      } else {
        logLine(`Model list: ${models.length} model(s) from engine.`);
      }
      return models;
    } catch (error) {
      // Fallback: empty list with a log line — never crash the picker.
      logLine(`Model list failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async provideLanguageModelChatResponse(
    model: OctModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    if (!model || typeof model.providerID !== "string" || typeof model.modelID !== "string") {
      throw new Error("OCT: unknown model selected. Refresh models and try again.");
    }
    // T-0022: per-chat workspace directory (message paths > active editor >
    // first folder). Used for the hash-fallback key input + session-create
    // `location.directory` at create time only — reuse turns never rewrite
    // `Entry.directory`, so switching editors mid-chat never moves a mapping.
    const turnDirectory = resolveProviderTurnDirectory(messages) ?? this.deps.directory;
    const key = conversationKey(
      { modelOptions: options.modelOptions as Record<string, unknown> | undefined },
      model.id,
      messages,
      turnDirectory,
    );
    const sessionDeps = { baseUrl: this.deps.baseUrl, password: this.deps.password, directory: turnDirectory };
    // Thinking Effort (T-0021, proposed API — stable types lack
    // `modelConfiguration`, so read it via a minimal cast): the picker's
    // resolved `reasoningEffort` for this model, validated against the
    // engine-advertised variants. Absent/unknown → omitted (engine default).
    const pickedEffort = (options as { modelConfiguration?: { reasoningEffort?: unknown } }).modelConfiguration
      ?.reasoningEffort;
    const variant = resolveReasoningEffort(pickedEffort, model.variantIds);
    const modelRef: SessionModelRef = {
      id: model.modelID,
      providerID: model.providerID,
      pickerId: model.id,
      ...(variant === undefined ? {} : { variant }),
    };
    if (this.sessions.isDead(key)) {
      // T-0013 follow-up: this chat's engine session was already reported
      // deleted — repeat the notice instead of silently opening an amnesiac
      // session, no matter how many times the user retries in this chat.
      progress.report(new vscode.LanguageModelTextPart(DELETED_SESSION_MESSAGE));
      return;
    }
    if (this.sessions.isDropped(key)) {
      // T-0019: this chat's session link was dropped (cap eviction, forget,
      // restore-cap, prune) — retire the chat with the dropped-link notice
      // instead of silently forking a history-less session. Creates nothing;
      // retrying repeats the notice (record is never auto-cleared).
      progress.report(new vscode.LanguageModelTextPart(DROPPED_SESSION_MESSAGE));
      return;
    }
    const titleSeed = sessionTitleFromMessages(messages);
    const sessionId = await this.sessions.getOrCreate(key, sessionDeps, modelRef, token, titleSeed);
    const hooks = {
      shuttle: this.deps.shuttle,
      translator: this.deps.translator,
      permissionTimeoutMs: this.deps.permissionTimeoutMs,
    };
    const streamDepsFor = (sid: string) => ({ baseUrl: this.deps.baseUrl, password: this.deps.password, sessionId: sid });
    const finishTurn = async (sid: string, outcome: { kind: string }): Promise<void> => {
      if (outcome.kind === "done") {
        this.deps.shuttle.clearPending(sid);
      }
    };
    const failTurn = async (sid: string): Promise<void> => {
      // Cancel/timeout/transport failure: unblock executors so the engine
      // never hangs, and drop stale pending tools.
      this.deps.shuttle.abortAll(sid, "turn failed");
      this.deps.shuttle.clearPending(sid);
      await interruptSession(this.deps.baseUrl, this.deps.password, sid);
    };
    const runContinuation = async (
      sid: string,
      matched: Array<{ callId: string; text: string; files: ToolFilePart[] }>,
    ): Promise<void> => {
      // Feed host results back WITHOUT prompting: the engine loop is blocked
      // in the executors. Resolve synchronously BEFORE streaming: deferring
      // the resolve past subscription lets the guard divert the continuation
      // to a new pause first, starving the oldest call forever (B-0004).
      // Image bytes ride the executor return (T-0023) as `data:` file parts;
      // no new admission. No text is lost by resolving early — the engine
      // needs a full model round-trip before it can stream new deltas, long
      // after SSE opens.
      for (const result of matched) {
        this.deps.shuttle.resolve(sid, result.callId, result.text, result.files.length > 0 ? result.files : undefined);
      }
      const outcome = await streamTurn({ ...streamDepsFor(sid), promptText: null }, progress, token, hooks);
      await finishTurn(sid, outcome);
    };
    const runNewTurn = async (sid: string): Promise<void> => {
      const { text: promptText, files: promptFiles } = buildPromptWithImages(messages);
      const copilotTools = options.tools ?? [];
      if (copilotTools.length > 0) {
        const bridgeAvailable = this.deps.managed || this.deps.shuttle.bridgeSeen;
        const defs = bridgeAvailable ? mapCopilotTools(copilotTools) : [];
        if (defs.length > 0) {
          this.deps.shuttle.setPending(sid, defs);
          logLine(`Turn on ${sid} carries ${String(defs.length)} Copilot tool(s) via the bridge (primary).`);
        } else if (!this.deps.shuttle.hasPending(sid)) {
          // T-0015: Copilot tools primary, engine tools fallback. No
          // text-only notice: the engine may use its own tools; ask-policy
          // approvals still surface via the confirmation flow (default-deny).
          logLine(
            `Turn on ${sid} carries tool definitions but the bridge is unavailable ` +
              `(external mode without the plugin); engine tools are the fallback.`,
          );
        } else {
          logLine(`Turn on ${sid} reuses ${String(this.deps.shuttle.pendingFor(sid).length)} pending bridge tool(s).`);
        }
      } else if (hasToolParts(messages)) {
        // T-0015: same fallback — serialized tool parts stay in the prompt
        // as text context (placeholders for non-text); no text-only notice.
        logLine(`Turn on ${sid} carries tool parts without definitions; engine tools are the fallback.`);
      }
      logLine(
        `Turn on ${sid} (${modelRef.pickerId}${modelRef.variant ? `#${modelRef.variant}` : ""}, ${promptText.length} chars` +
          (promptFiles.length > 0 ? `, ${String(promptFiles.length)} image file(s)` : "") +
          `).`,
      );
      const outcome = await streamTurn(
        {
          ...streamDepsFor(sid),
          promptText,
          ...(promptFiles.length > 0 ? { promptFiles } : {}),
        },
        progress,
        token,
        hooks,
      );
      await finishTurn(sid, outcome);
    };
    // Route to the shuttle loop: results matching blocked executors continue
    // the engine turn; anything else starts a new turn. A call that arrives
    // with blocked executors but no results and nothing new to emit is a
    // stuck turn (the host dedupes repeat callIds, so re-emitting spins
    // forever) — abort it and start fresh instead of re-pausing.
    const turn = async (sid: string): Promise<void> => {
      const results = extractToolResults(messages);
      const blocked = this.deps.shuttle.blockedFor(sid);
      const blockedIds = new Set(blocked.map((call) => call.engineId));
      const matched = results.filter((result) => blockedIds.has(result.callId));
      const unemitted = this.deps.shuttle.unemittedBlocked(sid);
      logLine(
        `Turn on ${sid}: ${String(results.length)} result(s), ` +
          `${String(blocked.length)} blocked (${String(unemitted.length)} unemitted), ` +
          `${String(matched.length)} matched.`,
      );
      try {
        if (matched.length > 0) {
          if (matched.length < results.length) {
            const known = new Set(matched.map((result) => result.callId));
            const stale = results
              .filter((result) => !known.has(result.callId))
              .map((result) => result.callId.slice(0, 8));
            logLine(`Turn on ${sid}: ${String(stale.length)} stale result(s) ignored (${stale.join(",")}).`);
          }
          await runContinuation(sid, matched);
          return;
        }
        if (blocked.length > 0 && unemitted.length === 0) {
          logLine(`Turn on ${sid}: stuck turn (no results, nothing new to emit); aborting ${String(blocked.length)} blocked call(s).`);
          this.deps.shuttle.abortAll(sid, "stuck turn without results");
          await interruptSession(this.deps.baseUrl, this.deps.password, sid);
        } else if (results.length > 0 && blocked.length > 0) {
          // Host answered something else (or a new message arrived) while
          // executors were blocked: supersede, interrupt, start fresh.
          logLine(`Turn on ${sid}: superseding ${String(blocked.length)} blocked call(s).`);
          this.deps.shuttle.abortAll(sid, "superseded by new turn");
          await interruptSession(this.deps.baseUrl, this.deps.password, sid);
        }
        await runNewTurn(sid);
      } catch (error) {
        await failTurn(sid);
        throw error;
      }
    };
    try {
      await turn(sessionId);
    } catch (error) {
      if (isSessionGoneError(error)) {
        // The engine session was deleted mid-conversation: drop the mapping
        // so nothing retries the dead id, and tell the user to start a new
        // chat (T-0013 — no silent recreate, no history replay).
        // Already 404-confirmed gone: keep it out of the orphan graveyard.
        this.sessions.forget(key, { gone: true });
        this.sessions.markDead(key);
        logLine(`Turn on ${sessionId} hit a deleted session (404); mapping dropped.`);
        // Report as chat text (B-0005 denial precedent): throwing routes the
        // sentence through Copilot's error UI, which renders it twice with a
        // stack trace ("Reason: … Error: … at …").
        progress.report(new vscode.LanguageModelTextPart(DELETED_SESSION_MESSAGE));
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (!isInstructionBlockedError(message)) {
        throw error;
      }
      // The mapped session can never initialize its instruction state, so
      // retrying the same id would fail forever. Drop the mapping and try
      // once on a fresh session (heals transient discovery failures).
      logLine(`Turn on ${sessionId} hit instruction-blocked; dropping the mapping and retrying once on a fresh session.`);
      this.sessions.forget(key);
      const freshId = await this.sessions.getOrCreate(key, sessionDeps, modelRef, token, titleSeed);
      logLine(`Turn on ${freshId} (${modelRef.pickerId}${modelRef.variant ? `#${modelRef.variant}` : ""}, retry after instruction-blocked).`);
      try {
        await turn(freshId);
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        if (isInstructionBlockedError(retryMessage)) {
          throw new Error(
            `OCT: engine instruction discovery is unavailable (core/instructions) for '${turnDirectory}'. ` +
              `The server could not read the AGENTS.md instruction files — check the directory exists and the files are readable, ` +
              `then reload the window to restart the managed engine and try again. Engine detail: ${retryMessage}`,
          );
        }
        throw retryError;
      }
    }
  }

  async provideTokenCount(
    model: OctModel,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    void model;
    if (typeof text === "string") {
      return estimateTokens(text);
    }
    const content = text.content
      .map((part) => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        if (typeof part === "string") {
          return part;
        }
        return "";
      })
      .join("\n");
    return estimateTokens(`${text.role}:${content}`);
  }
}
