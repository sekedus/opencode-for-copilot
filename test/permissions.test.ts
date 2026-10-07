import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  PermissionTranslator,
  isReadAction,
  readCopilotPermissionLevel,
  resolveApprovalMode,
  type PermissionAsked,
} from "../src/provider/permissions";
import { withAskAllPermissions } from "../src/server/manager";

function asked(action: string, resources: string[] = ["a.txt"]): PermissionAsked {
  return { id: "p1", sessionID: "ses_1", action, resources, filesPreview: [] };
}

function fakeToken(): vscode.CancellationToken {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose() {} }),
  } as unknown as vscode.CancellationToken;
}

/** Controllable `chat.permissions.default` stand-in. */
let chatLevel: unknown;

const ws = vscode.workspace as unknown as {
  getConfiguration: (section?: string) => { get: (key: string, def?: unknown) => unknown };
};
const realGetConfiguration = ws.getConfiguration;

const win = vscode.window as unknown as {
  showWarningMessage: (...args: unknown[]) => Promise<string | undefined>;
};
const realShowWarningMessage = win.showWarningMessage;
let dialogCalls: unknown[][] = [];
let dialogNext: string | undefined | "never" = "Allow";

/** Engine reply decisions captured from the fetch stub (`once`/`reject`). */
let replyDecisions: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  chatLevel = undefined;
  dialogCalls = [];
  dialogNext = "Allow";
  replyDecisions = [];
  ws.getConfiguration = ((section?: string) => {
    if (section === "chat") {
      return {
        get: (key: string, def?: unknown) => (key === "permissions.default" ? (chatLevel ?? def) : def),
      };
    }
    return {
      get: (_key: string, def?: unknown) => def,
    };
  }) as typeof ws.getConfiguration;
  win.showWarningMessage = (...args: unknown[]) => {
    dialogCalls.push(args);
    if (dialogNext === "never") {
      return new Promise<string | undefined>(() => {});
    }
    return Promise.resolve(dialogNext);
  };
  (globalThis as unknown as Record<string, unknown>)["fetch"] = async (url: unknown, init?: { body?: unknown }) => {
    if (typeof url === "string" && url.includes("/permission/") && typeof init?.body === "string") {
      try {
        const parsed = JSON.parse(init.body) as { decision?: unknown };
        if (typeof parsed.decision === "string") {
          replyDecisions.push(parsed.decision);
        }
      } catch {
        // Ignore malformed bodies in the stub.
      }
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
});

afterEach(() => {
  ws.getConfiguration = realGetConfiguration;
  win.showWarningMessage = realShowWarningMessage;
  globalThis.fetch = realFetch;
});

describe("isReadAction", () => {
  it("matches only the exact read action", () => {
    assert.equal(isReadAction("read"), true);
    for (const other of ["Read", "READ", "readx", "edit", "write", "shell", ""]) {
      assert.equal(isReadAction(other), false);
    }
  });
});

describe("resolveApprovalMode", () => {
  it("read is silent under every Copilot setting", () => {
    for (const level of ["default", "autoApprove", "autopilot", "assisted", "weird-future-value", undefined]) {
      assert.equal(resolveApprovalMode(level, "read"), "allow-silent");
    }
  });

  it("non-read asks on default/missing/unknown/assisted", () => {
    for (const level of ["default", "assisted", "weird-future-value", undefined]) {
      assert.equal(resolveApprovalMode(level, "edit"), "ask");
      assert.equal(resolveApprovalMode(level, "shell"), "ask");
    }
  });

  it("non-read allows silently on Bypass/Autopilot only", () => {
    assert.equal(resolveApprovalMode("autoApprove", "edit"), "allow-silent");
    assert.equal(resolveApprovalMode("autopilot", "shell"), "allow-silent");
  });
});

describe("readCopilotPermissionLevel", () => {
  it("reads fresh every time with no caching", () => {
    chatLevel = "default";
    assert.equal(readCopilotPermissionLevel(), "default");
    chatLevel = "autopilot";
    assert.equal(readCopilotPermissionLevel(), "autopilot");
    chatLevel = undefined;
    assert.equal(readCopilotPermissionLevel(), undefined);
  });
});

