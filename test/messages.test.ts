import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import { buildPromptText, messageText, partText } from "../src/provider/messages";

const Role = vscode.LanguageModelChatMessageRole;

function textMessage(
  role: vscode.LanguageModelChatMessageRole,
  text: string,
): vscode.LanguageModelChatRequestMessage {
  return {
    role,
    content: [new vscode.LanguageModelTextPart(text)],
  } as unknown as vscode.LanguageModelChatRequestMessage;
}

describe("partText", () => {
  it("passes strings and TextParts through", () => {
    assert.equal(partText("raw"), "raw");
    assert.equal(partText(new vscode.LanguageModelTextPart("hi")), "hi");
  });

  it("summarizes tool-call parts (never silent)", () => {
    const out = partText(new vscode.LanguageModelToolCallPart("c1", "grep", { q: "x" }));
    assert.ok(out.includes("grep") && out.includes('"q":"x"'));
  });

  it("serializes tool results with call id", () => {
    const out = partText(
      new vscode.LanguageModelToolResultPart("c1", [new vscode.LanguageModelTextPart("found it")]),
    );
    assert.ok(out.includes("c1") && out.includes("found it"));
  });

  it("marks empty tool results explicitly", () => {
    assert.equal(partText(new vscode.LanguageModelToolResultPart("c9", [])), "[Tool result c9: (empty)]");
  });

  it("replaces data parts with a placeholder", () => {
    const out = partText(new vscode.LanguageModelDataPart(Buffer.from([1, 2, 3]), "image/png"));
    assert.ok(out.includes("image/png") && out.includes("3 bytes"));
  });

  it("reads value/text-shaped plain objects, else empty", () => {
    assert.equal(partText({ value: "v" }), "v");
    assert.equal(partText({ text: "t" }), "t");
    assert.equal(partText(42), "");
    assert.equal(partText(null), "");
  });
});

describe("messageText", () => {
  it("joins parts with newlines, skipping empties", () => {
    const message = {
      role: Role.User,
      content: [new vscode.LanguageModelTextPart("a"), "", new vscode.LanguageModelTextPart("b")],
    } as unknown as vscode.LanguageModelChatRequestMessage;
    assert.equal(messageText(message), "a\nb");
  });
});

describe("buildPromptText", () => {
  it("greets on empty history", () => {
    assert.equal(buildPromptText([]), "Say hello.");
  });

  it("sends the latest message text", () => {
    assert.equal(
      buildPromptText([textMessage(Role.User, "first"), textMessage(Role.User, "second")]),
      "second",
    );
  });

  it("falls back to a labeled transcript when latest is empty", () => {
    const out = buildPromptText([
      textMessage(Role.User, "q"),
      textMessage(Role.Assistant, "a"),
      textMessage(Role.User, "   "),
    ]);
    assert.ok(out.includes("USER:\nq") && out.includes("ASSISTANT:\na"));
  });

  it("greets when nothing has text", () => {
    assert.equal(buildPromptText([textMessage(Role.User, "  ")]), "Say hello.");
  });
});
