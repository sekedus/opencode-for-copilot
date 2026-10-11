import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import { parseSessionTokens, sessionModelRef, sessionTokensTotal } from "../src/server/client";
import {
  buildModelLimitMap,
  createUsageDataParts,
  effectiveContextLimit,
  formatTokenCount,
  formatUsageCell,
  hasUsageSnapshot,
  isUsageDataPart,
  limitForSession,
  parseUsagePayload,
  snapshotFromSessionInfo,
  snapshotFromTokens,
  toUsagePayload,
  USAGE_DATA_MIME,
} from "../src/provider/usage";
import { partText } from "../src/provider/messages";
import { buildSessionTableGroups, renderSessionsHtml } from "../src/provider/sessionTable";

describe("parseSessionTokens (T-0028)", () => {
  it("reads the live TokenUsage.Info shape", () => {
    const info = {
      id: "ses_x",
      tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 1000, write: 50 } },
    };
    assert.deepEqual(parseSessionTokens(info), {
      input: 100,
      output: 20,
      reasoning: 5,
      cache: { read: 1000, write: 50 },
    });
    assert.equal(sessionTokensTotal(parseSessionTokens(info)), 1175);
  });

  it("tolerates missing/malformed fields as zero (never throws)", () => {
    assert.deepEqual(parseSessionTokens({}), {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    });
    assert.deepEqual(parseSessionTokens(null), {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    });
    assert.deepEqual(parseSessionTokens({ tokens: { input: -5, output: "x", cache: null } }), {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    });
  });
});

describe("sessionModelRef (T-0028)", () => {
  it("reads Model.Ref coordinates", () => {
    assert.deepEqual(sessionModelRef({ model: { id: "m", providerID: "p", variant: "high" } }), {
      id: "m",
      providerID: "p",
      variant: "high",
    });
    assert.deepEqual(sessionModelRef({ model: { id: "m", providerID: "p" } }), { id: "m", providerID: "p" });
  });

  it("yields undefined when absent/malformed", () => {
    assert.equal(sessionModelRef({}), undefined);
    assert.equal(sessionModelRef({ model: { id: "m" } }), undefined);
    assert.equal(sessionModelRef(null), undefined);
  });
});

describe("usage snapshot math (T-0028)", () => {
  it("maps engine fields to prompt/completion/total like the cost model", () => {
    const snap = snapshotFromTokens({ input: 100, output: 20, reasoning: 5, cache: { read: 1000, write: 50 } });
    assert.equal(snap.promptTokens, 1150);
    assert.equal(snap.completionTokens, 25);
    assert.equal(snap.totalTokens, 1175);
    assert.equal(snap.cachedTokens, 1050);
    assert.equal(hasUsageSnapshot(snap), true);
  });

  it("zero usage has no snapshot (skip the emit)", () => {
    const snap = snapshotFromSessionInfo({});
    assert.equal(hasUsageSnapshot(snap), false);
    assert.equal(toUsagePayload(snap), undefined);
    assert.deepEqual(createUsageDataParts(snap), []);
  });
});

describe("usage payload shaping (T-0028)", () => {
  it("emits prompt/completion/total plus cached details", () => {
    const snap = snapshotFromTokens({ input: 100, output: 20, reasoning: 5, cache: { read: 1000, write: 50 } });
    assert.deepEqual(toUsagePayload(snap), {
      prompt_tokens: 1150,
      completion_tokens: 25,
      total_tokens: 1175,
      prompt_tokens_details: { cached_tokens: 1050 },
    });
  });

  it("omits cached details when nothing was cached", () => {
    const snap = snapshotFromTokens({ input: 100, output: 20, reasoning: 0, cache: { read: 0, write: 0 } });
    assert.deepEqual(toUsagePayload(snap), {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    });
  });

  it("creates exactly one usage-mime DataPart with a parseable body", () => {
    const snap = snapshotFromTokens({ input: 182600, output: 1000, reasoning: 0, cache: { read: 0, write: 0 } });
    const parts = createUsageDataParts(snap);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].mimeType, USAGE_DATA_MIME);
    assert.equal(parts[0].mimeType, "usage");
    const back = parseUsagePayload(parts[0].data);
    assert.deepEqual(back, { prompt_tokens: 182600, completion_tokens: 1000, total_tokens: 183600 });
    assert.equal(isUsageDataPart(parts[0]), true);
  });

  it("ignores non-usage DataParts", () => {
    const image = new vscode.LanguageModelDataPart(Buffer.from([1, 2, 3]), "image/png");
    assert.equal(isUsageDataPart(image), false);
    assert.equal(isUsageDataPart("usage"), false);
  });
});

