import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import { OctHttpError } from "../src/server/client";
import { streamTurn } from "../src/provider/streaming";

/** Admission-failure path: a rejected prompt must fail fast with the typed
 *  error, never park on a quiet event stream until the turn timeout
 *  (EDH 2026-10-04: deleted-session turn hung, then failed). */

function nullProgress(): vscode.Progress<vscode.LanguageModelResponsePart> {
  return { report() {} } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;
}

function nullToken(): vscode.CancellationToken {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose() {} }),
  } as unknown as vscode.CancellationToken;
}

describe("streamTurn admission failure", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("surfaces a typed 404 fast instead of parking on a quiet stream", async () => {
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/event")) {
        // Quiet server: stream opens but never yields a frame.
        return new Response(new ReadableStream({ start() {} }), {
          headers: { "content-type": "text/event-stream" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const started = Date.now();
    await assert.rejects(
      streamTurn(
        { baseUrl: "http://127.0.0.1:9", password: "", sessionId: "ses_dead", promptText: "hello", timeoutMs: 20_000 },
        nullProgress(),
        nullToken(),
      ),
      (error: unknown) => error instanceof OctHttpError && error.status === 404,
    );
    assert.ok(Date.now() - started < 10_000, "must not wait for the turn timeout");
  });
});
