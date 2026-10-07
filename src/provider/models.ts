import * as vscode from "vscode";
import type { ModelInfo } from "../server/client";

/**
 * Picker model for the OCT provider. Extends the VS Code chat information
 * with the engine coordinates needed for `session.create` / `session.switchModel`.
 */
export interface OctModel extends vscode.LanguageModelChatInformation {
  /** Engine provider, e.g. `anthropic`. */
  providerID: string;
  /** Engine model alias (`Model.Info.id`), e.g. `claude-sonnet-4-5`. */
  modelID: string;
  /** Picker visibility hint (proposed chatProvider API; treated as true when omitted). */
  isUserSelectable?: boolean;
  /**
   * Per-model configure control (proposed chatProvider API — stable
   * `@types/vscode` lacks it, declared here like `isUserSelectable` so the
   * runtime host can read it off the returned object).
   */
  configurationSchema?: OctConfigurationSchema;
  /**
   * Advertised engine variant ids (`Model.Info.variants[]`, normalized).
   * Never shown in the picker; used to validate the user's Thinking Effort
   * pick before sending it as `Model.Ref.variant`.
   */
  variantIds?: string[];
}

/**
 * Minimal local shape for the proposed `LanguageModelConfigurationSchema`
 * (see `vscode.proposed.chatProvider.d.ts`): JSON Schema properties plus
 * the picker's display hints (`enumItemLabels`, `group: 'navigation'`).
 */
export interface OctConfigurationSchemaProperty {
  type: string;
  title?: string;
  enum?: string[];
  enumItemLabels?: string[];
  enumDescriptions?: string[];
  default?: string;
  group?: string;
  [key: string]: unknown;
}

export interface OctConfigurationSchema {
  properties?: Record<string, OctConfigurationSchemaProperty>;
}

/** Fallback limits when the engine omits them. */
const FALLBACK_INPUT_TOKENS = 128_000;
const FALLBACK_OUTPUT_TOKENS = 32_000;

