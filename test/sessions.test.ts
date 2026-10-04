import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  OctSessionMap,
  conversationKey,
  deriveSessionTitle,
  extractUserPromptText,
  fallbackSessionTitle,
  isSessionGoneError,
  sessionTitleFromMessages,
  DEFAULT_SESSION_TITLE,
} from "../src/provider/sessions";
import { OctHttpError } from "../src/server/client";

const testHooks = vscode as unknown as { __outputLines: string[]; __resetOutput(): void };

const Role = vscode.LanguageModelChatMessageRole;

function userMessage(text: string): vscode.LanguageModelChatRequestMessage {
  return {
    role: Role.User,
    content: [new vscode.LanguageModelTextPart(text)],
  } as unknown as vscode.LanguageModelChatRequestMessage;
}

function assistantMessage(text: string): vscode.LanguageModelChatRequestMessage {
  return {
    role: Role.Assistant,
    content: [new vscode.LanguageModelTextPart(text)],
  } as unknown as vscode.LanguageModelChatRequestMessage;
}

const GLOBAL_CONTEXT =
  "<environment_info>\nThe user's current OS is: Windows\n</environment_info>\n" +
  "<workspace_info>\nI am working in a workspace with folders:\n- C:/work\n</workspace_info>";

function queryMessage(query: string): vscode.LanguageModelChatRequestMessage {
  return userMessage(
    "<context>\n2026-10-02\n</context>\n" +
      "<reminderInstructions>\nBe concise.\n</reminderInstructions>\n" +
      `<userRequest>\n${query}\n</userRequest>`,
  );
}

