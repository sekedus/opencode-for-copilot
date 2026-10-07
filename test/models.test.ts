import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ModelInfo } from "../src/server/client";
import {
  buildReasoningEffortSchemaProperty,
  getReasoningEffortDescription,
  getReasoningEffortLabel,
  normalizeVariantIds,
  octPickerId,
  parseOctPickerId,
  pickDefaultReasoningEffort,
  resolveReasoningEffort,
  toOctModels,
} from "../src/provider/models";

/** Picker display (T-0014): `OCT / <name>` branding + vision capability
 *  from the engine `capabilities.input` modalities. */

function info(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: "claude-sonnet-4-5",
    modelID: "anthropic/claude-sonnet-4-5",
    providerID: "anthropic",
    name: "Claude Sonnet 4.5",
    ...overrides,
  };
}

describe("toOctModels", () => {
  it("brands the display name as OCT / <name>", () => {
    const [model] = toOctModels([info()]);
    assert.equal(model.name, "OCT / Claude Sonnet 4.5");
    assert.equal(model.id, octPickerId("anthropic", "claude-sonnet-4-5"));
  });

  it("falls back to the model id when the engine omits the name", () => {
    const [model] = toOctModels([info({ name: undefined })]);
    assert.equal(model.name, "OCT / claude-sonnet-4-5");
  });

  it("sets imageInput for vision-capable engine models", () => {
    const [model] = toOctModels([info({ capabilities: { tools: true, input: ["text", "image"], output: ["text"] } })]);
    assert.equal(model.capabilities?.imageInput, true);
    assert.equal(model.capabilities?.toolCalling, true);
  });

  it("leaves imageInput false for text-only or unknown capabilities", () => {
    const [textOnly] = toOctModels([info({ capabilities: { tools: true, input: ["text"], output: ["text"] } })]);
    assert.equal(textOnly.capabilities?.imageInput, false);
    const [missing] = toOctModels([info({ capabilities: undefined })]);
    assert.equal(missing.capabilities?.imageInput, false);
  });

  it("still skips malformed and disabled entries", () => {
    assert.deepEqual(toOctModels(undefined), []);
    assert.deepEqual(toOctModels([info({ enabled: false })]), []);
    assert.deepEqual(toOctModels([{ ...info(), id: "" }]), []);
  });

  it("picker ids round-trip engine coordinates", () => {
    assert.deepEqual(parseOctPickerId(octPickerId("anthropic", "claude-sonnet-4-5")), {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
    });
    assert.equal(parseOctPickerId("malformed"), undefined);
  });
});

describe("normalizeVariantIds", () => {
  it("keeps clean ids in engine order", () => {
    assert.deepEqual(normalizeVariantIds([{ id: "low" }, { id: "medium" }, { id: "high" }]), [
      "low",
      "medium",
      "high",
    ]);
  });

  it("trims, drops empties and non-objects, dedupes", () => {
    assert.deepEqual(normalizeVariantIds([{ id: " high " }, { id: "" }, { id: "  " }, null, "high", 42, { id: "high" }, {}]), [
      "high",
    ]);
  });

  it("tolerates missing and non-array input (no control, never crash)", () => {
    for (const bad of [undefined, null, "high", 42, {}, { id: "low" }]) {
      assert.deepEqual(normalizeVariantIds(bad), []);
    }
  });
});

