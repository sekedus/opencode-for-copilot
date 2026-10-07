import * as vscode from "vscode";

/**
 * Image-ferry helpers (T-0023).
 *
 * Two ingresses share one transport:
 * - User-attached images (`LanguageModelDataPart` in chat messages) ride
 *   the prompt `files` field (`data:` URI or `file://` shortcut).
 * - Bridged tool results (`view_image` et al.) ride the executor return
 *   (`Tool.Result` content `file` parts) via the shuttle resolve path.
 *
 * Caps (approved Q2, per-image tightened 20→15 MB 2026-10-07 after EDH:
 * the provider rejects >20 MB images model-side, <15 MB verified viewable).
 * Oversize/over-count images degrade to the text placeholder — the turn
 * still succeeds. Logs record names/sizes only, never bytes.
 */

export interface ImageBytes {
  data: Uint8Array;
  mimeType: string;
  name?: string;
}

/** Prompt `files[]` entry (`POST /api/session/:id/prompt`). No mime field. */
export interface PromptFileAttachment {
  uri: string;
  name?: string;
}

/** Executor/tool-result `file` part (`Tool.Result` content). */
export interface ToolFilePart {
  uri: string;
  mime: string;
  name?: string;
}

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGES_PER_TURN = 50;
export const MAX_TURN_IMAGE_BYTES = 40 * 1024 * 1024;

export function isImageMime(mime: unknown): mime is string {
  return typeof mime === "string" && mime.toLowerCase().startsWith("image/");
}

/** MIME + bytes of a `LanguageModelDataPart`-shaped value, or undefined. */
export function dataPartImage(part: unknown): ImageBytes | undefined {
  if (!(part instanceof vscode.LanguageModelDataPart)) {
    return undefined;
  }
  const mime = (part as { mimeType?: unknown }).mimeType;
  const data = (part as { data?: unknown }).data as Uint8Array | undefined;
  if (!isImageMime(mime) || !data || typeof data.byteLength !== "number" || data.byteLength === 0) {
    return undefined;
  }
  return { data, mimeType: mime };
}

export function dataUriFor(image: ImageBytes): string {
  const b64 = Buffer.from(image.data.buffer as ArrayBuffer, image.data.byteOffset, image.data.byteLength).toString(
    "base64",
  );
  return `data:${image.mimeType};base64,${b64}`;
}

/**
 * Inline captured bytes as a `data:` URI. Tool-result file parts MUST be
 * `data:` URIs — engine-native tools (`read`, MCP, browser) all return
 * `data:<mime>;base64,…` and the model provider rejects anything else
 * (EDH 2026-10-07: `file://` in executor content failed with
 * `invalid base64 in data URI`). `file://` stays valid only for prompt
 * `files`, which core materializes via `readFileAttachment`.
 */
export function toolFileForImage(image: ImageBytes): ToolFilePart | undefined {
  if (!isImageMime(image.mimeType) || image.data.byteLength === 0) {
    return undefined;
  }
  const uri = dataUriFor(image);
  if (!isValidDataUri(uri)) {
    return undefined;
  }
  return { uri, mime: image.mimeType, ...(image.name ? { name: image.name } : {}) };
}

/** Strict check mirroring the engine/provider data-URI validation. */
export function isValidDataUri(uri: string): boolean {
  const at = uri.indexOf(",");
  if (!uri.startsWith("data:") || !uri.includes(";base64,") || at < 0) {
    return false;
  }
  const b64 = uri.slice(at + 1);
  return b64.length > 0 && b64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(b64);
}

export function promptFileForImage(image: ImageBytes): PromptFileAttachment {
  return { uri: dataUriFor(image), ...(image.name ? { name: image.name } : {}) };
}

export interface CappedImages {
  kept: ImageBytes[];
  /** Placeholder lines for dropped images (join into prompt/result text). */
  droppedPlaceholders: string[];
  droppedBytes: number;
}

/**
 * Enforce Q2 caps over one turn's images, preserving order. Drops carry a
 * placeholder so the turn still succeeds with visible degradation.
 */
export function capImages(images: readonly ImageBytes[]): CappedImages {
  const kept: ImageBytes[] = [];
  const droppedPlaceholders: string[] = [];
  let droppedBytes = 0;
  let keptBytes = 0;
  for (const image of images) {
    const size = image.data.byteLength;
    if (size > MAX_IMAGE_BYTES) {
      droppedPlaceholders.push(
        `[Attachment omitted: ${image.mimeType} (${size} bytes) — exceeds ${MAX_IMAGE_BYTES} byte image cap]`,
      );
      droppedBytes += size;
      continue;
    }
    if (kept.length >= MAX_IMAGES_PER_TURN || keptBytes + size > MAX_TURN_IMAGE_BYTES) {
      droppedPlaceholders.push(
        `[Attachment omitted: ${image.mimeType} (${size} bytes) — exceeds per-turn image cap (${MAX_IMAGES_PER_TURN} images / ${MAX_TURN_IMAGE_BYTES} bytes)]`,
      );
      droppedBytes += size;
      continue;
    }
    kept.push(image);
    keptBytes += size;
  }
  return { kept, droppedPlaceholders, droppedBytes };
}

/** Short marker for a ferried image (text sidecar; bytes ride `files`). */
export function imageMarker(index: number, image: ImageBytes): string {
  const name = image.name ? ` ${image.name}` : "";
  return `[Image ${index}:${name} ${image.mimeType} (${image.data.byteLength} bytes)]`;
}

/** Legacy placeholder for non-image / unferryable data parts. */
export function omittedPlaceholder(mimeType: string, bytes: number): string {
  return `[Attachment omitted: ${mimeType} (${bytes} bytes) — non-text content not yet supported]`;
}
