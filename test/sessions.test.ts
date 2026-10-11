import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  OctSessionMap,
  conversationKey,
  DELETED_SESSION_MESSAGE,
  DROPPED_SESSION_MESSAGE,
  deriveSessionTitle,
  directoryGroupKey,
  extractUserPromptText,
  fallbackSessionTitle,
  isSessionGoneError,
  sessionTitleFromMessages,
  trackOrphaned,
  chooseEvictionKey,
  groupSnapshotsByDirectory,
  modelKeyFor,
  sessionCreatedMs,
  sessionLastActivityMs,
  shortConversationKey,
  formatDateTime,
  formatLastChat,
  formatRelativeAge,
  formatSessionAge,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_SESSION_TITLE,
  MAX_ORPHANED_SESSIONS,
  UNKNOWN_DIRECTORY_GROUP,
  canonicalDirectory,
  extractMentionedPaths,
  resolveChatDirectory,
} from "../src/provider/sessions";
import { OctHttpError } from "../src/server/client";
import { buildSessionTableGroups, createNonce, escapeHtml, renderSessionsHtml } from "../src/provider/sessionTable";
import { DEFAULT_MAX_SESSIONS as CONFIG_DEFAULT_MAX_SESSIONS } from "../src/config";
import { OctChatProvider } from "../src/provider/octProvider";
import { ToolShuttle } from "../src/provider/tools";
import { PermissionTranslator } from "../src/provider/permissions";
import type { OctModel } from "../src/provider/models";

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

  it("caps restored entries at 200 (LRU)", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = Array.from(
      { length: 250 },
      (_, i) => [`conv:${i}`, { sessionId: `ses_${i}`, modelKey: "m1" }] as [string, { sessionId: string; modelKey: string }],
    );
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }));
    assert.equal(map.size(), 200);
  });

  it("fresh install default holds 200", () => {
    assert.equal(DEFAULT_MAX_SESSIONS, 200);
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = Array.from(
      { length: 250 },
      (_, i) => [`conv:${i}`, { sessionId: `ses_${i}`, modelKey: "m1" }] as [string, { sessionId: string; modelKey: string }],
    );
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }));
    assert.equal(map.size(), DEFAULT_MAX_SESSIONS);
  });

  it("package.json + config defaults agree at 200", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      contributes?: { configuration?: { properties?: { "oct.maxSessions"?: { default?: unknown } } } };
    };
    assert.equal(pkg.contributes?.configuration?.properties?.["oct.maxSessions"]?.default, 200);
    assert.equal(CONFIG_DEFAULT_MAX_SESSIONS, 200);
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

  it("falls back to 200 on invalid caps", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string }]> = Array.from(
      { length: 250 },
      (_, i) => [`conv:${i}`, { sessionId: `ses_${i}`, modelKey: "m1" }] as [string, { sessionId: string; modelKey: string }],
    );
    for (const bad of [0, -1, Number.NaN]) {
      const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }), bad);
      assert.equal(map.size(), 200);
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

describe("DELETED_SESSION_MESSAGE", () => {
  it("is one clear sentence telling the user to start a new chat", () => {
    assert.ok(!DELETED_SESSION_MESSAGE.includes("\n"), "single line");
    assert.ok(DELETED_SESSION_MESSAGE.startsWith("OCT:"), "branded prefix");
    assert.ok(DELETED_SESSION_MESSAGE.includes("deleted"), "states the cause");
    assert.ok(DELETED_SESSION_MESSAGE.includes("new Copilot chat"), "states the remedy");
    assert.ok(!DELETED_SESSION_MESSAGE.includes("try again"), "no retry advice — retrying can never work");
    assert.ok(!/HTTP \d+/.test(DELETED_SESSION_MESSAGE), "no error dump");
  });
});

describe("dead conversations", () => {
  it("markDead/isDead sticks and forget does not un-dead", () => {
    const map = new OctSessionMap(fakeStore({}));
    assert.equal(map.isDead("conv:a"), false);
    map.markDead("conv:a");
    assert.equal(map.isDead("conv:a"), true);
    map.forget("conv:a");
    assert.equal(map.isDead("conv:a"), true);
  });

  it("dead keys persist across restore and respect the cap", () => {
    const store = fakeStore({});
    const first = new OctSessionMap(store, 2);
    first.markDead("conv:a");
    first.markDead("conv:b");
    first.markDead("conv:c");
    const second = new OctSessionMap(store, 2);
    assert.equal(second.isDead("conv:a"), false);
    assert.equal(second.isDead("conv:b"), true);
    assert.equal(second.isDead("conv:c"), true);
  });

  it("ignores garbage dead rows", () => {
    const map = new OctSessionMap(fakeStore({ "oct.deadConversations.v1": ["conv:a", 42, "", null] }));
    assert.equal(map.isDead("conv:a"), true);
    assert.equal(map.isDead("42"), false);
  });
});

describe("trackOrphaned", () => {
  it("appends new ids oldest-first", () => {
    assert.deepEqual(trackOrphaned([], "ses_a"), ["ses_a"]);
    assert.deepEqual(trackOrphaned(["ses_a"], "ses_b"), ["ses_a", "ses_b"]);
  });

  it("ignores empty ids and duplicates", () => {
    assert.deepEqual(trackOrphaned(["ses_a"], ""), ["ses_a"]);
    assert.deepEqual(trackOrphaned(["ses_a", "ses_b"], "ses_a"), ["ses_a", "ses_b"]);
  });

  it("evicts oldest-first at the cap", () => {
    assert.equal(MAX_ORPHANED_SESSIONS, 200);
    const full = Array.from({ length: 200 }, (_, i) => `ses_${i}`);
    const next = trackOrphaned(full, "ses_new");
    assert.equal(next.length, 200);
    assert.equal(next[0], "ses_1");
    assert.equal(next[199], "ses_new");
  });
});

describe("orphan graveyard", () => {
  const stored = (): Array<[string, { sessionId: string; modelKey: string }]> => [
    ["conv:a", { sessionId: "ses_aaa", modelKey: "m1" }],
  ];

  it("forget buries the dropped session id", () => {
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored() }));
    map.forget("conv:a");
    assert.deepEqual(map.orphanedSessions(), ["ses_aaa"]);
  });

  it("forget with gone:true skips the graveyard (404-confirmed)", () => {
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored() }));
    map.forget("conv:a", { gone: true });
    assert.deepEqual(map.orphanedSessions(), []);
  });

  it("forget of an unknown key buries nothing", () => {
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored() }));
    map.forget("conv:missing");
    assert.deepEqual(map.orphanedSessions(), []);
  });

  it("pruneBySessionIds buries nothing (ids are 404-confirmed)", () => {
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored() }));
    map.pruneBySessionIds(new Set(["ses_aaa"]));
    assert.deepEqual(map.orphanedSessions(), []);
  });

  it("clearOrphaned drops only resolved ids", () => {
    const seeded = new OctSessionMap(
      fakeStore({ "oct.orphanedSessions.v1": ["ses_1", "ses_2", "ses_3"] }),
    );
    assert.deepEqual(seeded.orphanedSessions(), ["ses_1", "ses_2", "ses_3"]);
    seeded.clearOrphaned(["ses_2", "ses_missing"]);
    assert.deepEqual(seeded.orphanedSessions(), ["ses_1", "ses_3"]);
    seeded.clearOrphaned([]);
    assert.deepEqual(seeded.orphanedSessions(), ["ses_1", "ses_3"]);
  });

  it("graveyard persists across restore", () => {
    const store = fakeStore({ "oct.conversationSessions.v1": stored() });
    const first = new OctSessionMap(store);
    first.forget("conv:a");
    assert.deepEqual(first.orphanedSessions(), ["ses_aaa"]);
    const second = new OctSessionMap(store);
    assert.deepEqual(second.orphanedSessions(), ["ses_aaa"]);
    second.clearOrphaned(["ses_aaa"]);
    assert.deepEqual(new OctSessionMap(store).orphanedSessions(), []);
  });

  it("restore ignores garbage graveyard rows", () => {
    const seeded = new OctSessionMap(
      fakeStore({ "oct.orphanedSessions.v1": ["ses_aaa", 42, "", null, "ses_bbb"] }),
    );
    assert.deepEqual(seeded.orphanedSessions(), ["ses_aaa", "ses_bbb"]);
  });
});

