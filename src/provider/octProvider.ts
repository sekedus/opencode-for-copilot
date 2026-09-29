import * as vscode from "vscode";
import { listModels } from "../server/client";
import { logLine } from "../output";
import { toOctModels, type OctModel } from "./models";
import { buildPromptText, hasToolParts } from "./messages";
import { conversationKey, OctSessionMap } from "./sessions";
import { streamTurn } from "./streaming";

/**
 * OCT chat provider: exposes engine models in the Copilot picker and serves
 * text-only turns with 1 conversation = 1 session reuse.
 */

export interface OctProviderDeps {
  baseUrl: string;
  password: string;
  directory: string;
}

const TOOL_NOTICE =
  "Note: this request included tool definitions, which the OCT text-only MVP does not execute. Answering with text only.";

function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

export class OctChatProvider implements vscode.LanguageModelChatProvider<OctModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly sessions = new OctSessionMap();
  private modelsCache: OctModel[] = [];

  constructor(private readonly deps: OctProviderDeps) {}

  /** Force VS Code to re-query the model list. */
  refreshModels(): void {
    this.changeEmitter.fire();
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
    const key = conversationKey(
      { modelOptions: options.modelOptions as Record<string, unknown> | undefined },
      model.id,
      messages,
      this.deps.directory,
    );
    const sessionId = await this.sessions.getOrCreate(
      key,
      { baseUrl: this.deps.baseUrl, password: this.deps.password, directory: this.deps.directory },
      { id: model.modelID, providerID: model.providerID, pickerId: model.id },
      token,
    );
    let promptText = buildPromptText(messages);
    if (hasToolParts(messages) || (options.tools?.length ?? 0) > 0) {
      promptText = `${TOOL_NOTICE}\n\n${promptText}`;
      logLine(`Turn on ${sessionId} carries tool definitions; answering text-only.`);
    }
    logLine(`Turn on ${sessionId} (${model.id}, ${promptText.length} chars).`);
    await streamTurn(
      { baseUrl: this.deps.baseUrl, password: this.deps.password, sessionId, promptText },
      progress,
      token,
    );
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