describe("usage prompt hygiene (T-0028)", () => {
  it("partText drops usage parts instead of placeholder noise", () => {
    const part = new vscode.LanguageModelDataPart(
      new TextEncoder().encode(JSON.stringify({ prompt_tokens: 10 })),
      "usage",
    );
    assert.equal(partText(part), "");
  });
});

describe("formatTokenCount (T-0028)", () => {
  it("compacts like the reference formatter", () => {
    assert.equal(formatTokenCount(999), "999");
    assert.equal(formatTokenCount(1000), "1.0k");
    assert.equal(formatTokenCount(12345), "12k");
    assert.equal(formatTokenCount(182600), "183k");
    assert.equal(formatTokenCount(1_000_000), "1M");
  });
});

describe("model limits + usage cell (T-0028)", () => {
  const limits = buildModelLimitMap([
    { id: "m", modelID: "m", providerID: "p", limit: { context: 200_000, output: 32_000 } },
    { id: "bad", modelID: "bad", providerID: "p", limit: { context: 0, output: 0 } },
  ]);

  it("indexes positive limits only (missing-limit fallback = unknown)", () => {
    assert.equal(limits.size, 1);
    assert.deepEqual(limits.get("p/m"), { context: 200_000, output: 32_000 });
  });

  it("prefers the engine model ref, falls back to the map modelKey incl. #variant", () => {
    const info = { model: { id: "m", providerID: "p" } };
    assert.deepEqual(limitForSession(limits, info, "other"), { context: 200_000, output: 32_000 });
    assert.deepEqual(limitForSession(limits, {}, "p/m#high"), { context: 200_000, output: 32_000 });
    assert.equal(limitForSession(limits, {}, "p/missing"), undefined);
  });

  it("formats used/context/output with percents; unknown limits degrade honestly", () => {
    const snap = snapshotFromTokens({ input: 180_000, output: 2600, reasoning: 0, cache: { read: 0, write: 0 } });
    assert.equal(
      formatUsageCell(snap, { context: 1_000_000, output: 32_000 }),
      "183k / 1M (18%) · out 2.6k / 32k (8%)",
    );
    assert.equal(formatUsageCell(snap, undefined), "183k used (limit unknown)");
    assert.equal(formatUsageCell(snapshotFromSessionInfo({}), undefined), "no usage yet");
  });

  it("prefers limit.input over limit.context (EDH 2026-10-11: big-pickle 192K, not 200k)", () => {
    // Live engine shape: {"context":200000,"input":160000,"output":32000}.
    // Core divides by maxInput+maxOutput (160k+32k=192k, the picker values),
    // so status/table must use the same denominator as the Session Info popup.
    const map = buildModelLimitMap([
      { id: "big-pickle", modelID: "big-pickle", providerID: "opencode", limit: { context: 200_000, input: 160_000, output: 32_000 } },
    ]);
    const limit = map.get("opencode/big-pickle");
    assert.deepEqual(limit, { context: 200_000, input: 160_000, output: 32_000 });
    assert.equal(effectiveContextLimit(limit!), 192_000);
    const snap = snapshotFromTokens({ input: 22_900, output: 35, reasoning: 0, cache: { read: 0, write: 0 } });
    assert.equal(formatUsageCell(snap, limit), "23k / 192k (12%) · out 35 / 32k (0%)");
  });
});

describe("session table usage column (T-0028)", () => {
  it("rows carry a usage cell resolved from info + limits", () => {
    const mapped = [{ key: "conv:a", sessionId: "ses_a", modelKey: "p/m", directory: "D:\\work" }];
    const infoById = new Map<string, unknown>([
      ["ses_a", { id: "ses_a", title: "t", tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 0, write: 0 } } }],
    ]);
    const limits = new Map([["p/m", { context: 1000, output: 100 }]]);
    const groups = buildSessionTableGroups(mapped, infoById, Date.now(), limits);
    assert.equal(groups[0].entries[0].usage, "120 / 1.0k (12%) · out 20 / 100 (20%)");
    const html = renderSessionsHtml(groups, 1, 0, "n".repeat(32));
    assert.ok(html.includes("<th>Tokens</th>"), "Tokens column header");
    assert.ok(html.includes("120 / 1.0k"), "usage cell renders");
  });

  it("unlisted ids keep no-usage-yet rows (never dropped)", () => {
    const mapped = [{ key: "conv:a", sessionId: "ses_missing", modelKey: "p/m" }];
    const groups = buildSessionTableGroups(mapped, new Map(), Date.now(), new Map());
    assert.equal(groups[0].entries[0].usage, "no usage yet");
    assert.equal(groups[0].entries[0].title, "(title unavailable)");
  });
});