describe("PermissionTranslator.ask (T-0020)", () => {
  const deps = { baseUrl: "http://127.0.0.1:9", password: "", timeoutMs: 1000 };

  it("read auto-continues silently under every Copilot setting", async () => {
    for (const level of ["default", "autoApprove", "autopilot", "assisted", undefined]) {
      chatLevel = level;
      dialogCalls = [];
      replyDecisions = [];
      const outcome = await new PermissionTranslator().ask(deps, asked("read"), fakeToken());
      assert.equal(outcome, "continued");
      assert.equal(dialogCalls.length, 0);
      assert.deepEqual(replyDecisions, ["once"]);
    }
  });

  it("Bypass/Autopilot auto-continue non-read silently", async () => {
    for (const level of ["autoApprove", "autopilot"]) {
      chatLevel = level;
      dialogCalls = [];
      replyDecisions = [];
      const outcome = await new PermissionTranslator().ask(deps, asked("edit"), fakeToken());
      assert.equal(outcome, "continued");
      assert.equal(dialogCalls.length, 0);
      assert.deepEqual(replyDecisions, ["once"]);
    }
  });

  it("Default asks with two buttons; Allow continues once", async () => {
    chatLevel = "default";
    dialogNext = "Allow";
    const outcome = await new PermissionTranslator().ask(deps, asked("edit", ["a.txt"]), fakeToken());
    assert.equal(outcome, "continued");
    assert.equal(dialogCalls.length, 1);
    assert.deepEqual((dialogCalls[0] as unknown[]).slice(1), ["Allow", "Cancel"]);
    assert.deepEqual(replyDecisions, ["once"]);
  });

  it("missing/unknown/assisted levels ask (never silent)", async () => {
    for (const level of [undefined, "weird-future-value", "assisted"]) {
      chatLevel = level;
      dialogCalls = [];
      dialogNext = "Allow";
      const outcome = await new PermissionTranslator().ask(deps, asked("shell"), fakeToken());
      assert.equal(outcome, "continued");
      assert.equal(dialogCalls.length, 1);
    }
  });

  it("Cancel and dismiss deny under every dialog setting", async () => {
    for (const level of ["default", undefined, "assisted", "weird-future-value"] as const) {
      for (const answer of ["Cancel", undefined] as const) {
        chatLevel = level;
        dialogCalls = [];
        replyDecisions = [];
        dialogNext = answer;
        const outcome = await new PermissionTranslator().ask(deps, asked("edit"), fakeToken());
        assert.equal(outcome, "rejected");
        assert.deepEqual(replyDecisions, ["reject"]);
      }
    }
  });

  it("no-answer timeout denies (default-deny)", async () => {
    chatLevel = "default";
    dialogNext = "never";
    replyDecisions = [];
    const outcome = await new PermissionTranslator().ask({ ...deps, timeoutMs: 20 }, asked("edit"), fakeToken());
    assert.equal(outcome, "rejected");
    assert.deepEqual(replyDecisions, ["reject"]);
  });

  it("never replies always and holds no session-trust state", async () => {
    chatLevel = "default";
    dialogNext = "Allow";
    const translator = new PermissionTranslator();
    await translator.ask(deps, asked("edit"), fakeToken());
    chatLevel = "autoApprove";
    await translator.ask(deps, asked("shell"), fakeToken());
    await translator.ask(deps, asked("read"), fakeToken());
    assert.ok(!replyDecisions.includes("always"), "no always reply on any path");
    const anyTranslator = translator as unknown as Record<string, unknown>;
    assert.equal(anyTranslator["trusted"], undefined);
    assert.equal(anyTranslator["isTrusted"], undefined);
    assert.equal(anyTranslator["forget"], undefined);
    assert.equal(translator.pendingCount(), 0);
  });
});

describe("withAskAllPermissions", () => {
  it("adds ask-all to a fresh record", () => {
    assert.deepEqual(withAskAllPermissions({ plugins: ["p"] }), {
      plugins: ["p"],
      permissions: [{ action: "*", resource: "*", effect: "ask" }],
    });
  });

  it("appends last (overriding allow/deny) and preserves other keys", () => {
    const out = withAskAllPermissions({
      plugins: ["p"],
      theme: "dark",
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
    });
    assert.equal(out["theme"], "dark");
    assert.deepEqual(out["permissions"], [
      { action: "*", resource: "*", effect: "allow" },
      { action: "*", resource: "*", effect: "ask" },
    ]);
  });

  it("dedupes an existing ask-all rule", () => {
    const out = withAskAllPermissions({
      permissions: [{ action: "*", resource: "*", effect: "ask" }],
    });
    assert.deepEqual(out["permissions"], [{ action: "*", resource: "*", effect: "ask" }]);
  });
});