/** Minimal in-memory `vscode.Memento` fake. */
function fakeStore(initial?: Record<string, unknown>): vscode.Memento {
  const data = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    keys: () => [...data.keys()],
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      (data.has(key) ? (data.get(key) as T) : defaultValue),
    update: (key: string, value: unknown): Thenable<void> => {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

describe("deriveSessionTitle", () => {
  it("keeps short prompts verbatim", () => {
    assert.equal(deriveSessionTitle("hello world"), "hello world");
  });

  it("collapses whitespace and caps at ~60 chars", () => {
    assert.equal(deriveSessionTitle("  multi\n line\t text  "), "multi line text");
    assert.equal(deriveSessionTitle("x".repeat(100)), "x".repeat(60));
  });

  it("falls back on empty input", () => {
    for (const input of ["", "   ", "\n\t ", undefined, null]) {
      assert.equal(deriveSessionTitle(input), DEFAULT_SESSION_TITLE);
    }
  });
});

describe("extractUserPromptText", () => {
  it("unwraps <userRequest>", () => {
    const raw = "<context>c</context><userRequest>\nT7 alpha bravo 123\n</userRequest>";
    assert.equal(extractUserPromptText(raw), "T7 alpha bravo 123");
  });

  it("accepts user_query spellings", () => {
    assert.equal(extractUserPromptText("<user_query>do the thing</user_query>"), "do the thing");
  });

  it("strips wrapper blocks without a userRequest", () => {
    const out = extractUserPromptText(`${GLOBAL_CONTEXT}\nplain request here`);
    assert.equal(out, "plain request here");
  });

  it("context-only input yields nothing (caller falls back)", () => {
    assert.equal(extractUserPromptText(GLOBAL_CONTEXT), "");
    assert.equal(extractUserPromptText(""), "");
  });

  it("strips attachment blocks; attachment-only yields nothing", () => {
    const only =
      '<userRequest>\n<attachments> <attachment id="a.txt" filePath="c:\\a.txt">x</attachment> </attachments>\n</userRequest>';
    assert.equal(extractUserPromptText(only), "");
    const mixed =
      '<userRequest>\nplease review\n<attachments> <attachment id="a.txt" filePath="c:\\a.txt">x</attachment> </attachments>\n</userRequest>';
    assert.equal(extractUserPromptText(mixed), "please review");
  });
});

describe("fallbackSessionTitle", () => {
  const at = new Date(2026, 9, 2, 10, 42);

  it("formats OCT: <key8> <MM-DD HH:mm>", () => {
    assert.equal(fallbackSessionTitle("conv:4506f33d-553a-xxxx", at), "OCT: 4506f33d 10-02 10:42");
    assert.equal(fallbackSessionTitle("hash:abcdef0123456789", at), "OCT: abcdef01 10-02 10:42");
  });

  it("is distinct per conversation in the same minute", () => {
    assert.notEqual(fallbackSessionTitle("conv:4506f33d-1", at), fallbackSessionTitle("conv:5c6401c8-2", at));
  });

  it("survives malformed keys", () => {
    assert.equal(fallbackSessionTitle("", at), "OCT: unknown 10-02 10:42");
  });
});

describe("sessionTitleFromMessages", () => {
  it("EDH regression: ignores global context, titles from <userRequest>", () => {
    const title = sessionTitleFromMessages([userMessage(GLOBAL_CONTEXT), queryMessage("T7 alpha bravo 123")]);
    assert.equal(title, "T7 alpha bravo 123");
    assert.ok(!title.includes("environment_info"));
  });

  it("prefers the newest user query", () => {
    const title = sessionTitleFromMessages([queryMessage("first topic"), queryMessage("second topic")]);
    assert.equal(title, "second topic");
  });

  it("returns empty when only placeholders exist (caller applies key fallback)", () => {
    assert.equal(sessionTitleFromMessages([assistantMessage("hi")]), "");
    assert.equal(sessionTitleFromMessages([]), "");
  });
});

describe("conversationKey", () => {
  const dir = "C:\\work";

  it("prefers _conversationId", () => {
    const key = conversationKey({ modelOptions: { _conversationId: "abc-123" } }, "m", [userMessage("hi")], dir);
    assert.equal(key, "conv:abc-123");
  });

  it("hash fallback is stable and separates model + directory", () => {
    const messages = [userMessage("hi")];
    const a = conversationKey({}, "m1", messages, dir);
    assert.ok(a.startsWith("hash:"));
    assert.equal(a, conversationKey({}, "m1", messages, dir));
    assert.notEqual(a, conversationKey({}, "m2", messages, dir));
    assert.notEqual(a, conversationKey({}, "m1", messages, "C:\\other"));
  });
});

describe("OctSessionMap", () => {
  beforeEach(() => {
    testHooks.__resetOutput();
  });

  it("restores persisted entries and snapshots them", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = [
      ["conv:a", { sessionId: "ses_aaa", modelKey: "m1" }],
      ["conv:b", { sessionId: "ses_bbb", modelKey: "m1" }],
    ];
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }));
    assert.equal(map.size(), 2);
    assert.equal(map.peek("conv:a"), "ses_aaa");
    assert.deepEqual(map.snapshot(), [
      { key: "conv:a", sessionId: "ses_aaa", modelKey: "m1" },
      { key: "conv:b", sessionId: "ses_bbb", modelKey: "m1" },
    ]);
  });

  it("caps restored entries at 50 (LRU)", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = Array.from(
      { length: 60 },
      (_, i) => [`conv:${i}`, { sessionId: `ses_${i}`, modelKey: "m1" }] as [string, { sessionId: string; modelKey: string }],
    );
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }));
    assert.equal(map.size(), 50);
  });

  it("honors a custom cap from oct.maxSessions", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = Array.from(
      { length: 5 },
      (_, i) => [`conv:${i}`, { sessionId: `ses_${i}`, modelKey: "m1" }] as [string, { sessionId: string; modelKey: string }],
    );
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }), 3);
    assert.equal(map.size(), 3);
    assert.equal(map.peek("conv:0"), "ses_0");
    assert.equal(map.peek("conv:1"), "ses_1");
    assert.equal(map.peek("conv:2"), "ses_2");
    assert.equal(map.peek("conv:3"), undefined);
  });

  it("falls back to 50 on invalid caps", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = Array.from(
      { length: 60 },
      (_, i) => [`conv:${i}`, { sessionId: `ses_${i}`, modelKey: "m1" }] as [string, { sessionId: string; modelKey: string }],
    );
    for (const bad of [0, -1, Number.NaN]) {
      const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }), bad);
      assert.equal(map.size(), 50);
    }
  });

  it("pruneBySessionIds drops only dead entries and logs", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = [
      ["conv:a", { sessionId: "ses_aaa", modelKey: "m1" }],
      ["conv:b", { sessionId: "ses_bbb", modelKey: "m1" }],
    ];
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }));
    const pruned = map.pruneBySessionIds(new Set(["ses_aaa"]));
    assert.deepEqual(pruned, ["conv:a"]);
    assert.equal(map.size(), 1);
    assert.equal(map.peek("conv:b"), "ses_bbb");
    assert.ok(testHooks.__outputLines.some((line) => line.includes("ses_aaa") && line.includes("pruned")));
  });

  it("forget drops one mapping", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = [
      ["conv:a", { sessionId: "ses_aaa", modelKey: "m1" }],
    ];
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }));
    map.forget("conv:a");
    assert.equal(map.size(), 0);
    assert.equal(map.peek("conv:a"), undefined);
  });

  it("ignores malformed persisted rows", () => {
    const map = new OctSessionMap(
      fakeStore({ "oct.conversationSessions.v1": [["conv:a", { sessionId: "", modelKey: "m1" }], "junk"] }),
    );
    assert.equal(map.size(), 0);
  });
});

describe("isSessionGoneError", () => {
  it("treats HTTP 404 as gone", () => {
    assert.equal(isSessionGoneError(new OctHttpError(404, "not found", "/api/session/ses_x")), true);
  });

  it("keeps non-404 HTTP errors (never prune on uncertainty)", () => {
    assert.equal(isSessionGoneError(new OctHttpError(500, "boom", "/api/session/ses_x")), false);
    assert.equal(isSessionGoneError(new OctHttpError(401, "unauthorized", "/api/session/ses_x")), false);
  });

  it("keeps non-HTTP failures", () => {
    assert.equal(isSessionGoneError(new Error("socket hang up")), false);
    assert.equal(isSessionGoneError("404"), false);
    assert.equal(isSessionGoneError(undefined), false);
  });
});
