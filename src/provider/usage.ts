import * as vscode from "vscode";
import { parseSessionTokens, sessionModelRef, sessionTokensTotal, type ModelInfo, type SessionTokens } from "../server/client";

/**
 * Session usage feed (T-0028, pure except the DataPart constructor).
 *
 * The engine reports cumulative token accounting on `Session.Info.tokens`
 * (`input/output/reasoning/cache.read/cache.write`, see
 * `@opencode/schema/token-usage`); VS Code core owns the Session Info popup
 * and reads the numerator from a `usage`-mime `LanguageModelDataPart`
 * (`{prompt_tokens, completion_tokens, total_tokens}`, same shape the
 * `opencode-copilot-chat` reference emits and the agent-host BYOK handler
 * decodes). The denominator (context window) comes from the model metadata
 * the provider already reports (`maxInputTokens + maxOutputTokens`), so the
 * payload carries totals only — never limits.
 *
 * Mapping (mirrors the engine cost model in `session/usage.ts`):
 * - prompt = input + cache.read + cache.write (all input-side)
 * - completion = output + reasoning (all output-side)
 * - total = sum of all five (matches `TokenUsage.total`)
 * - cached = cache.read + cache.write (for `prompt_tokens_details`)
 */

export const USAGE_DATA_MIME = "usage";

export interface UsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
}

export interface ProviderUsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

/** True for our own usage DataParts (never prompt text, never token-counted). */
export function isUsageDataPart(part: unknown): boolean {
  return part instanceof vscode.LanguageModelDataPart && part.mimeType === USAGE_DATA_MIME;
}

/** Convert parsed engine tokens to a Copilot usage snapshot. */
export function snapshotFromTokens(tokens: SessionTokens): UsageSnapshot {
  const promptTokens = tokens.input + tokens.cache.read + tokens.cache.write;
  const completionTokens = tokens.output + tokens.reasoning;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    cachedTokens: tokens.cache.read + tokens.cache.write,
  };
}

/** Parse + convert in one step (session list/get items, tolerant). */
export function snapshotFromSessionInfo(info: unknown): UsageSnapshot {
  return snapshotFromTokens(parseSessionTokens(info));
}

/** True when the snapshot carries reportable usage (guards the 0% emit). */
export function hasUsageSnapshot(snapshot: UsageSnapshot): boolean {
  return snapshot.totalTokens > 0 && (snapshot.promptTokens > 0 || snapshot.completionTokens > 0);
}

/** Shape the wire payload (totals are the guarantee; cached is best-effort). */
export function toUsagePayload(snapshot: UsageSnapshot): ProviderUsagePayload | undefined {
  const total = snapshot.promptTokens + snapshot.completionTokens;
  const normalized: UsageSnapshot = { ...snapshot, totalTokens: snapshot.totalTokens > 0 ? snapshot.totalTokens : total };
  if (!hasUsageSnapshot(normalized)) {
    return undefined;
  }
  return {
    prompt_tokens: normalized.promptTokens,
    completion_tokens: normalized.completionTokens,
    total_tokens: normalized.totalTokens,
    ...(normalized.cachedTokens > 0 ? { prompt_tokens_details: { cached_tokens: normalized.cachedTokens } } : {}),
  };
}

/**
 * Build the `usage`-mime DataParts for a turn (empty when nothing to report).
 * Never throws for unstringifiable input — callers treat [] as "skip".
 */
export function createUsageDataParts(snapshot: UsageSnapshot): vscode.LanguageModelDataPart[] {
  const payload = toUsagePayload(snapshot);
  if (!payload) {
    return [];
  }
  try {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    return [new vscode.LanguageModelDataPart(data, USAGE_DATA_MIME)];
  } catch {
    return [];
  }
}

/** Read back a usage payload (tests + diagnostics; tolerant, never throws). */
export function parseUsagePayload(data: Uint8Array): ProviderUsagePayload | undefined {
  try {
    const raw = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
    if (typeof raw !== "object" || raw === null) {
      return undefined;
    }
    const num = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
    const prompt = num(raw["prompt_tokens"]);
    const completion = num(raw["completion_tokens"]);
    const total = num(raw["total_tokens"]);
    if (prompt === undefined && completion === undefined && total === undefined) {
      return undefined;
    }
    return {
      ...(prompt === undefined ? {} : { prompt_tokens: prompt }),
      ...(completion === undefined ? {} : { completion_tokens: completion }),
      ...(total === undefined ? {} : { total_tokens: total }),
    };
  } catch {
    return undefined;
  }
}

