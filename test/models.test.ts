import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ModelInfo } from "../src/server/client";
import { octPickerId, parseOctPickerId, toOctModels } from "../src/provider/models";

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