/** Build a stable picker id: `<providerID>/<modelID>`. */
export function octPickerId(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`;
}

/** Parse a picker id back into engine coordinates. Returns undefined when malformed. */
export function parseOctPickerId(pickerId: string): { providerID: string; modelID: string } | undefined {
  const slash = pickerId.indexOf("/");
  if (slash <= 0 || slash >= pickerId.length - 1) {
    return undefined;
  }
  return { providerID: pickerId.slice(0, slash), modelID: pickerId.slice(slash + 1) };
}

/**
 * Normalize engine `Model.Info.variants[]` to a clean id list (T-0021).
 * Tolerant: missing/malformed entries yield no control, never a picker crash.
 * Trims, drops empties, dedupes preserving engine order.
 */
export function normalizeVariantIds(variants: unknown): string[] {
  if (!Array.isArray(variants)) {
    return [];
  }
  const out: string[] = [];
  for (const item of variants) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const id = (item as Record<string, unknown>)["id"];
    if (typeof id !== "string") {
      continue;
    }
    const trimmed = id.trim();
    if (trimmed && !out.includes(trimmed)) {
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Pick the schema default effort (T-0021, mirrors Copilot's
 * `pickDefaultReasoningEffort`): claude/kimi-k3 families prefer `high`,
 * others prefer `medium`, else the first advertised level. Empty → undefined
 * (caller attaches no control).
 */
export function pickDefaultReasoningEffort(effortLevels: readonly string[], family: string): string | undefined {
  if (effortLevels.length === 0) {
    return undefined;
  }
  const lowerFamily = family.toLowerCase();
  const preferred = lowerFamily.startsWith("claude") || lowerFamily.includes("kimi-k3") ? "high" : "medium";
  if (effortLevels.includes(preferred)) {
    return preferred;
  }
  return effortLevels[0];
}

/** Picker label for an effort level (mirrors Copilot's helper; unknown → capitalized). */
export function getReasoningEffortLabel(level: string): string {
  switch (level) {
    case "none":
      return "None";
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Xigh";
    case "max":
      return "Max";
    default:
      return level.charAt(0).toUpperCase() + level.slice(1);
  }
}

/** Picker description for an effort level (mirrors Copilot's helper; unknown → raw level). */
export function getReasoningEffortDescription(level: string): string {
  switch (level) {
    case "none":
      return "No reasoning applied";
    case "minimal":
      return "Minimal reasoning for fastest responses";
    case "low":
      return "Faster responses with less reasoning";
    case "medium":
      return "Balanced reasoning and speed";
    case "high":
      return "Greater reasoning depth but slower";
    case "xhigh":
      return "Highest reasoning depth but slowest";
    case "max":
      return "Absolute maximum capability with no constraints";
    default:
      return level;
  }
}

/**
 * Build the `reasoningEffort` schema property for a model's
 * `configurationSchema` (T-0021, mirrors Copilot's
 * `buildReasoningEffortSchemaProperty`): `group: 'navigation'` renders it as
 * the primary `...` picker action ("Thinking Effort").
 */
export function buildReasoningEffortSchemaProperty(
  effortLevels: readonly string[],
  family: string,
): OctConfigurationSchemaProperty {
  return {
    type: "string",
    title: "Thinking Effort",
    enum: [...effortLevels],
    enumItemLabels: effortLevels.map(getReasoningEffortLabel),
    enumDescriptions: effortLevels.map(getReasoningEffortDescription),
    default: pickDefaultReasoningEffort(effortLevels, family),
    group: "navigation",
  };
}

/**
 * Validate the user's Thinking Effort pick against the model's advertised
 * variants (T-0021). Returns the variant to send, or undefined to omit
 * (engine default) when absent/unknown — never throws, never invents ids.
 */
export function resolveReasoningEffort(picked: unknown, advertised: readonly string[] | undefined): string | undefined {
  if (typeof picked !== "string" || !picked) {
    return undefined;
  }
  if (!Array.isArray(advertised) || !advertised.includes(picked)) {
    return undefined;
  }
  return picked;
}

function toOctModel(info: ModelInfo): OctModel | undefined {
  if (!info || typeof info.id !== "string" || !info.id || typeof info.providerID !== "string" || !info.providerID) {
    return undefined;
  }
  if (info.enabled === false) {
    return undefined;
  }
  const maxOutput = info.limit?.output && info.limit.output > 0 ? info.limit.output : FALLBACK_OUTPUT_TOKENS;
  const maxInput =
    info.limit?.input && info.limit.input > 0
      ? info.limit.input
      : info.limit?.context && info.limit.context > 0
        ? Math.max(1024, info.limit.context - maxOutput)
        : FALLBACK_INPUT_TOKENS;
  const name = typeof info.name === "string" && info.name ? info.name : info.id;
  const family = typeof info.family === "string" && info.family ? info.family : info.providerID;
  // Vision: opencode marks image input with the "image" modality
  // (schema default `input: ["text","image"]`; vocabulary
  // "text"|"audio"|"image"|"video"|"pdf"). Advertises the chat attachment UI;
  // transport stays provider-side (attachments still placeholders).
  const inputs = info.capabilities?.input;
  const imageInput = Array.isArray(inputs) && inputs.includes("image");
  // Thinking Effort (T-0021): exactly one picker entry per model. When the
  // engine reports variants, attach the configure-model control offering only
  // the reported ids; models without variants get no control.
  const variantIds = normalizeVariantIds(info.variants);
  const configurationSchema =
    variantIds.length > 0
      ? { properties: { reasoningEffort: buildReasoningEffortSchemaProperty(variantIds, family) } }
      : undefined;
  return {
    id: octPickerId(info.providerID, info.id),
    name: `OCT / ${name}`,
    family,
    version: "1.0.0",
    detail: `OCT · ${info.providerID}`,
    tooltip: `OCT model ${info.providerID}/${info.id}`,
    maxInputTokens: maxInput,
    maxOutputTokens: maxOutput,
    // Picker lists only models with toolCalling=true for agent chat.
    // Tools execute via the bridge (see octProvider); definitions without
    // a bridge get a notice.
    capabilities: { toolCalling: true, imageInput },
    isUserSelectable: true,
    providerID: info.providerID,
    modelID: info.id,
    ...(configurationSchema === undefined ? {} : { configurationSchema }),
    ...(variantIds.length === 0 ? {} : { variantIds }),
  };
}

/** Map engine `Model.Info` list to picker entries. Skips malformed/disabled entries. */
export function toOctModels(data: ModelInfo[] | undefined): OctModel[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const out: OctModel[] = [];
  for (const info of data) {
    const mapped = toOctModel(info);
    if (mapped) {
      out.push(mapped);
    }
  }
  return out;
}