/** Compact token count (`12.3k`, `1.2M`); mirrors the reference formatter. */
export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0";
  }
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (value >= 1_000_000_000) {
    const v = Math.round((value / 1_000_000_000) * 10) / 10;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}T` : `${String(v)}B`;
  }
  if (value >= 1_000_000) {
    const v = Math.round((value / 1_000_000) * 10) / 10;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}B` : `${String(v)}M`;
  }
  if (value >= 10_000) {
    const k = Math.round(value / 1000);
    return k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${String(k)}k`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.floor(value));
}

/** Integer context-fill percent (0 when the limit is unknown/non-positive). */
export function usagePercent(used: number, limit: number | undefined): number | undefined {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }
  if (!Number.isFinite(used) || used < 0) {
    return 0;
  }
  return Math.round((used / limit) * 100);
}

export interface ModelLimit {
  context: number;
  /** Optional engine `limit.input` — when present it overrides `context - output` (mirrors `toOctModels`). */
  input?: number;
  output: number;
}

/**
 * Effective context denominator matching what VS Code core uses for the
 * Session Info popup: core divides by `maxInputTokens + maxOutputTokens`,
 * and the picker (`toOctModels`) reports `maxInputTokens = limit.input`
 * when present, else `limit.context - limit.output`. Using `limit.context`
 * directly overstates the window for models that advertise a smaller input
 * (EDH 2026-10-11: `big-pickle` reports `{context: 200k, input: 160k,
 * output: 32k}` — the popup shows 192K while status showed 200k).
 */
export function effectiveContextLimit(limit: ModelLimit): number {
  if (limit.input !== undefined && Number.isFinite(limit.input) && limit.input > 0) {
    return Math.floor(limit.input) + limit.output;
  }
  return limit.context;
}

/**
 * Index engine model limits by picker coordinates (T-0028, pure):
 * key `${providerID}/${id}` → `{context, input?, output}` (positive finite
 * only). Entries with missing/non-positive limits are skipped (caller reports
 * "limit unknown" instead of inventing a denominator).
 */
export function buildModelLimitMap(models: readonly ModelInfo[] | undefined): Map<string, ModelLimit> {
  const out = new Map<string, ModelLimit>();
  if (!Array.isArray(models)) {
    return out;
  }
  for (const info of models) {
    if (!info || typeof info.id !== "string" || !info.id || typeof info.providerID !== "string" || !info.providerID) {
      continue;
    }
    const limit = info.limit;
    if (typeof limit !== "object" || limit === null) {
      continue;
    }
    const record = limit as Record<string, unknown>;
    const context = record["context"];
    const output = record["output"];
    if (
      typeof context !== "number" ||
      !Number.isFinite(context) ||
      context <= 0 ||
      typeof output !== "number" ||
      !Number.isFinite(output) ||
      output <= 0
    ) {
      continue;
    }
    const input = record["input"];
    const entry: ModelLimit =
      typeof input === "number" && Number.isFinite(input) && input > 0
        ? { context: Math.floor(context), input: Math.floor(input), output: Math.floor(output) }
        : { context: Math.floor(context), output: Math.floor(output) };
    out.set(`${info.providerID}/${info.id}`, entry);
  }
  return out;
}

/**
 * Resolve the limit for one session: prefer the engine-reported
 * `Session.Info.model` ref, fall back to parsing the map's modelKey
 * (`<provider>/<id>[#variant]`). Returns undefined when unresolvable.
 */
export function limitForSession(
  limits: ReadonlyMap<string, ModelLimit>,
  info: unknown,
  modelKey: string,
): ModelLimit | undefined {
  const ref = sessionModelRef(info);
  if (ref) {
    const hit = limits.get(`${ref.providerID}/${ref.id}`);
    if (hit) {
      return hit;
    }
  }
  const hash = modelKey.indexOf("#");
  const base = (hash >= 0 ? modelKey.slice(0, hash) : modelKey).trim();
  if (base) {
    const hit = limits.get(base);
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

/**
 * One-line usage cell for status/table (T-0028, pure):
 * `12.3k / 200k (6%) · out 1.2k / 32k (4%)`.
 * The context denominator is the effective window core uses
 * (`limit.input + output` when the engine advertises `input`, else
 * `limit.context`), so status/table agree with the Session Info popup.
 * Unknown limits degrade to `12.3k used (limit unknown)` — never invented.
 * Zero usage yields `no usage yet`.
 */
export function formatUsageCell(snapshot: UsageSnapshot, limit: ModelLimit | undefined): string {
  if (!hasUsageSnapshot(snapshot)) {
    return "no usage yet";
  }
  const used = snapshot.promptTokens + snapshot.completionTokens;
  if (!limit) {
    return `${formatTokenCount(used)} used (limit unknown)`;
  }
  const context = effectiveContextLimit(limit);
  const pct = usagePercent(used, context);
  const outPct = usagePercent(snapshot.completionTokens, limit.output);
  const left = `${formatTokenCount(used)} / ${formatTokenCount(context)}${pct === undefined ? "" : ` (${String(pct)}%)`}`;
  const right =
    `out ${formatTokenCount(snapshot.completionTokens)} / ${formatTokenCount(limit.output)}` +
    `${outPct === undefined ? "" : ` (${String(outPct)}%)`}`;
  return `${left} · ${right}`;
}

/** Total used tokens (re-export for callers that only need the numerator). */
export function usedTokensTotal(info: unknown): number {
  return sessionTokensTotal(parseSessionTokens(info));
}
