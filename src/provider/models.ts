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
  return {
    id: octPickerId(info.providerID, info.id),
    name,
    family,
    version: "1.0.0",
    detail: `OCT · ${info.providerID}`,
    tooltip: `OCT model ${info.providerID}/${info.id}`,
    maxInputTokens: maxInput,
    maxOutputTokens: maxOutput,
    // Picker lists only models with toolCalling=true for agent chat.
    // Tools execute via the bridge (see octProvider); definitions without
    // a bridge get a notice.
    capabilities: { toolCalling: true, imageInput: false },
    isUserSelectable: true,
    providerID: info.providerID,
    modelID: info.id,
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
