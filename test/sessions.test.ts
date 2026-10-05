import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  OctSessionMap,
  conversationKey,
  DELETED_SESSION_MESSAGE,
  DROPPED_SESSION_MESSAGE,
  deriveSessionTitle,
  extractUserPromptText,
  fallbackSessionTitle,
  isSessionGoneError,
  sessionTitleFromMessages,
  trackOrphaned,
  chooseEvictionKey,
  groupSnapshotsByDirectory,
  sessionCreatedMs,
  formatSessionAge,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_SESSION_TITLE,
  MAX_ORPHANED_SESSIONS,
  UNKNOWN_DIRECTORY_GROUP,
} from "../src/provider/sessions";
import { OctHttpError } from "../src/server/client";
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
        ["conv:live", { sessionId: "ses_live", modelKey: "m" }],
        ["conv:doomed", { sessionId: "ses_doomed", modelKey: "m" }],
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
        ["conv:old", { sessionId: "ses_old", modelKey: "m" }],
        ["conv:keep", { sessionId: "ses_keep", modelKey: "m" }],
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
        ["conv:old", { sessionId: "ses_old", modelKey: "m" }],
        ["conv:keep", { sessionId: "ses_keep", modelKey: "m" }],
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
        ["conv:live", { sessionId: "ses_live", modelKey: "m" }],
        ["conv:doomed", { sessionId: "ses_doomed", modelKey: "m" }],
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
