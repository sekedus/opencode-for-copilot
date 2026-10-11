import * as vscode from "vscode";
import {
  capImages,
  dataPartImage,
  MAX_IMAGES_PER_TURN,
  MAX_IMAGE_BYTES,
  MAX_TURN_IMAGE_BYTES,
  omittedPlaceholder,
  promptFileForImage,
  toolFileForImage,
  type ImageBytes,
  type PromptFileAttachment,
  type ToolFilePart,
} from "./images";
import { isUsageDataPart } from "./usage";
import { MAX_RESULT_CHARS, toolResultToText } from "./tools";

/**
 * Convert Copilot chat messages to a single opencode prompt text.
 *
 * The engine owns conversation history server-side (1 conversation = 1
 * session), so only the current turn's text is sent with role labels.
 * Image data parts become short `[Image: …]` markers in the text with the
 * bytes riding `files` (T-0023); other non-text parts stay placeholders —
 * the bridge must never silently drop them.
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
    // Usage feed (T-0028): our own `usage`-mime parts echo back in history —
    // they are accounting, never prompt text. Drop them silently instead of
    // rendering an attachment placeholder into the engine prompt.
    if (isUsageDataPart(part)) {
      return "";
    }
    const image = dataPartImage(part);
    if (image) {
      return `[Image: ${image.mimeType} (${image.data.byteLength} bytes)]`;
    }
    const mime = typeof part.mimeType === "string" ? part.mimeType : "unknown";
    const bytes = typeof part.data?.byteLength === "number" ? part.data.byteLength : 0;
    return omittedPlaceholder(mime, bytes);
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
  /** Image files for the executor return (T-0023; empty when none). */
  files: ToolFilePart[];
}

