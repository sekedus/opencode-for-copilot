import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import { getInfo } from "./client";
import { logLine } from "../output";

export type ServerMode = "managed" | "external";
export type ServerStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ServerState {
  mode: ServerMode;
  status: ServerStatus;
  url: string | null;
  lastError: string | null;
  /** True when this extension spawned the process (safe to kill). */
  owned: boolean;
}

const READY_TIMEOUT_MS = 30000;
const READY_POLL_MS = 500;

/** Find a free loopback port by binding port 0 once. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Could not determine a free port."));
        }
      });
    });
  });
}

/**
 * Wait until `GET /api/info` succeeds. Returns the server version string.
 * Throws on timeout or connection refusal.
 */
async function waitForReady(baseUrl: string, password: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown";
  for (;;) {
    try {
      const info = await getInfo(baseUrl, password, READY_POLL_MS * 4);
      return info.version;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (Date.now() >= deadline) {
        throw new Error(`opencode server at ${baseUrl} did not become ready: ${lastError}`);
      }
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
  }
}

function killProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const pid = child.pid;
    if (pid === undefined) {
      resolve();
      return;
    }
    if (process.platform === "win32") {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }, (error) => {
        if (error && child.exitCode === null && child.signalCode === null) {
          reject(error);
        } else {
          resolve();
        }
      });
      return;
    }
    try {
      // Own group on POSIX (detached), so signals stay scoped to this server.
      process.kill(-pid, "SIGTERM");
    } catch {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Already gone.
      }
      resolve();
    }, 1500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Managed-mode ask-all engine permission (T-0020).
 * Appended LAST so it overrides global + workspace files under the engine's
 * last-match-wins evaluation; the `read` exception is applied in our
 * translator, not here.
 */
export const MANAGED_ASK_ALL_PERMISSION = { action: "*", resource: "*", effect: "ask" };

/**
 * Return a copy of a config-content record with the ask-all rule present
 * (appended last, deduped). Pure helper for unit tests; other keys untouched.
 */
export function withAskAllPermissions(record: Record<string, unknown>): Record<string, unknown> {
  const permissions = Array.isArray(record["permissions"]) ? [...(record["permissions"] as unknown[])] : [];
  const present = permissions.some(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      (entry as Record<string, unknown>)["action"] === "*" &&
      (entry as Record<string, unknown>)["resource"] === "*" &&
      (entry as Record<string, unknown>)["effect"] === "ask",
  );
  if (!present) {
    permissions.push({ ...MANAGED_ASK_ALL_PERMISSION });
  }
  return { ...record, permissions };
}

/**
 * Owns the opencode v2 server lifecycle.
 *
 * - External mode: `oct.opencodeUrl` set — health-check only, never spawn/kill.
 * - Managed mode: spawn `opencode serve --hostname 127.0.0.1 --port <free>`,
 *   parse `server listening on {url}` from stdout, poll `/api/info`, kill on stop.
 */
export class OctServerManager {
  private child: ChildProcess | null = null;
  private state: ServerState = { mode: "managed", status: "disconnected", url: null, lastError: null, owned: false };
  private starting: Promise<ServerState> | null = null;
  /** Credential for the current server (managed-generated or user-provided). Never logged. */
  private password = "";

  getState(): ServerState {
    return { ...this.state };
  }

  /** Password to use for API calls against the current server URL. */
  getPassword(): string {
    return this.password;
  }