describe("chooseEvictionKey (T-0017 evict-dead-first)", () => {
  it("returns undefined when empty", () => {
    assert.equal(chooseEvictionKey([], new Set()), undefined);
  });

  it("drops the oldest dead entry first, live kept", () => {
    const keys = ["conv:live-old", "conv:dead", "conv:live-new"];
    assert.equal(chooseEvictionKey(keys, new Set(["conv:dead"])), "conv:dead");
  });

  it("prefers the oldest dead when several are dead", () => {
    const keys = ["conv:live", "conv:dead-new", "conv:dead-old"];
    // Iteration is oldest-first: the first dead encountered wins, so order
    // the array oldest-first — dead-old must come before dead-new.
    assert.equal(chooseEvictionKey(["conv:live", "conv:dead-old", "conv:dead-new"], new Set(["conv:dead-old", "conv:dead-new"])), "conv:dead-old");
    assert.equal(keys.length, 3);
  });

  it("falls back to oldest-live when nothing is dead", () => {
    assert.equal(chooseEvictionKey(["conv:a", "conv:b"], new Set()), "conv:a");
    assert.equal(chooseEvictionKey(["conv:a", "conv:b"], new Set(["conv:missing"])), "conv:a");
  });
});

describe("evict-dead-first at create time (T-0017)", () => {
  const deps = { baseUrl: "http://127.0.0.1:9", password: "", directory: "D:\\work" };
  const model = { id: "m", providerID: "p", pickerId: "m" };

  /** Stub `fetch` so `createSession` succeeds without a server. */
  async function withFetchStub(sessionId: string, run: () => Promise<void>): Promise<void> {
    const realFetch = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>)["fetch"] = async () =>
      new Response(JSON.stringify({ data: { id: sessionId } }), { status: 200 });
    try {
      await run();
    } finally {
      (globalThis as unknown as Record<string, unknown>)["fetch"] = realFetch;
    }
  }

  it("cap hit with dead entries present drops dead first, live kept, no burial", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:live", { sessionId: "ses_live", modelKey: "m", directory: "D:\\work" }],
        ["conv:doomed", { sessionId: "ses_doomed", modelKey: "m", directory: "D:\\work" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    map.markDead("conv:doomed");
    await withFetchStub("ses_new", async () => {
      const id = await map.getOrCreate("conv:new", deps, model);
      assert.equal(id, "ses_new");
    });
    assert.equal(map.peek("conv:live"), "ses_live");
    assert.equal(map.peek("conv:new"), "ses_new");
    assert.equal(map.peek("conv:doomed"), undefined);
    assert.deepEqual(map.orphanedSessions(), [], "gone-confirmed dead eviction buries nothing");
  });

  it("cap hit with no dead entries evicts oldest-live and buries it", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:old", { sessionId: "ses_old", modelKey: "m", directory: "D:\\work" }],
        ["conv:keep", { sessionId: "ses_keep", modelKey: "m", directory: "D:\\work" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    await withFetchStub("ses_new", async () => {
      const id = await map.getOrCreate("conv:new", deps, model);
      assert.equal(id, "ses_new");
    });
    assert.equal(map.peek("conv:old"), undefined);
    assert.equal(map.peek("conv:keep"), "ses_keep");
    assert.deepEqual(map.orphanedSessions(), ["ses_old"]);
  });

  it("create stores the workspace directory on the entry", async () => {
    const map = new OctSessionMap(fakeStore({}), 5);
    await withFetchStub("ses_dir", async () => {
      await map.getOrCreate("conv:d", { ...deps, directory: "D:\\work\\proj" }, model);
    });
    assert.deepEqual(map.snapshot(), [
      { key: "conv:d", sessionId: "ses_dir", modelKey: "m", directory: "D:\\work\\proj" },
    ]);
  });
});

describe("directory restore compat (T-0017)", () => {
  it("old v1 rows without directory restore fine (group unknown)", () => {
    const map = new OctSessionMap(
      fakeStore({
        "oct.conversationSessions.v1": [
          ["conv:a", { sessionId: "ses_aaa", modelKey: "m1" }],
          ["conv:b", { sessionId: "ses_bbb", modelKey: "m1", directory: "D:\\work\\proj" }],
          ["conv:c", { sessionId: "ses_ccc", modelKey: "m1", directory: 42 }],
        ],
      }),
    );
    assert.equal(map.size(), 3);
    const snap = map.snapshot();
    assert.deepEqual(snap.find((e) => e.key === "conv:a"), { key: "conv:a", sessionId: "ses_aaa", modelKey: "m1" });
    assert.deepEqual(snap.find((e) => e.key === "conv:b"), {
      key: "conv:b",
      sessionId: "ses_bbb",
      modelKey: "m1",
      directory: "D:\\work\\proj",
    });
    assert.deepEqual(snap.find((e) => e.key === "conv:c"), { key: "conv:c", sessionId: "ses_ccc", modelKey: "m1" });
    const groups = groupSnapshotsByDirectory(snap);
    assert.deepEqual(groups.map((g) => g.directory), ["D:\\work\\proj", UNKNOWN_DIRECTORY_GROUP]);
  });
});

describe("groupSnapshotsByDirectory (T-0017)", () => {
  it("groups by directory with unknown last and keeps entry order", () => {
    const entries = [
      { key: "conv:1", sessionId: "ses_1", modelKey: "m", directory: "D:\\b" },
      { key: "conv:2", sessionId: "ses_2", modelKey: "m" },
      { key: "conv:3", sessionId: "ses_3", modelKey: "m", directory: "D:\\a" },
      { key: "conv:4", sessionId: "ses_4", modelKey: "m", directory: "D:\\b" },
    ];
    const groups = groupSnapshotsByDirectory(entries);
    assert.deepEqual(groups.map((g) => g.directory), ["D:\\a", "D:\\b", UNKNOWN_DIRECTORY_GROUP]);
    assert.deepEqual(groups[1].entries.map((e) => e.key), ["conv:1", "conv:4"]);
  });

  it("stays readable at 100+ mapped entries", () => {
    const entries = Array.from({ length: 120 }, (_, i) => ({
      key: `conv:${i}`,
      sessionId: `ses_${i}`,
      modelKey: "m",
      directory: i % 10 === 0 ? undefined : `D:\\work\\proj${i % 3}`,
    }));
    const groups = groupSnapshotsByDirectory(entries);
    assert.equal(groups.length, 4);
    assert.equal(groups[groups.length - 1].directory, UNKNOWN_DIRECTORY_GROUP);
    assert.equal(groups.reduce((n, g) => n + g.entries.length, 0), 120);
    assert.ok(groups.every((g) => g.entries.length >= 12), "every group carries its share with an age slot");
  });
});

describe("sessionCreatedMs + formatSessionAge (T-0017)", () => {
  it("reads the live time.created millis shape", () => {
    const live = {
      id: "ses_x",
      time: { created: 1791191608803, updated: 1791191614193 },
      title: "Starting task t-0017",
      location: { directory: "D:\\htdocs2\\opencode-for-copilot" },
    };
    assert.equal(sessionCreatedMs(live), 1791191608803);
  });

  it("tolerates ISO strings and rejects garbage", () => {
    assert.equal(sessionCreatedMs({ time: { created: "2026-10-05T10:00:00.000Z" } }), Date.parse("2026-10-05T10:00:00.000Z"));
    assert.equal(sessionCreatedMs({ time: {} }), undefined);
    assert.equal(sessionCreatedMs({}), undefined);
    assert.equal(sessionCreatedMs(null), undefined);
    assert.equal(sessionCreatedMs({ time: { created: -5 } }), undefined);
  });

  it("formats ages compactly", () => {
    const now = 1_000_000_000_000;
    assert.equal(formatSessionAge(now - 30_000, now), "30s");
    assert.equal(formatSessionAge(now - 12 * 60_000, now), "12m");
    assert.equal(formatSessionAge(now - 5 * 3_600_000, now), "5h");
    assert.equal(formatSessionAge(now - 3 * 86_400_000, now), "3d");
    assert.equal(formatSessionAge(now - 21 * 86_400_000, now), "3w");
    assert.equal(formatSessionAge(undefined, now), undefined);
    assert.equal(formatSessionAge(now + 60_000, now), undefined);
  });
});

describe("formatDateTime + formatRelativeAge + formatLastChat (T-0027 v3)", () => {
  const now = 1_000_000_000_000;

  it("formats a zero-padded local yyyy-mm-dd hh:mm:ss", () => {
    const d = new Date(now - 60_000);
    const pad = (n: number): string => String(n).padStart(2, "0");
    const expected =
      `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    assert.equal(formatDateTime(now - 60_000), expected);
    assert.match(formatDateTime(now) ?? "", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("rejects garbage timestamps", () => {
    assert.equal(formatDateTime(undefined), undefined);
    assert.equal(formatDateTime(-5), undefined);
    assert.equal(formatDateTime(Number.NaN), undefined);
  });

  it("phrases every unit with singular/plural agreement", () => {
    assert.equal(formatRelativeAge(now - 1_000, now), "1 second ago");
    assert.equal(formatRelativeAge(now - 30_000, now), "30 seconds ago");
    assert.equal(formatRelativeAge(now - 60_000, now), "1 minute ago");
    assert.equal(formatRelativeAge(now - 12 * 60_000, now), "12 minutes ago");
    assert.equal(formatRelativeAge(now - 3_600_000, now), "1 hour ago");
    assert.equal(formatRelativeAge(now - 5 * 3_600_000, now), "5 hours ago");
    assert.equal(formatRelativeAge(now - 86_400_000, now), "24 hours ago");
    assert.equal(formatRelativeAge(now - 3 * 86_400_000, now), "3 days ago");
    assert.equal(formatRelativeAge(now - 45 * 86_400_000, now), "1 month ago");
    assert.equal(formatRelativeAge(now - 200 * 86_400_000, now), "6 months ago");
    assert.equal(formatRelativeAge(now - 400 * 86_400_000, now), "1 year ago");
  });

  it("yields undefined when missing or in the future", () => {
    assert.equal(formatRelativeAge(undefined, now), undefined);
    assert.equal(formatRelativeAge(now + 60_000, now), undefined);
  });

  it("combines absolute and relative parts", () => {
    const out = formatLastChat(now - 60_000, now) ?? "";
    assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(1 minute ago\)$/);
    assert.equal(formatLastChat(undefined, now), undefined);
    assert.equal(formatLastChat(now + 60_000, now), undefined);
  });
});

describe("DROPPED_SESSION_MESSAGE (T-0019)", () => {
  it("is one clear sentence distinct from the deleted-session notice", () => {
    assert.ok(!DROPPED_SESSION_MESSAGE.includes("\n"), "single line");
    assert.ok(DROPPED_SESSION_MESSAGE.startsWith("OCT:"), "branded prefix");
    assert.ok(DROPPED_SESSION_MESSAGE.includes("dropped"), "states the cause (link dropped)");
    assert.ok(DROPPED_SESSION_MESSAGE.includes("new Copilot chat"), "states the remedy");
    assert.ok(!DROPPED_SESSION_MESSAGE.includes("try again"), "no retry advice");
    assert.ok(!/HTTP \d+/.test(DROPPED_SESSION_MESSAGE), "no error dump");
    assert.notEqual(DROPPED_SESSION_MESSAGE, DELETED_SESSION_MESSAGE, "differs from the deleted notice");
    assert.ok(DELETED_SESSION_MESSAGE.includes("deleted"), "deleted notice states deletion");
    assert.ok(!DELETED_SESSION_MESSAGE.includes("link"), "deleted notice is not about the link");
  });
});

describe("dropped record (T-0019)", () => {
  const deps = { baseUrl: "http://127.0.0.1:9", password: "", directory: "D:\\work" };
  const model = { id: "m", providerID: "p", pickerId: "m" };

  async function withFetchStub(sessionId: string, run: () => Promise<void>): Promise<void> {
    const realFetch = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>)["fetch"] = async () =>
      new Response(JSON.stringify({ data: { id: sessionId } }), { status: 200 });
    try {
      await run();
    } finally {
      (globalThis as unknown as Record<string, unknown>)["fetch"] = realFetch;
    }
  }

  it("forget records the dropped key and buries the id", () => {
    const map = new OctSessionMap(
      fakeStore({ "oct.conversationSessions.v1": [["conv:a", { sessionId: "ses_aaa", modelKey: "m" }]] }),
    );
    map.forget("conv:a");
    assert.equal(map.isDropped("conv:a"), true);
    assert.deepEqual(map.droppedSnapshot(), [{ key: "conv:a", sessionId: "ses_aaa" }]);
    assert.deepEqual(map.orphanedSessions(), ["ses_aaa"]);
  });

  it("forget with gone:true records nothing and buries nothing", () => {
    const map = new OctSessionMap(
      fakeStore({ "oct.conversationSessions.v1": [["conv:a", { sessionId: "ses_aaa", modelKey: "m" }]] }),
    );
    map.forget("conv:a", { gone: true });
    assert.equal(map.isDropped("conv:a"), false);
    assert.deepEqual(map.droppedSnapshot(), []);
    assert.deepEqual(map.orphanedSessions(), []);
  });

  it("create-eviction of a live entry records and buries", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:old", { sessionId: "ses_old", modelKey: "m", directory: "D:\\work" }],
        ["conv:keep", { sessionId: "ses_keep", modelKey: "m", directory: "D:\\work" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    await withFetchStub("ses_new", async () => {
      await map.getOrCreate("conv:new", deps, model);
    });
    assert.equal(map.isDropped("conv:old"), true);
    assert.deepEqual(map.droppedSnapshot(), [{ key: "conv:old", sessionId: "ses_old" }]);
    assert.deepEqual(map.orphanedSessions(), ["ses_old"]);
  });

  it("create-eviction of a dead entry records nothing and buries nothing", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:live", { sessionId: "ses_live", modelKey: "m", directory: "D:\\work" }],
        ["conv:doomed", { sessionId: "ses_doomed", modelKey: "m", directory: "D:\\work" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    map.markDead("conv:doomed");
    await withFetchStub("ses_new", async () => {
      await map.getOrCreate("conv:new", deps, model);
    });
    assert.equal(map.isDropped("conv:doomed"), false);
    assert.deepEqual(map.droppedSnapshot(), []);
    assert.deepEqual(map.orphanedSessions(), []);
  });

  it("restore-cap overflow records and buries (charlie sequence)", () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:alice", { sessionId: "ses_alice", modelKey: "m" }],
        ["conv:test2", { sessionId: "ses_test2", modelKey: "m" }],
        ["conv:charlie", { sessionId: "ses_charlie", modelKey: "m" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    assert.equal(map.size(), 2);
    assert.equal(map.peek("conv:alice"), "ses_alice");
    assert.equal(map.peek("conv:test2"), "ses_test2");
    assert.equal(map.peek("conv:charlie"), undefined);
    assert.equal(map.isDropped("conv:charlie"), true);
    assert.deepEqual(map.droppedSnapshot(), [{ key: "conv:charlie", sessionId: "ses_charlie" }]);
    assert.deepEqual(map.orphanedSessions(), ["ses_charlie"]);
  });

  it("prune records the key but buries nothing (404-confirmed)", () => {
    const map = new OctSessionMap(
      fakeStore({ "oct.conversationSessions.v1": [["conv:a", { sessionId: "ses_aaa", modelKey: "m" }]] }),
    );
    const pruned = map.pruneBySessionIds(new Set(["ses_aaa"]));
    assert.deepEqual(pruned, ["conv:a"]);
    assert.equal(map.isDropped("conv:a"), true);
    assert.deepEqual(map.droppedSnapshot(), [{ key: "conv:a", sessionId: "ses_aaa" }]);
    assert.deepEqual(map.orphanedSessions(), [], "404-confirmed prune buries nothing");
  });

  it("record never auto-clears and persists across reloads", async () => {
    const store = fakeStore({ "oct.conversationSessions.v1": [["conv:a", { sessionId: "ses_aaa", modelKey: "m" }]] });
    const first = new OctSessionMap(store);
    first.forget("conv:a");
    assert.equal(first.isDropped("conv:a"), true);
    first.clear();
    assert.equal(first.isDropped("conv:a"), true, "clear() leaves the record alone");
    const second = new OctSessionMap(store);
    assert.equal(second.isDropped("conv:a"), true, "record survives reload");
    assert.deepEqual(second.droppedSnapshot(), [{ key: "conv:a", sessionId: "ses_aaa" }]);
    assert.deepEqual(second.orphanedSessions(), ["ses_aaa"], "graveyard survives reload");
    await withFetchStub("ses_new", async () => {
      await second.getOrCreate("conv:other", deps, model);
    });
    assert.equal(second.isDropped("conv:a"), true, "creates for other keys leave the record alone");
  });

  it("record is bounded by maxEntries (oldest-first)", () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:a", { sessionId: "ses_a", modelKey: "m" }],
        ["conv:b", { sessionId: "ses_b", modelKey: "m" }],
        ["conv:c", { sessionId: "ses_c", modelKey: "m" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    // Restore keeps a+b, drops c (oldest dropped record).
    assert.deepEqual(map.droppedSnapshot().map((e) => e.key), ["conv:c"]);
    map.forget("conv:a");
    assert.deepEqual(map.droppedSnapshot().map((e) => e.key), ["conv:c", "conv:a"]);
    map.forget("conv:b");
    // Cap 2 evicts the oldest dropped key (conv:c).
    assert.deepEqual(map.droppedSnapshot().map((e) => e.key), ["conv:a", "conv:b"]);
    assert.equal(map.isDropped("conv:c"), false);
    assert.equal(map.isDropped("conv:a"), true);
    assert.equal(map.isDropped("conv:b"), true);
  });

  it("ignores garbage dropped rows", () => {
    const map = new OctSessionMap(
      fakeStore({ "oct.droppedConversations.v1": [["conv:a", "ses_aaa"], ["conv:b", 42], "junk", ["", "ses_x"]] }),
    );
    assert.equal(map.isDropped("conv:a"), true);
    assert.equal(map.isDropped("conv:b"), false);
    assert.deepEqual(map.droppedSnapshot(), [{ key: "conv:a", sessionId: "ses_aaa" }]);
  });
});

describe("provider retired-chat notice (T-0019)", () => {
  it("a turn for a dropped key reports the notice and creates nothing; retry repeats", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [["conv:keep", { sessionId: "ses_keep", modelKey: "p/m" }]],
      "oct.droppedConversations.v1": [["conv:charlie", "ses_charlie"]],
      "oct.orphanedSessions.v1": ["ses_charlie"],
    });
    const provider = new OctChatProvider({
      baseUrl: "http://127.0.0.1:9",
      password: "",
      directory: "D:\\work",
      sessionStore: store,
      shuttle: new ToolShuttle(),
      translator: new PermissionTranslator(),
      permissionTimeoutMs: 1000,
      managed: true,
      maxSessions: 2,
    });
    const model = { id: "p/m", providerID: "p", modelID: "m" } as unknown as OctModel;
    const messages = [userMessage("hello")] as unknown as readonly vscode.LanguageModelChatRequestMessage[];
    const options = {
      modelOptions: { _conversationId: "charlie" },
      tools: [],
    } as unknown as vscode.ProvideLanguageModelChatResponseOptions;
    const reported: string[] = [];
    const progress = {
      report(part: unknown) {
        const value = (part as { value?: unknown }).value;
        if (typeof value === "string") {
          reported.push(value);
        } else {
          reported.push(String(value ?? part));
        }
      },
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose() {} }),
    } as unknown as vscode.CancellationToken;
    let fetches = 0;
    const realFetch = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>)["fetch"] = async () => {
      fetches++;
      return new Response(JSON.stringify({ data: { id: "ses_fork" } }), { status: 200 });
    };
    try {
      await provider.provideLanguageModelChatResponse(model, messages, options, progress, token);
      await provider.provideLanguageModelChatResponse(model, messages, options, progress, token);
    } finally {
      globalThis.fetch = realFetch;
      provider.dispose();
    }
    assert.equal(fetches, 0, "retired chat creates no session (no fork)");
    assert.equal(reported.length, 2, "first turn + retry both report");
    for (const line of reported) {
      assert.equal(line, DROPPED_SESSION_MESSAGE);
    }
    assert.deepEqual(provider.orphanedSessions(), ["ses_charlie"], "cleanup still lists the old id");
    assert.ok(
      provider.mappedSessions().every((e: { key: string }) => e.key !== "conv:charlie"),
      "map unchanged (no ses_fork-style fork)",
    );
  });
});

describe("modelKeyFor (T-0021 variant pinning)", () => {
  it("is the bare picker id without a variant", () => {
    assert.equal(modelKeyFor("p/m", undefined), "p/m");
  });

  it("folds a set variant after #", () => {
    assert.equal(modelKeyFor("p/m", "high"), "p/m#high");
    assert.notEqual(modelKeyFor("p/m", "low"), modelKeyFor("p/m", "high"));
  });
});

describe("session variant plumbing (T-0021)", () => {
  const deps = { baseUrl: "http://127.0.0.1:9", password: "", directory: "D:\\work" };

  /** Stub `fetch`, capturing session-create and model-switch wire bodies. */
  async function withCapturingFetch(
    run: (captured: { creates: Array<Record<string, unknown>>; switches: Array<{ url: string; body: unknown }> }) => Promise<void>,
  ): Promise<void> {
    const realFetch = globalThis.fetch;
    const captured = { creates: [] as Array<Record<string, unknown>>, switches: [] as Array<{ url: string; body: unknown }> };
    (globalThis as unknown as Record<string, unknown>)["fetch"] = async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url);
      if (init?.method === "POST" && /\/api\/session\/[^/]+\/model$/.test(u)) {
        captured.switches.push({ url: u, body: init.body === undefined ? undefined : JSON.parse(init.body) });
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (init?.method === "POST" && u.endsWith("/api/session")) {
        captured.creates.push(JSON.parse(init.body ?? "{}") as Record<string, unknown>);
        return new Response(JSON.stringify({ data: { id: `ses_variant_${captured.creates.length}` } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    try {
      await run(captured);
    } finally {
      (globalThis as unknown as Record<string, unknown>)["fetch"] = realFetch;
    }
  }

  it("create sends the validated variant and pins the modelKey", async () => {
    const map = new OctSessionMap(fakeStore({}), 5);
    await withCapturingFetch(async (captured) => {
      const id = await map.getOrCreate("conv:v", deps, { id: "m", providerID: "p", pickerId: "p/m", variant: "high" });
      assert.equal(id, "ses_variant_1");
      assert.deepEqual((captured.creates[0] as { model?: unknown }).model, { id: "m", providerID: "p", variant: "high" });
    });
    assert.deepEqual(map.snapshot(), [{ key: "conv:v", sessionId: "ses_variant_1", modelKey: "p/m#high", directory: "D:\\work" }]);
  });

  it("omits the variant key when no effort was picked", async () => {
    const map = new OctSessionMap(fakeStore({}), 5);
    await withCapturingFetch(async (captured) => {
      await map.getOrCreate("conv:plain", deps, { id: "m", providerID: "p", pickerId: "p/m" });
      assert.deepEqual((captured.creates[0] as { model?: unknown }).model, { id: "m", providerID: "p" });
    });
    assert.deepEqual(map.snapshot(), [{ key: "conv:plain", sessionId: "ses_variant_1", modelKey: "p/m", directory: "D:\\work" }]);
  });

  it("effort change mid-chat switches the same session (no fork)", async () => {
    const map = new OctSessionMap(fakeStore({}), 5);
    await withCapturingFetch(async (captured) => {
      const first = await map.getOrCreate("conv:v", deps, { id: "m", providerID: "p", pickerId: "p/m", variant: "high" });
      const second = await map.getOrCreate("conv:v", deps, { id: "m", providerID: "p", pickerId: "p/m", variant: "low" });
      assert.equal(second, first, "same session reused across the effort change");
      assert.equal(captured.creates.length, 1, "no second session created");
      assert.equal(captured.switches.length, 1);
      assert.deepEqual((captured.switches[0].body as { model?: unknown }).model, { id: "m", providerID: "p", variant: "low" });
    });
    assert.deepEqual(map.snapshot(), [{ key: "conv:v", sessionId: "ses_variant_1", modelKey: "p/m#low", directory: "D:\\work" }]);
  });

  it("same effort reuses silently (no switch)", async () => {
    const map = new OctSessionMap(fakeStore({}), 5);
    await withCapturingFetch(async (captured) => {
      const first = await map.getOrCreate("conv:v", deps, { id: "m", providerID: "p", pickerId: "p/m", variant: "high" });
      const second = await map.getOrCreate("conv:v", deps, { id: "m", providerID: "p", pickerId: "p/m", variant: "high" });
      assert.equal(second, first);
      assert.equal(captured.switches.length, 0);
    });
  });
});

describe("provider thinking-effort round-trip (T-0021)", () => {
  it("picked effort travels as Model.Ref.variant; unknown/absent sends none", async () => {
    const store = fakeStore({});
    const provider = new OctChatProvider({
      baseUrl: "http://127.0.0.1:9",
      password: "",
      directory: "D:\\work",
      sessionStore: store,
      shuttle: new ToolShuttle(),
      translator: new PermissionTranslator(),
      permissionTimeoutMs: 1000,
      managed: true,
      maxSessions: 10,
    });
    const model = { id: "p/m", providerID: "p", modelID: "m", variantIds: ["low", "high"] } as unknown as OctModel;
    const messages = [userMessage("do the thing")] as unknown as readonly vscode.LanguageModelChatRequestMessage[];
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose() {} }),
    } as unknown as vscode.CancellationToken;
    const progress = { report() {} } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;
    const createdIds: string[] = [];
    const createBodies: unknown[] = [];
    const switchBodies: unknown[] = [];
    let mapped: Array<{ key: string; sessionId: string; modelKey: string }> = [];
    const realFetch = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>)["fetch"] = async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/api/event")) {
        const frames = ["ses_rt_1", "ses_rt_2", "ses_rt_3"]
          .map((id) => `data: {"type":"session.idle","data":{"sessionID":"${id}"}}\n\n`)
          .join("");
        const bytes = new TextEncoder().encode(frames);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      if (u.includes("/message?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (method === "POST" && /\/api\/session\/[^/]+\/model$/.test(u)) {
        switchBodies.push(JSON.parse(init?.body ?? "{}"));
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (method === "POST" && u.endsWith("/api/session")) {
        createBodies.push(JSON.parse(init?.body ?? "{}"));
        const id = `ses_rt_${createdIds.length + 1}`;
        createdIds.push(id);
        return new Response(JSON.stringify({ data: { id } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    try {
      const turn = (conversationId: string, modelConfiguration?: Record<string, unknown>) =>
        provider.provideLanguageModelChatResponse(
          model,
          messages,
          {
            modelOptions: { _conversationId: conversationId },
            tools: [],
            ...(modelConfiguration === undefined ? {} : { modelConfiguration }),
          } as unknown as vscode.ProvideLanguageModelChatResponseOptions,
          progress,
          token,
        );
      await turn("effort-pick", { reasoningEffort: "high" });
      await turn("effort-pick", { reasoningEffort: "low" });
      await turn("effort-unknown", { reasoningEffort: "ultra" });
      await turn("effort-absent");
      mapped = provider.mappedSessions();
    } finally {
      globalThis.fetch = realFetch;
      provider.dispose();
    }
    assert.equal(createBodies.length, 3, "pick + unknown + absent create; the effort change switches");
    assert.deepEqual((createBodies[0] as { model?: unknown }).model, { id: "m", providerID: "p", variant: "high" });
    assert.deepEqual((createBodies[1] as { model?: unknown }).model, { id: "m", providerID: "p" }, "unknown effort omitted");
    assert.deepEqual((createBodies[2] as { model?: unknown }).model, { id: "m", providerID: "p" }, "absent effort omitted");
    assert.equal(switchBodies.length, 1, "mid-chat effort change pins via switch");
    assert.deepEqual((switchBodies[0] as { model?: unknown }).model, { id: "m", providerID: "p", variant: "low" });
    const byKey = new Map(mapped.map((e) => [e.key, e]));
    assert.equal(byKey.get("conv:effort-pick")?.sessionId, "ses_rt_1", "no fork on effort change");
    assert.equal(byKey.get("conv:effort-pick")?.modelKey, "p/m#low");
    assert.equal(byKey.get("conv:effort-unknown")?.modelKey, "p/m");
  });
});

describe("extractMentionedPaths (T-0022)", () => {
  it("finds attachment-only paths", () => {
    const msgs = [
      userMessage(
        '<userRequest>\n<attachments> <attachment id="a.txt" filePath="c:\\a.txt">x</attachment> </attachments>\n</userRequest>',
      ),
    ] as unknown as readonly vscode.LanguageModelChatRequestMessage[];
    assert.deepEqual(extractMentionedPaths(msgs), ["c:\\a.txt"]);
  });

  it("finds mixed text+attachment paths in order", () => {
    const msgs = [
      userMessage("hello"),
      userMessage(
        'review <attachments><attachment id="f1" filePath="D:\\work\\a\\one.ts">x</attachment>' +
          '<attachment id="f2" filePath="D:\\work\\b\\two.ts">y</attachment></attachments>',
      ),
    ] as unknown as readonly vscode.LanguageModelChatRequestMessage[];
    assert.deepEqual(extractMentionedPaths(msgs), ["D:\\work\\a\\one.ts", "D:\\work\\b\\two.ts"]);
  });

  it("returns empty when no filePath markup exists", () => {
    const msgs = [userMessage("plain text, no attachments")] as unknown as readonly vscode.LanguageModelChatRequestMessage[];
    assert.deepEqual(extractMentionedPaths(msgs), []);
  });
});

describe("resolveChatDirectory (T-0022)", () => {
  const folders = ["D:\\work\\a", "D:\\work\\b"];

  it("prefers message paths over the active editor", () => {
    assert.equal(
      resolveChatDirectory({
        messagePaths: ["D:\\work\\b\\file.ts"],
        activeEditorPath: "D:\\work\\a\\edit.ts",
        workspaceFolders: folders,
      }),
      "D:\\work\\b",
    );
  });

  it("falls back to the active editor when no message matches", () => {
    assert.equal(
      resolveChatDirectory({ messagePaths: [], activeEditorPath: "D:\\work\\b\\edit.ts", workspaceFolders: folders }),
      "D:\\work\\b",
    );
  });

  it("falls back to the first folder (single-folder identical)", () => {
    assert.equal(
      resolveChatDirectory({ messagePaths: [], activeEditorPath: undefined, workspaceFolders: ["D:\\work"] }),
      "D:\\work",
    );
    assert.equal(
      resolveChatDirectory({
        messagePaths: ["D:\\work\\file.ts"],
        activeEditorPath: undefined,
        workspaceFolders: ["D:\\work"],
      }),
      "D:\\work",
    );
  });

  it("returns undefined when no folder is open", () => {
    assert.equal(
      resolveChatDirectory({ messagePaths: ["D:\\work\\a\\f.ts"], activeEditorPath: "D:\\work\\a\\e.ts", workspaceFolders: [] }),
      undefined,
    );
  });

  it("matches longest-prefix with separator boundary and drive case", () => {
    const nested = ["D:\\work", "D:\\work\\proj"];
    assert.equal(
      resolveChatDirectory({
        messagePaths: ["D:\\work\\proj\\file.ts"],
        activeEditorPath: undefined,
        workspaceFolders: nested,
      }),
      "D:\\work\\proj",
    );
    assert.equal(
      resolveChatDirectory({
        messagePaths: ["d:\\work\\proj\\file.ts"],
        activeEditorPath: undefined,
        workspaceFolders: ["D:\\work\\proj"],
      }),
      "D:\\work\\proj",
    );
    assert.equal(
      resolveChatDirectory({
        messagePaths: ["D:\\work\\proj2\\file.ts"],
        activeEditorPath: undefined,
        workspaceFolders: ["D:\\work\\proj"],
      }),
      "D:\\work\\proj",
      "unmatched message skips to the first-folder fallback",
    );
  });

  it("ignores garbage paths", () => {
    assert.equal(
      resolveChatDirectory({
        messagePaths: ["/etc/passwd", "not-a-path", ""],
        activeEditorPath: "D:\\work\\b\\edit.ts",
        workspaceFolders: folders,
      }),
      "D:\\work\\b",
    );
  });

  it("canonicalDirectory uppercases a lowercase drive (B-0002 compat)", () => {
    assert.equal(canonicalDirectory("c:\\work\\a"), "C:\\work\\a");
    assert.equal(canonicalDirectory(""), "");
  });
});

describe("provider multi-root round-trip (T-0022)", () => {
  it("two chats in different folders create with different directories; reuse pins", async () => {
    const store = fakeStore({});
    const provider = new OctChatProvider({
      baseUrl: "http://127.0.0.1:9",
      password: "",
      directory: "D:\\work\\a",
      sessionStore: store,
      shuttle: new ToolShuttle(),
      translator: new PermissionTranslator(),
      permissionTimeoutMs: 1000,
      managed: true,
      maxSessions: 10,
    });
    const model = { id: "p/m", providerID: "p", modelID: "m", variantIds: [] } as unknown as OctModel;
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose() {} }),
    } as unknown as vscode.CancellationToken;
    const progress = { report() {} } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;
    const vsc = vscode as unknown as {
      workspace: { workspaceFolders: unknown };
      window: { activeTextEditor?: unknown };
    };
    const prevFolders = vsc.workspace.workspaceFolders;
    const prevEditor = vsc.window.activeTextEditor;
    vsc.workspace.workspaceFolders = [
      { uri: { fsPath: "D:\\work\\a" } },
      { uri: { fsPath: "D:\\work\\b" } },
    ];
    vsc.window.activeTextEditor = undefined;
    const createBodies: unknown[] = [];
    const realFetch = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>)["fetch"] = async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/api/event")) {
        const frame = `data: {"type":"session.idle","data":{"sessionID":"ses_x"}}\n\n`;
        const bytes = new TextEncoder().encode(frame);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      if (u.includes("/message?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (method === "POST" && u.endsWith("/api/session")) {
        createBodies.push(JSON.parse(init?.body ?? "{}"));
        return new Response(JSON.stringify({ data: { id: `ses_multi_${createBodies.length}` } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    const msgIn = (dir: string) =>
      [
        userMessage(
          `<userRequest>\nreview\n<attachments><attachment id="f" filePath="${dir}\\file.ts">x</attachment></attachments>\n</userRequest>`,
        ),
      ] as unknown as readonly vscode.LanguageModelChatRequestMessage[];
    let snap: Array<{ key: string; sessionId: string; modelKey: string; directory?: string }> = [];
    try {
      const turn = (conversationId: string, dir: string) =>
        provider.provideLanguageModelChatResponse(
          model,
          msgIn(dir),
          { modelOptions: { _conversationId: conversationId }, tools: [] } as unknown as vscode.ProvideLanguageModelChatResponseOptions,
          progress,
          token,
        );
      await turn("multi-a", "D:\\work\\a");
      await turn("multi-b", "D:\\work\\b");
      // Same chat reuses even when the attachment points at the other folder.
      await turn("multi-a", "D:\\work\\b");
      snap = provider.mappedSessions();
    } finally {
      globalThis.fetch = realFetch;
      vsc.workspace.workspaceFolders = prevFolders;
      vsc.window.activeTextEditor = prevEditor;
      provider.dispose();
    }
    assert.equal(createBodies.length, 2, "third turn reuses multi-a (no fork)");
    const dirOf = (body: unknown) =>
      (body as { location?: { directory?: string } }).location?.directory;
    assert.equal(dirOf(createBodies[0]), "D:\\work\\a");
    assert.equal(dirOf(createBodies[1]), "D:\\work\\b");
    const byKey = new Map(snap.map((e) => [e.key, e]));
    assert.equal(byKey.get("conv:multi-a")?.directory, "D:\\work\\a", "reuse pins the create-time directory");
    assert.equal(byKey.get("conv:multi-b")?.directory, "D:\\work\\b");
  });
});

describe("directoryGroupKey (T-0025)", () => {
  it("maps missing/blank directories to unknown", () => {
    assert.equal(directoryGroupKey(undefined), UNKNOWN_DIRECTORY_GROUP);
    assert.equal(directoryGroupKey(""), UNKNOWN_DIRECTORY_GROUP);
    assert.equal(directoryGroupKey("   "), UNKNOWN_DIRECTORY_GROUP);
  });

  it("keeps real directories verbatim", () => {
    assert.equal(directoryGroupKey("D:\\work\\a"), "D:\\work\\a");
    assert.equal(directoryGroupKey("D:\\work\\proj"), "D:\\work\\proj");
  });
});

describe("chooseEvictionKey with group filter (T-0025)", () => {
  it("ignores keys outside the victim group", () => {
    const groupOf = (key: string): string | undefined =>
      key.startsWith("conv:a") ? "D:\\work\\a" : "D:\\work\\b";
    assert.equal(
      chooseEvictionKey(["conv:a-old", "conv:b-old", "conv:a-new"], new Set(), groupOf, "D:\\work\\b"),
      "conv:b-old",
    );
  });

  it("dead-first holds within the victim group only", () => {
    const groupOf = (key: string): string | undefined =>
      key.startsWith("conv:a") ? "D:\\work\\a" : "D:\\work\\b";
    // conv:a-dead is dead but in the other group — must not win.
    assert.equal(
      chooseEvictionKey(
        ["conv:a-dead", "conv:b-live-old", "conv:b-live-new"],
        new Set(["conv:a-dead"]),
        groupOf,
        "D:\\work\\b",
      ),
      "conv:b-live-old",
    );
    // Dead in the victim group wins over older live in the same group.
    assert.equal(
      chooseEvictionKey(
        ["conv:b-live-old", "conv:b-dead", "conv:b-live-new"],
        new Set(["conv:b-dead"]),
        groupOf,
        "D:\\work\\b",
      ),
      "conv:b-dead",
    );
  });

  it("returns undefined when the victim group is empty", () => {
    const groupOf = (): string | undefined => "D:\\work\\a";
    assert.equal(chooseEvictionKey(["conv:a-1"], new Set(), groupOf, "D:\\work\\b"), undefined);
    assert.equal(chooseEvictionKey([], new Set(), groupOf, "D:\\work\\a"), undefined);
  });

  it("omitted filter keeps the legacy global behavior", () => {
    assert.equal(chooseEvictionKey(["conv:a", "conv:b"], new Set()), "conv:a");
    assert.equal(chooseEvictionKey(["conv:a", "conv:b"], new Set(["conv:b"])), "conv:b");
  });
});

describe("per-workspace cap at create time (T-0025)", () => {
  const model = { id: "m", providerID: "p", pickerId: "m" };

  async function withFetchStub(sessionId: string, run: () => Promise<void>): Promise<void> {
    const realFetch = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>)["fetch"] = async () =>
      new Response(JSON.stringify({ data: { id: sessionId } }), { status: 200 });
    try {
      await run();
    } finally {
      (globalThis as unknown as Record<string, unknown>)["fetch"] = realFetch;
    }
  }

  it("filling group A past cap never evicts group B", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:b1", { sessionId: "ses_b1", modelKey: "m", directory: "D:\\work\\b" }],
        ["conv:b2", { sessionId: "ses_b2", modelKey: "m", directory: "D:\\work\\b" }],
        ["conv:a1", { sessionId: "ses_a1", modelKey: "m", directory: "D:\\work\\a" }],
        ["conv:a2", { sessionId: "ses_a2", modelKey: "m", directory: "D:\\work\\a" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    await withFetchStub("ses_a3", async () => {
      await map.getOrCreate("conv:a3", { baseUrl: "http://127.0.0.1:9", password: "", directory: "D:\\work\\a" }, model);
    });
    assert.equal(map.peek("conv:b1"), "ses_b1", "other group untouched");
    assert.equal(map.peek("conv:b2"), "ses_b2", "other group untouched");
    assert.equal(map.peek("conv:a1"), undefined, "oldest in victim group evicted");
    assert.equal(map.peek("conv:a2"), "ses_a2");
    assert.equal(map.peek("conv:a3"), "ses_a3");
    assert.equal(map.isDropped("conv:a1"), true);
    assert.equal(map.isDropped("conv:b1"), false);
    assert.deepEqual(map.orphanedSessions(), ["ses_a1"]);
  });

  it("dead-first holds within the victim group only", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:a-live", { sessionId: "ses_a_live", modelKey: "m", directory: "D:\\work\\a" }],
        ["conv:a-doomed", { sessionId: "ses_a_doomed", modelKey: "m", directory: "D:\\work\\a" }],
        ["conv:b-dead", { sessionId: "ses_b_dead", modelKey: "m", directory: "D:\\work\\b" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    map.markDead("conv:b-dead");
    map.markDead("conv:a-doomed");
    await withFetchStub("ses_a_new", async () => {
      await map.getOrCreate("conv:a-new", { baseUrl: "http://127.0.0.1:9", password: "", directory: "D:\\work\\a" }, model);
    });
    assert.equal(map.peek("conv:a-doomed"), undefined, "dead in victim group evicted first");
    assert.equal(map.peek("conv:a-live"), "ses_a_live");
    assert.equal(map.peek("conv:b-dead"), "ses_b_dead", "dead in other group never evicted");
    assert.deepEqual(map.orphanedSessions(), [], "gone-confirmed eviction buries nothing");
  });

  it("unknown group is its own group (blank directory)", async () => {
    const store = fakeStore({
      "oct.conversationSessions.v1": [
        ["conv:u1", { sessionId: "ses_u1", modelKey: "m" }],
        ["conv:u2", { sessionId: "ses_u2", modelKey: "m" }],
        ["conv:a1", { sessionId: "ses_a1", modelKey: "m", directory: "D:\\work\\a" }],
        ["conv:a2", { sessionId: "ses_a2", modelKey: "m", directory: "D:\\work\\a" }],
      ],
    });
    const map = new OctSessionMap(store, 2);
    await withFetchStub("ses_u3", async () => {
      await map.getOrCreate("conv:u3", { baseUrl: "http://127.0.0.1:9", password: "", directory: "" }, model);
    });
    assert.equal(map.peek("conv:u1"), undefined, "oldest unknown evicted");
    assert.equal(map.peek("conv:u2"), "ses_u2");
    assert.equal(map.peek("conv:u3"), "ses_u3");
    assert.equal(map.peek("conv:a1"), "ses_a1", "directory group untouched");
    assert.equal(map.peek("conv:a2"), "ses_a2");
  });
});

describe("per-workspace cap at restore time (T-0025)", () => {
  it("overflow is per group: two full groups restore fully", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string; directory?: string }]> = [
      ["conv:a1", { sessionId: "ses_a1", modelKey: "m", directory: "D:\\work\\a" }],
      ["conv:a2", { sessionId: "ses_a2", modelKey: "m", directory: "D:\\work\\a" }],
      ["conv:b1", { sessionId: "ses_b1", modelKey: "m", directory: "D:\\work\\b" }],
      ["conv:b2", { sessionId: "ses_b2", modelKey: "m", directory: "D:\\work\\b" }],
    ];
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }), 2);
    assert.equal(map.size(), 4, "cap 2 per group holds 2+2");
    assert.equal(map.peek("conv:a1"), "ses_a1");
    assert.equal(map.peek("conv:b2"), "ses_b2");
    assert.deepEqual(map.droppedSnapshot(), [], "no drops when each group fits");
  });

  it("overflow within one group drops only that group's tail", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string; directory?: string }]> = [
      ["conv:a1", { sessionId: "ses_a1", modelKey: "m", directory: "D:\\work\\a" }],
      ["conv:a2", { sessionId: "ses_a2", modelKey: "m", directory: "D:\\work\\a" }],
      ["conv:a3", { sessionId: "ses_a3", modelKey: "m", directory: "D:\\work\\a" }],
      ["conv:b1", { sessionId: "ses_b1", modelKey: "m", directory: "D:\\work\\b" }],
    ];
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }), 2);
    assert.equal(map.size(), 3);
    assert.equal(map.peek("conv:a1"), "ses_a1");
    assert.equal(map.peek("conv:a2"), "ses_a2");
    assert.equal(map.peek("conv:a3"), undefined);
    assert.equal(map.peek("conv:b1"), "ses_b1");
    assert.equal(map.isDropped("conv:a3"), true);
    assert.deepEqual(map.orphanedSessions(), ["ses_a3"]);
  });

  it("v1 rows without directory migrate into unknown without crowding directories", () => {
    const stored: Array<[string, { sessionId: string; modelKey: string; directory?: string }]> = [
      ["conv:u1", { sessionId: "ses_u1", modelKey: "m" }],
      ["conv:u2", { sessionId: "ses_u2", modelKey: "m" }],
      ["conv:u3", { sessionId: "ses_u3", modelKey: "m" }],
      ["conv:a1", { sessionId: "ses_a1", modelKey: "m", directory: "D:\\work\\a" }],
    ];
    const map = new OctSessionMap(fakeStore({ "oct.conversationSessions.v1": stored }), 2);
    assert.equal(map.peek("conv:u1"), "ses_u1");
    assert.equal(map.peek("conv:u2"), "ses_u2");
    assert.equal(map.peek("conv:u3"), undefined, "third unknown drops");
    assert.equal(map.peek("conv:a1"), "ses_a1", "directory group unaffected by unknown overflow");
    assert.equal(map.isDropped("conv:u3"), true);
  });
});

describe("sessionLastActivityMs (T-0027)", () => {
  it("prefers time.updated over time.created", () => {
    assert.equal(
      sessionLastActivityMs({ time: { created: 1000, updated: 2000 } }),
      2000,
    );
  });

  it("falls back to created when updated is missing", () => {
    assert.equal(sessionLastActivityMs({ time: { created: 1500 } }), 1500);
    assert.equal(sessionLastActivityMs({ time: { created: 1500, updated: 0 } }), 1500);
  });

  it("tolerates ISO strings on either field", () => {
    const created = Date.parse("2026-10-05T10:00:00.000Z");
    const updated = Date.parse("2026-10-06T10:00:00.000Z");
    assert.equal(
      sessionLastActivityMs({ time: { created: "2026-10-05T10:00:00.000Z", updated: "2026-10-06T10:00:00.000Z" } }),
      updated,
    );
    assert.equal(sessionLastActivityMs({ time: { created: "2026-10-05T10:00:00.000Z" } }), created);
  });

  it("yields undefined on garbage (age unknown)", () => {
    assert.equal(sessionLastActivityMs({ time: {} }), undefined);
    assert.equal(sessionLastActivityMs({}), undefined);
    assert.equal(sessionLastActivityMs(null), undefined);
    assert.equal(sessionLastActivityMs({ time: { created: -5, updated: "nope" } }), undefined);
  });
});

describe("shortConversationKey (T-0027)", () => {
  it("truncates long ids to 12 chars with an ellipsis", () => {
    assert.equal(shortConversationKey("conv:4506f33d-553a-xxxx"), "conv:4506f33d-553…");
    assert.equal(shortConversationKey("hash:abcdef0123456789abcdef"), "hash:abcdef012345…");
  });

  it("keeps short keys verbatim", () => {
    assert.equal(shortConversationKey("conv:abc"), "conv:abc");
    assert.equal(shortConversationKey("conv:123456789012"), "conv:123456789012");
  });

  it("returns colon-free input unchanged", () => {
    assert.equal(shortConversationKey("plain"), "plain");
  });
});

describe("escapeHtml (T-0027)", () => {
  it("escapes markup-significant chars", () => {
    assert.equal(
      escapeHtml('<b>"a"&\'b\'>'),
      "&lt;b&gt;&quot;a&quot;&amp;&#39;b&#39;&gt;",
    );
  });

  it("coerces missing values to empty", () => {
    assert.equal(escapeHtml(undefined), "");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(42), "42");
  });
});

describe("buildSessionTableGroups (T-0027)", () => {
  const now = 1_000_000_000_000;

  it("shapes rows with the 4 columns and groups unknown last", () => {
    const mapped = [
      { key: "conv:1", sessionId: "ses_1", modelKey: "m", directory: "D:\\b" },
      { key: "conv:2", sessionId: "ses_2", modelKey: "m" },
      { key: "conv:3", sessionId: "ses_3", modelKey: "m", directory: "D:\\a" },
    ];
    const infoById = new Map<string, unknown>([
      ["ses_1", { id: "ses_1", title: "first", time: { created: now - 3_600_000, updated: now - 60_000 } }],
      ["ses_2", { id: "ses_2", title: "second", time: { created: now - 86_400_000 } }],
      ["ses_3", { id: "ses_3", title: "", time: {} }],
    ]);
    const groups = buildSessionTableGroups(mapped, infoById, now);
    assert.deepEqual(groups.map((g) => g.directory), ["D:\\a", "D:\\b", UNKNOWN_DIRECTORY_GROUP]);
    const byId = new Map(groups.flatMap((g) => g.entries).map((r) => [r.sessionId, r]));
    assert.equal(byId.get("ses_1")?.copilotId, "conv:1");
    assert.equal(byId.get("ses_1")?.group, "D:\\b");
    assert.equal(byId.get("ses_1")?.title, "first");
    assert.match(byId.get("ses_1")?.lastChat ?? "", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(1 minute ago\)$/, "updated drives last chat");
    assert.match(byId.get("ses_2")?.lastChat ?? "", /\(24 hours ago\)$/, "created fallback when updated is missing");
    assert.equal(byId.get("ses_3")?.lastChat, undefined, "garbage times stay age-unknown");
    assert.equal(byId.get("ses_3")?.title, "(title unavailable)", "empty title falls back");
  });

  it("keeps unlisted sessions as age-unknown rows (never drops)", () => {
    const mapped = [{ key: "conv:ghost", sessionId: "ses_ghost", modelKey: "m" }];
    const groups = buildSessionTableGroups(mapped, new Map(), now);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].directory, UNKNOWN_DIRECTORY_GROUP);
    assert.equal(groups[0].entries.length, 1);
    assert.equal(groups[0].entries[0].lastChat, undefined);
    assert.equal(groups[0].entries[0].title, "(title unavailable)");
  });

  it("keeps map order within a group", () => {
    const mapped = [
      { key: "conv:a", sessionId: "ses_a", modelKey: "m", directory: "D:\\w" },
      { key: "conv:b", sessionId: "ses_b", modelKey: "m", directory: "D:\\w" },
    ];
    const groups = buildSessionTableGroups(mapped, new Map(), now);
    assert.deepEqual(groups[0].entries.map((e) => e.key), ["conv:a", "conv:b"]);
  });
});

describe("createNonce (T-0027)", () => {
  it("yields 32 alphanumeric chars", () => {
    for (let i = 0; i < 5; i++) {
      assert.match(createNonce(), /^[A-Za-z0-9]{32}$/);
    }
  });
});

describe("renderSessionsHtml (T-0027 v2)", () => {
  const renderNow = 1_000_000_000_000;
  const renderMapped = [
    { key: "conv:4506f33d-553a-aaaa-bbbb-cccccccccccc", sessionId: "ses_aaa", modelKey: "m", directory: "D:\\w" },
    { key: "conv:u1", sessionId: "ses_u1", modelKey: "m" },
  ];
  const renderInfoById = new Map<string, unknown>([
    ["ses_aaa", { id: "ses_aaa", title: "first chat", time: { created: renderNow - 60_000, updated: renderNow - 60_000 } }],
    ["ses_u1", { id: "ses_u1", title: "lone chat", time: { created: renderNow - 3_600_000 } }],
  ]);
  const renderHtml = (nonce = "n0nce0123456789n0nce0123456789ab"): string =>
    renderSessionsHtml(buildSessionTableGroups(renderMapped, renderInfoById, renderNow), renderMapped.length, 0, nonce);

  it("renders 5 columns with no Group column", () => {
    const out = renderHtml();
    assert.ok(out.includes("<th>Last chat</th>"), "last chat header");
    assert.ok(out.includes("<th>Copilot chat</th>"), "copilot header");
    assert.ok(out.includes("<th>Opencode session</th>"), "opencode header");
    assert.ok(out.includes("<th>Opencode title</th>"), "title header");
    assert.ok(out.includes("<th>Tokens</th>"), "tokens header (T-0028)");
    assert.ok(!out.includes("<th>Group</th>"), "group column removed");
  });

  it("shows full ids as plain selectable text", () => {
    const out = renderHtml();
    assert.ok(
      out.includes('<td class="col-copilot selectable">conv:4506f33d-553a-aaaa-bbbb-cccccccccccc</td>'),
      "full copilot key, untruncated",
    );
    assert.ok(out.includes('<td class="col-opencode selectable">ses_aaa</td>'), "full opencode id");
    assert.ok(out.includes('<td class="col-title selectable">first chat</td>'), "title plain, no folder link");
    assert.ok(!out.includes("user-select:all"), "single click no longer force-selects");
    assert.ok(out.includes('"dblclick"'), "double-click delegate present");
    assert.ok(out.includes("selectNodeContents"), "double-click selects the whole cell value");
  });

  it("shows full timestamps with verbose relative ages", () => {
    const out = renderHtml();
    assert.match(out, /<td class="col-last">\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(1 minute ago\)<\/td>/);
    assert.match(out, /<td class="col-last">\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(1 hour ago\)<\/td>/);
  });

  it("links the group header to open the folder (titles stay plain)", () => {
    const out = renderHtml();
    assert.ok(
      out.includes('data-folder="D:\\w"'),
      "group header links the workspace folder",
    );
    assert.ok(
      out.includes("<h2>unknown — 1 conversation(s)</h2>"),
      "unknown group header is plain text (no folder to open)",
    );
    assert.ok(
      out.includes('<td class="col-title selectable">lone chat</td>'),
      "unknown group title cell is plain text",
    );
  });

  it("escapes hostile titles and paths", () => {
    const evil = buildSessionTableGroups(
      [{ key: "conv:e", sessionId: "ses_e", modelKey: "m", directory: 'D:\\w"><script>alert(1)</script>' }],
      new Map([["ses_e", { id: "ses_e", title: "<img src=x onerror=alert(1)>", time: { created: renderNow } }]]),
      renderNow,
    );
    const out = renderSessionsHtml(evil, 1, 0, "n0nce0123456789n0nce0123456789ab");
    assert.ok(!out.includes("<img src=x"), "raw title markup never renders");
    assert.ok(out.includes("&lt;img src=x"), "title escaped");
    assert.ok(!out.includes("<script>alert"), "raw path script never renders");
    assert.ok(!out.includes('data-folder="D:\\w">'), "raw path never lands in the attribute");
  });

  it("binds the click script to the CSP nonce", () => {
    const nonce = "n0nce0123456789n0nce0123456789ab";
    const out = renderHtml(nonce);
    assert.ok(out.includes(`script-src 'nonce-${nonce}'`), "CSP allows only the nonce");
    assert.ok(out.includes(`<script nonce="${nonce}">`), "script carries the nonce");
    assert.ok(out.includes("open-folder"), "click delegate posts open-folder");
  });

  it("wraps cells with min-widths inside scrolling wrappers", () => {
    const out = renderHtml();
    assert.ok(out.includes('class="table-wrap"'), "scroll wrapper per table");
    assert.ok(out.includes("overflow:auto"), "x/y scroll when cramped");
    assert.ok(out.includes("overflow-wrap:anywhere"), "long ids wrap");
    assert.ok(out.includes("min-width:1160px"), "table min-width forces x-scroll, not squish");
    assert.ok(out.includes("col-usage"), "tokens column has a min-width");
  });

  it("renders the empty state without tables", () => {
    const out = renderSessionsHtml([], 0, 0, "n0nce0123456789n0nce0123456789ab");
    assert.ok(out.includes("No mapped conversations yet"), "empty note");
    assert.ok(!out.includes("<table>"), "no table when empty");
  });
});