function truncateResult(text: string): string {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated ${String(text.length - MAX_RESULT_CHARS)} chars by OCT bridge)`
    : text;
}

/**
 * Collect host-executed tool results (User messages carrying
 * `LanguageModelToolResultPart`). Text-serialized for executor replies;
 * image data parts ride `files` (T-0023, Q2 caps enforced per turn across
 * all results — oversize extras degrade to placeholders in `text`).
 */
export function extractToolResults(messages: readonly vscode.LanguageModelChatRequestMessage[]): ExtractedToolResult[] {
  // First pass: text + per-result images in appearance order.
  const perResult: Array<{ callId: string; texts: string[]; images: ImageBytes[] }> = [];
  for (const message of messages) {
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelToolResultPart) {
        const texts: string[] = [];
        const images: ImageBytes[] = [];
        for (const inner of part.content) {
          if (inner instanceof vscode.LanguageModelDataPart) {
            // Usage feed never rides tool results, but drop it silently if it
            // ever appears (T-0028) instead of placeholder noise in the text.
            if (isUsageDataPart(inner)) {
              continue;
            }
            const image = dataPartImage(inner);
            if (image) {
              images.push(image);
              continue;
            }
            const mime = typeof inner.mimeType === "string" ? inner.mimeType : "unknown";
            const bytes = typeof inner.data?.byteLength === "number" ? inner.data.byteLength : 0;
            texts.push(omittedPlaceholder(mime, bytes));
            continue;
          }
          const t = toolResultToText([inner]);
          if (t) {
            texts.push(t);
          }
        }
        perResult.push({ callId: part.callId, texts, images });
      }
    }
  }
  if (perResult.length === 0) {
    return [];
  }
  // Q2 caps apply across the whole turn in appearance order; each result
  // keeps its own kept-files and dropped-placeholders.
  let keptCount = 0;
  let keptBytes = 0;
  let marker = 0;
  return perResult.map((entry) => {
    const segments = [...entry.texts];
    const files: ToolFilePart[] = [];
    for (const image of entry.images) {
      const size = image.data.byteLength;
      if (
        size > MAX_IMAGE_BYTES ||
        keptCount >= MAX_IMAGES_PER_TURN ||
        keptBytes + size > MAX_TURN_IMAGE_BYTES
      ) {
        const reason =
          size > MAX_IMAGE_BYTES
            ? `exceeds ${MAX_IMAGE_BYTES} byte image cap`
            : `exceeds per-turn image cap (${MAX_IMAGES_PER_TURN} images / ${MAX_TURN_IMAGE_BYTES} bytes)`;
        segments.push(`[Attachment omitted: ${image.mimeType} (${size} bytes) — ${reason}]`);
        continue;
      }
      keptCount += 1;
      keptBytes += size;
      marker += 1;
      segments.push(`[Image ${marker}: ${image.mimeType} (${size} bytes)]`);
      const file = toolFileForImage(image);
      if (file) {
        files.push(file);
      } else {
        segments.push(omittedPlaceholder(image.mimeType, size));
      }
    }
    return { callId: entry.callId, text: truncateResult(segments.join("\n")), files };
  });
}

/**
 * Build the prompt text for the current turn. History lives server-side, so
 * only the latest user message is sent; earlier turns are included as a
 * compact labeled transcript only when the latest message alone is empty.
 */
export function buildPromptText(messages: readonly vscode.LanguageModelChatRequestMessage[]): string {
  return buildPromptWithImages(messages).text;
}

const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

function promptName(index: number, mime: string): string {
  return `image-${index}.${IMAGE_EXT[mime.toLowerCase()] ?? "bin"}`;
}

/**
 * Build the prompt text plus `files` for the current turn (T-0023).
 * Images come from the same messages that contribute the text (latest
 * only when it is non-empty, else the whole transcript fallback); Q2 caps
 * apply and dropped images degrade to placeholders in `text`.
 */
export function buildPromptWithImages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
  text: string;
  files: PromptFileAttachment[];
} {
  if (messages.length === 0) {
    return { text: "Say hello.", files: [] };
  }
  const latest = messages[messages.length - 1];
  const latestText = messageText(latest).trim();
  const contributing = latestText ? [latest] : messages;
  const textParts: string[] = [];
  if (latestText) {
    textParts.push(latestText);
  } else {
    const transcript = contributing
      .map((message) => {
        const text = messageText(message).trim();
        return text ? `${roleLabel(message.role)}:\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    textParts.push(transcript || "Say hello.");
  }
  // Collect attached images from the contributing messages, in order.
  const images: ImageBytes[] = [];
  for (const message of contributing) {
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelToolResultPart) {
        // Tool-result images ride the executor return, not the prompt.
        continue;
      }
      const image = dataPartImage(part);
      if (image) {
        images.push(image);
      } else if (part instanceof vscode.LanguageModelDataPart) {
        // Non-image attachments stay text-only placeholders (already in text).
        continue;
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        continue;
      }
    }
  }
  if (images.length === 0) {
    return { text: textParts.join("\n\n"), files: [] };
  }
  const capped = capImages(images);
  const kept = new Set(capped.kept);
  let text = textParts.join("\n\n");
  // Downgrade dropped image markers to their placeholders (first match each).
  for (const image of images) {
    if (!kept.has(image)) {
      const marker = `[Image: ${image.mimeType} (${image.data.byteLength} bytes)]`;
      const placeholder = omittedPlaceholder(image.mimeType, image.data.byteLength);
      const at = text.indexOf(marker);
      if (at >= 0) {
        text = text.slice(0, at) + placeholder + text.slice(at + marker.length);
      } else {
        text += `\n${placeholder}`;
      }
    }
  }
  // Number kept markers in order and build files.
  let marker = 0;
  for (const image of images) {
    if (kept.has(image)) {
      marker += 1;
      const generic = `[Image: ${image.mimeType} (${image.data.byteLength} bytes)]`;
      const numbered = `[Image ${marker}: ${image.mimeType} (${image.data.byteLength} bytes)]`;
      const at = text.indexOf(generic);
      if (at >= 0) {
        text = text.slice(0, at) + numbered + text.slice(at + generic.length);
      }
    }
  }
  const files: PromptFileAttachment[] = [];
  marker = 0;
  for (const image of images) {
    if (kept.has(image)) {
      marker += 1;
      const named: ImageBytes = { ...image, name: image.name ?? promptName(marker, image.mimeType) };
      files.push(promptFileForImage(named));
    }
  }
  return { text, files };
}
