import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  buildPromptText,
  buildPromptWithImages,
  extractToolResults,
  messageText,
  partText,
} from "../src/provider/messages";

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

  it("marks image data parts with a marker (bytes ride files)", () => {
    const out = partText(new vscode.LanguageModelDataPart(Buffer.from([1, 2, 3]), "image/png"));
    assert.ok(out.includes("[Image:") && out.includes("image/png") && out.includes("3 bytes"));
  });

  it("keeps the placeholder for non-image data parts", () => {
    const out = partText(new vscode.LanguageModelDataPart(Buffer.from([1, 2, 3]), "application/pdf"));
    assert.ok(out.includes("Attachment omitted") && out.includes("application/pdf"));
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

describe("extractToolResults (T-0023 image ferry)", () => {
  function imageResult(callId: string, bytes: number[], mime = "image/png"): vscode.LanguageModelChatRequestMessage {
    return {
      role: Role.User,
      content: [new vscode.LanguageModelToolResultPart(callId, [new vscode.LanguageModelDataPart(Buffer.from(bytes), mime)])],
    } as unknown as vscode.LanguageModelChatRequestMessage;
  }

  it("carries image bytes as data: URI files with a text marker", () => {
    const [result] = extractToolResults([imageResult("c1", [1, 2, 3])]);
    assert.equal(result.callId, "c1");
    assert.ok(result.text.includes("[Image 1: image/png (3 bytes)]"));
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].mime, "image/png");
    assert.ok(result.files[0].uri.startsWith("data:image/png;base64,"));
    const b64 = result.files[0].uri.slice("data:image/png;base64,".length);
    assert.deepEqual(Buffer.from(b64, "base64"), Buffer.from([1, 2, 3]));
  });

  it("keeps text results file-free", () => {
    const message = {
      role: Role.User,
      content: [new vscode.LanguageModelToolResultPart("c2", [new vscode.LanguageModelTextPart("found it")])],
    } as unknown as vscode.LanguageModelChatRequestMessage;
    const [result] = extractToolResults([message]);
    assert.ok(result.text.includes("found it"));
    assert.deepEqual(result.files, []);
  });

  it("degrades the 51st image to a placeholder (per-turn count cap)", () => {
    const parts = [];
    for (let i = 0; i < 51; i++) {
      parts.push(new vscode.LanguageModelDataPart(Buffer.from([i % 256]), "image/png"));
    }
    const message = {
      role: Role.User,
      content: [new vscode.LanguageModelToolResultPart("c3", parts)],
    } as unknown as vscode.LanguageModelChatRequestMessage;
    const [result] = extractToolResults([message]);
    assert.equal(result.files.length, 50);
    assert.ok(result.text.includes("Attachment omitted") && result.text.includes("per-turn image cap"));
  });
});

describe("buildPromptWithImages (T-0023 attached ferry)", () => {
  it("sends attached bytes as prompt files with a marker", () => {
    const message = {
      role: Role.User,
      content: [
        new vscode.LanguageModelTextPart("explain attached image"),
        new vscode.LanguageModelDataPart(Buffer.from([9, 8, 7]), "image/jpeg"),
      ],
    } as unknown as vscode.LanguageModelChatRequestMessage;
    const { text, files } = buildPromptWithImages([message]);
    assert.ok(text.includes("explain attached image"));
    assert.ok(text.includes("[Image 1: image/jpeg (3 bytes)]"));
    assert.equal(files.length, 1);
    assert.ok(files[0].uri.startsWith("data:image/jpeg;base64,"));
    assert.ok((files[0].name ?? "").endsWith(".jpg"));
  });

  it("leaves text-only turns file-free", () => {
    const { text, files } = buildPromptWithImages([textMessage(Role.User, "hello")]);
    assert.equal(text, "hello");
    assert.deepEqual(files, []);
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
