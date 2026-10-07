// OCT tool shuttle plugin (bundled with the extension).
//
// Bridges Copilot tools into the engine: per-turn Copilot tool definitions
// are pulled from the extension's loopback callback server, registered as
// direct plugin tools (`codemode:false`), and scoped per request via the
// session.context hook. Executors POST back to the extension and block for
// the host-executed result (block-and-resume, proven in T-0005).
//
// Why pull (not push): the tool registry only changes via `tool.transform`
// (sync), while `session.prompt`/`session.context` hooks run per request and
// may be async. The prompt hook pulls the current turn's tools into module
// state and reloads the registry; the transform reconciles; the context hook
// narrows the advertised catalog to this session's set. Hook-invented tools
// are dropped by the engine, so everything advertised here comes from the
// registry.
//
// Env:
// - OCT_CALLBACK_URL: extension loopback callback server (e.g.
//   http://127.0.0.1:PORT). Absent = bridge disabled, engine-native only.
// - OCT_PLUGIN_DEBUG=1: verbose console.error diagnostics (server logs).
//
// This file is plain dependency-free JS: the engine loads the directory
// (`index.js`) directly, no build step.

const PLUGIN_ID = "oct-tools";
const CALLBACK_URL = (process.env.OCT_CALLBACK_URL ?? "").trim().replace(/\/+$/, "");
const CALLBACK_TOKEN = (process.env.OCT_CALLBACK_TOKEN ?? "").trim();
const DEBUG = process.env.OCT_PLUGIN_DEBUG === "1";

/** Prefix for every bridge tool: avoids collisions with engine natives and
 *  lets the context hook filter precisely. The extension maps these back to
 *  the original Copilot names; this plugin never invents names. */
const BRIDGE_PREFIX = "oct__";

/** sessionID -> [{name, description, input}] for the current turn. */
const pendingBySession = new Map();

function debug(...args) {
  if (DEBUG) {
    console.error(`[${PLUGIN_ID}]`, ...args);
  }
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function validFilePart(file) {
  return (
    file &&
    typeof file === "object" &&
    typeof file.uri === "string" &&
    file.uri.length > 0 &&
    typeof file.mime === "string" &&
    (file.mime.toLowerCase().startsWith("image/") || file.mime.toLowerCase() === "application/pdf") &&
    (file.name === undefined || typeof file.name === "string")
  );
}

function makeExecutor(toolName) {
  return async (input, context) => {
    if (!CALLBACK_URL) {
      return { content: `OCT bridge unavailable (no callback URL); tool ${toolName} was not executed.` };
    }
    const payload = {
      tool: toolName,
      input: input ?? {},
      sessionID: context.sessionID,
      id: context.id,
      messageID: context.messageID,
    };
    const headers = { "Content-Type": "application/json" };
    if (CALLBACK_TOKEN) {
      headers["x-oct-token"] = CALLBACK_TOKEN;
    }
    let signalFired = false;
    const onAbort = () => {
      signalFired = true;
    };
    context.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(`${CALLBACK_URL}/oct/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: context.signal,
      });
      const reply = await res.json();
      if (reply && reply.aborted) {
        return { content: reply.text ?? `Tool ${toolName} aborted before the host returned a result.` };
      }
      const text = reply && typeof reply.text === "string" ? reply.text : "";
      // T-0023 image ferry: the extension may attach `files` (Tool file
      // parts). Return engine-native content so the vision model sees bytes,
      // not a placeholder. Text-only replies keep the old string shape.
      const files = reply && Array.isArray(reply.files) ? reply.files.filter(validFilePart) : [];
      if (files.length === 0) {
        return { content: text || "(empty tool result)" };
      }
      const content = [];
      if (text) {
        content.push({ type: "text", text });
      }
      for (const file of files) {
        content.push({
          type: "file",
          uri: file.uri,
          mime: file.mime,
          ...(typeof file.name === "string" && file.name ? { name: file.name } : {}),
        });
      }
      if (content.length === 0) {
        content.push({ type: "text", text: "(empty tool result)" });
      }
      return { content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Interrupt fires context.signal: the engine already marks the call
      // aborted (T-0005 probe); return a marker, do not throw.
      return { content: `OCT bridge ${signalFired ? "aborted" : "error"} for ${toolName}: ${message}` };
    } finally {
      context.signal.removeEventListener("abort", onAbort);
    }
  };
}

function isBridgeTool(name) {
  return typeof name === "string" && name.startsWith(BRIDGE_PREFIX);
}

function validDef(def) {
  return (
    def &&
    typeof def.name === "string" &&
    def.name.startsWith(BRIDGE_PREFIX) &&
    typeof def.description === "string" &&
    def.description.length > 0 &&
    def.input &&
    typeof def.input === "object"
  );
}

export default {
  id: PLUGIN_ID,
  setup(ctx) {
    // Per-prompt: pull this turn's Copilot tools for the session, then flag
    // the registry for rebuild (transforms re-run on the next read).
    ctx.session.hook("prompt", async (event) => {
      try {
        if (!CALLBACK_URL) {
          return;
        }
        const sessionID = event.sessionID;
        const headers = CALLBACK_TOKEN ? { "x-oct-token": CALLBACK_TOKEN } : undefined;
        const res = await fetchJson(
          `${CALLBACK_URL}/oct/pending-tools?sessionID=${encodeURIComponent(sessionID)}`,
          { method: "GET", headers },
          5000,
        );
        if (res && res.ok) {
          const data = await res.json();
          const tools = Array.isArray(data && data.tools) ? data.tools.filter(validDef) : [];
          if (tools.length > 0) {
            pendingBySession.set(sessionID, tools);
            debug(`prompt ${sessionID}: ${tools.length} pending tool(s)`);
          } else {
            pendingBySession.delete(sessionID);
          }
        }
        await ctx.tool.reload();
      } catch (err) {
        // Never break admission: text-only fallback.
        console.error(`[${PLUGIN_ID}] prompt hook failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // Registry reconcile (sync): registry := union of pending across sessions.
    // Stale entries (no pending session claims them) are removed.
    ctx.tool.transform((editor) => {
      try {
        const wanted = new Map();
        for (const tools of pendingBySession.values()) {
          for (const def of tools) {
            if (validDef(def) && !wanted.has(def.name)) {
              wanted.set(def.name, def);
            }
          }
        }
        for (const existing of editor.list()) {
          if (isBridgeTool(existing.name) && !wanted.has(existing.name)) {
            editor.remove(existing.id);
          }
        }
        for (const def of wanted.values()) {
          if (!editor.get(def.name)) {
            editor.add({
              name: def.name,
              description: def.description,
              input: def.input,
              options: { codemode: false },
              execute: makeExecutor(def.name),
            });
          }
        }
        if (wanted.size > 0) {
          debug(`transform: ${wanted.size} bridge tool(s) registered`);
        }
      } catch (err) {
        console.error(`[${PLUGIN_ID}] tool transform failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // Per-model-call scoping: advertise only this session's current tools.
    // Engine natives are untouched; other sessions' bridge tools are hidden.
    ctx.session.hook("context", (event) => {
      try {
        const allowed = new Set((pendingBySession.get(event.sessionID) ?? []).map((def) => def.name));
        for (const name of Object.keys(event.tools ?? {})) {
          if (isBridgeTool(name) && !allowed.has(name)) {
            delete event.tools[name];
          }
        }
      } catch (err) {
        console.error(`[${PLUGIN_ID}] context hook failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  },
};
