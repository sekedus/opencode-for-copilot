import * as vscode from "vscode";
import { toolResultToText } from "./tools";

/**
 * Convert Copilot chat messages to a single opencode prompt text.
 *
 * The engine owns conversation history server-side (1 conversation = 1
 * session), so only the current turn's text is sent with role labels.
 * Tool-call and data parts are summarized as placeholders — the bridge is
 * text-serialized and must never silently drop them.
 */

function roleLabel(role: vscode.LanguageModelChatMessageRole): string {
  return role === vscode.LanguageModelChatMessageRole.Assistant ? "ASSISTANT" : "USER";
}

/** Best-effort text extraction from a heterogeneous content part. */
export function partText(part: unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) {
    return part.value;
  }
  if (typeof part === "string") {
    return part;
  }
  if (part instanceof vscode.LanguageModelToolCallPart) {
    return `[Tool call: ${part.name} ${safeJson(part.input)}]`;
  }
  if (part instanceof vscode.LanguageModelToolResultPart) {
    const inner = part.content.map(partText).filter(Boolean).join("\n");
    return inner ? `[Tool result ${part.callId}:\n${inner}]` : `[Tool result ${part.callId}: (empty)]`;
  }
  if (part instanceof vscode.LanguageModelDataPart) {
    return `[Attachment omitted: ${part.mimeType} (${part.data.byteLength} bytes) — non-text content not yet supported]`;
  }
  if (part !== null && typeof part === "object") {
    const text = (part as { value?: unknown }).value;
    if (typeof text === "string" && text) {
      return text;
    }
    const asText = (part as { text?: unknown }).text;
    if (typeof asText === "string" && asText) {
      return asText;
    }
  }
  return "";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "(unserializable)";
  } catch {
    return "(unserializable)";
  }
}

/** Visible text of one chat message (all parts joined). */
export function messageText(message: vscode.LanguageModelChatRequestMessage): string {
  return message.content.map(partText).filter(Boolean).join("\n");
}

/** True when any message carries tool-call or tool-result parts. */
export function hasToolParts(messages: readonly vscode.LanguageModelChatRequestMessage[]): boolean {
  for (const message of messages) {
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelToolCallPart || part instanceof vscode.LanguageModelToolResultPart) {
        return true;
      }
    }
  }
  return false;
}

export interface ExtractedToolResult {
  callId: string;
  text: string;
}

/**
 * Collect host-executed tool results (User messages carrying
 * `LanguageModelToolResultPart`). Text-serialized for executor replies;
 * image/data parts become placeholders (multimodal deferred).
 */
export function extractToolResults(messages: readonly vscode.LanguageModelChatRequestMessage[]): ExtractedToolResult[] {
  const out: ExtractedToolResult[] = [];
  for (const message of messages) {
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelToolResultPart) {
        out.push({ callId: part.callId, text: toolResultToText(part.content) });
      }
    }
  }
  return out;
}

/**
 * Build the prompt text for the current turn. History lives server-side, so
 * only the latest user message is sent; earlier turns are included as a
 * compact labeled transcript only when the latest message alone is empty.
 */
export function buildPromptText(messages: readonly vscode.LanguageModelChatRequestMessage[]): string {
  if (messages.length === 0) {
    return "Say hello.";
  }
  const latest = messages[messages.length - 1];
  const latestText = messageText(latest).trim();
  if (latestText) {
    return latestText;
  }
  const transcript = messages
    .map((message) => {
      const text = messageText(message).trim();
      return text ? `${roleLabel(message.role)}:\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return transcript || "Say hello.";
}