  /**
   * Start (or health-check) the server. Idempotent while connected;
   * concurrent callers share the in-flight startup.
   */
  start(options: {
    binary: string;
    externalUrl: string;
    password: string;
    cwd: string;
    /** Absolute dir of the bundled `oct-tools` plugin (managed mode). */
    pluginDir?: string;
    /** Extension loopback callback URL for the tool shuttle (managed mode). */
    callbackUrl?: string;
    /** Bearer token the plugin sends back to the callback (managed mode). */
    callbackToken?: string;
  }): Promise<ServerState> {
    if (this.state.status === "connected") {
      return Promise.resolve(this.getState());
    }
    if (this.starting) {
      return this.starting;
    }
    this.starting = this.doStart(options).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(options: {
    binary: string;
    externalUrl: string;
    password: string;
    cwd: string;
    pluginDir?: string;
    callbackUrl?: string;
    callbackToken?: string;
  }): Promise<ServerState> {
    const externalUrl = options.externalUrl.trim().replace(/\/+$/, "");
    if (externalUrl) {
      this.password = options.password;
      this.state = { mode: "external", status: "connecting", url: externalUrl, lastError: null, owned: false };
      logLine(`Connecting to external opencode server at ${externalUrl} ...`);
      try {
        const version = await waitForReady(externalUrl, this.password, READY_TIMEOUT_MS);
        this.state = { mode: "external", status: "connected", url: externalUrl, lastError: null, owned: false };
        logLine(`Connected to external opencode server v${version} at ${externalUrl}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.state = { mode: "external", status: "error", url: externalUrl, lastError: message, owned: false };
        logLine(`External server not ready: ${message}`);
      }
      return this.getState();
    }

    this.state = { mode: "managed", status: "connecting", url: null, lastError: null, owned: false };
    const port = await findFreePort();
    // The server always requires a password; when none is configured it
    // generates a random one and prints it once. Generate our own so the
    // client always knows the credential. Never logged.
    const managedPassword = options.password || randomBytes(32).toString("base64url");
    this.password = managedPassword;
    const env: Record<string, string | undefined> = {
      ...process.env,
      OPENCODE_PASSWORD: managedPassword,
      OPENCODE_SERVER_PASSWORD: managedPassword,
    };
    if (options.callbackUrl) {
      env["OCT_CALLBACK_URL"] = options.callbackUrl;
    }
    if (options.callbackToken) {
      env["OCT_CALLBACK_TOKEN"] = options.callbackToken;
    }
    const pluginConfig = this.resolvePluginConfig(options.pluginDir);
    if (pluginConfig) {
      env["OPENCODE_CONFIG_CONTENT"] = pluginConfig;
    }
    const args = ["serve", "--hostname", "127.0.0.1", "--port", String(port)];
    logLine(`Spawning managed opencode server (port ${port}) ...`);
    const child = spawn(options.binary, args, {
      cwd: options.cwd,
      env: env as Record<string, string>,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
    });
    this.child = child;

    const urlPromise = new Promise<string>((resolve, reject) => {
      let stdout = "";
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for "server listening on" after ${READY_TIMEOUT_MS}ms.`)), READY_TIMEOUT_MS);
      const onData = (chunk: Buffer) => {
        stdout += chunk.toString();
        const lines = stdout.split("\n");
        stdout = lines.pop() ?? "";
        for (const line of lines) {
          const match = line.match(/(?:^|\s)server listening on\s+(https?:\/\/[^\s]+)/);
          if (match?.[1]) {
            clearTimeout(timer);
            cleanup();
            resolve(match[1].replace(/\/+$/, ""));
            return;
          }
        }
      };
      const onError = (error: Error) => {
        clearTimeout(timer);
        cleanup();
        reject(new Error(`Managed opencode process failed to spawn: ${error.message}`));
      };
      const onExit = (code: number | null, signal: string | null) => {
        clearTimeout(timer);
        cleanup();
        reject(new Error(`Managed opencode process exited before serving (code ${code}, signal ${signal}).`));
      };
      const cleanup = () => {
        child.stdout?.off("data", onData);
        child.off("error", onError);
        child.off("exit", onExit);
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", () => {
        // Drained to avoid backpressure; detail goes to the OCT channel on failure.
      });
      child.once("error", onError);
      child.once("exit", onExit);
    });

    try {
      const url = await urlPromise;
      logLine(`Managed server listening at ${url}; waiting for /api/info ...`);
      const version = await waitForReady(url, managedPassword, READY_TIMEOUT_MS);
      this.state = { mode: "managed", status: "connected", url, lastError: null, owned: true };
      logLine(`Managed opencode server v${version} ready at ${url}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state = { mode: "managed", status: "error", url: null, lastError: message, owned: false };
      logLine(`Managed server failed: ${message}`);
      await this.killOwned();
    }
    return this.getState();
  }

  /**
   * Build the `OPENCODE_CONFIG_CONTENT` payload that installs the bundled
   * bridge plugin and forces ask-all engine permissions (T-0020). Config
   * documents MERGE across sources (plugin lists concatenate), so this adds
   * the bridge without clobbering user plugins. When the user already exports
   * `OPENCODE_CONFIG_CONTENT`, its other keys are preserved and our plugin
   * path is appended (deduped); the ask-all rule is appended last so it wins
   * under the engine's last-match-wins evaluation (`permission.ts:87-97`)
   * without touching user files. The injected ruleset stays ask-ALL
   * (including `read`): the `read` exception lives in our translator, keeping
   * a single decision point. Returns undefined when no plugin dir applies
   * (external mode / missing).
   */
  private resolvePluginConfig(pluginDir: string | undefined): string | undefined {
    if (!pluginDir) {
      return undefined;
    }
    let normalized = pluginDir.replace(/\\/g, "/").replace(/\/+$/, "");
    try {
      if (!fs.statSync(pluginDir).isDirectory()) {
        logLine(`Bridge plugin missing at ${pluginDir}; managed server starts without the tool bridge.`);
        return undefined;
      }
    } catch {
      logLine(`Bridge plugin missing at ${pluginDir}; managed server starts without the tool bridge.`);
      return undefined;
    }
    const existing = process.env["OPENCODE_CONFIG_CONTENT"];
    if (existing) {
      try {
        const parsed: unknown = JSON.parse(existing);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          const record = parsed as Record<string, unknown>;
          const plugins = Array.isArray(record["plugins"]) ? [...(record["plugins"] as unknown[])] : [];
          if (!plugins.includes(normalized)) {
            plugins.push(normalized);
          }
          logLine("Bridge plugin appended to the existing OPENCODE_CONFIG_CONTENT.");
          return JSON.stringify(withAskAllPermissions({ ...record, plugins }));
        }
      } catch {
        logLine("Existing OPENCODE_CONFIG_CONTENT is not JSON; the bridge plugin config replaces it.");
      }
    }
    logLine("Bridge plugin installed on the managed server.");
    return JSON.stringify(withAskAllPermissions({ plugins: [normalized] }));
  }

  /** Kill the owned child process without touching the failure state. */
  private async killOwned(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (child) {
      await killProcess(child).catch((error) => {
        logLine(`Server stop warning: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  /** Stop the owned server. External servers are never touched. */
  async stop(): Promise<void> {
    await this.killOwned();
    this.password = "";
    if (this.state.owned || this.state.mode === "managed") {
      this.state = { mode: this.state.mode, status: "disconnected", url: null, lastError: null, owned: false };
    }
  }
}