describe("thinking-effort configure control (T-0021)", () => {
  it("attaches exactly one entry with the control when variants are reported", () => {
    const models = toOctModels([info({ variants: [{ id: "low" }, { id: "medium" }, { id: "high" }] })]);
    assert.equal(models.length, 1);
    const [model] = models;
    assert.equal(model.id, octPickerId("anthropic", "claude-sonnet-4-5"));
    const prop = model.configurationSchema?.properties?.["reasoningEffort"];
    assert.ok(prop, "control attached");
    assert.equal(prop.type, "string");
    assert.equal(prop.title, "Thinking Effort");
    assert.deepEqual(prop.enum, ["low", "medium", "high"]);
    assert.equal(prop.enumItemLabels?.length, 3);
    assert.equal(prop.enumDescriptions?.length, 3);
    assert.equal(prop.group, "navigation");
    assert.deepEqual(model.variantIds, ["low", "medium", "high"]);
  });

  it("exposes no control for models without usable variants", () => {
    const bad: unknown[] = [undefined, [], [{ id: "" }], [{ id: "  " }], [{ nope: 1 }], [null], ["high"], "high", 42];
    for (const variants of bad) {
      const [model] = toOctModels([info({ variants: variants as ModelInfo["variants"] })]);
      assert.equal(model.configurationSchema, undefined, `no schema for ${JSON.stringify(variants)}`);
      assert.equal(model.variantIds, undefined, `no variant ids for ${JSON.stringify(variants)}`);
    }
  });

  it("never emits variant-coded picker ids or extra rows", () => {
    const models = toOctModels([
      info({ id: "a", variants: [{ id: "low" }, { id: "high" }] }),
      info({ id: "b" }),
    ]);
    assert.deepEqual(models.map((m) => m.id), [octPickerId("anthropic", "a"), octPickerId("anthropic", "b")]);
    assert.ok(!models.some((m) => m.id.includes("#")), "no #variant in picker ids");
  });

  it("picks claude→high, other→medium, else first advertised", () => {
    assert.equal(pickDefaultReasoningEffort(["low", "medium", "high"], "claude"), "high");
    assert.equal(pickDefaultReasoningEffort(["low", "medium", "high"], "Claude-Sonnet"), "high");
    assert.equal(pickDefaultReasoningEffort(["low", "medium", "high"], "kimi-k3"), "high");
    assert.equal(pickDefaultReasoningEffort(["low", "medium", "high"], "gpt-5"), "medium");
    assert.equal(pickDefaultReasoningEffort(["low", "xhigh"], "gpt-5"), "low");
    assert.equal(pickDefaultReasoningEffort(["low", "medium"], "claude-haiku"), "low");
    assert.equal(pickDefaultReasoningEffort([], "gpt-5"), undefined);
  });

  it("schema default follows the same rule (never undefined for non-empty)", () => {
    assert.equal(buildReasoningEffortSchemaProperty(["low", "high"], "unknown-family").default, "low");
    assert.equal(buildReasoningEffortSchemaProperty(["low", "medium", "high"], "anthropic").default, "medium");
    assert.equal(buildReasoningEffortSchemaProperty(["low", "medium", "high"], "claude").default, "high");
  });

  it("labels known levels, capitalizes unknown ones", () => {
    assert.equal(getReasoningEffortLabel("high"), "High");
    assert.equal(getReasoningEffortLabel("xhigh"), "Xigh");
    assert.equal(getReasoningEffortLabel("max"), "Max");
    assert.equal(getReasoningEffortLabel("turbo"), "Turbo");
    assert.equal(getReasoningEffortDescription("medium"), "Balanced reasoning and speed");
    assert.equal(getReasoningEffortDescription("turbo"), "turbo");
  });
});

describe("resolveReasoningEffort", () => {
  const advertised = ["low", "medium", "high"];

  it("accepts a reported id", () => {
    assert.equal(resolveReasoningEffort("high", advertised), "high");
  });

  it("rejects unknown, absent, and non-string picks (omit = engine default)", () => {
    assert.equal(resolveReasoningEffort("ultra", advertised), undefined);
    assert.equal(resolveReasoningEffort(undefined, advertised), undefined);
    assert.equal(resolveReasoningEffort("", advertised), undefined);
    assert.equal(resolveReasoningEffort(42, advertised), undefined);
    assert.equal(resolveReasoningEffort("high", undefined), undefined);
    assert.equal(resolveReasoningEffort("high", []), undefined);
  });
});
