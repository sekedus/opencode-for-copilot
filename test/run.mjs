/**
 * Test runner entry (T-0008): spawns `node --test` with `NODE_PATH` pointed
 * at the committed `vscode` shim, so no shell-specific env syntax or extra
 * dependency is needed (`npm test` works under cmd, sh, and PowerShell).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const files = ["sessions.test.js", "messages.test.js"].map((f) =>
  path.join(root, "..", "out-test", "test", f),
);

const result = spawnSync(
  process.execPath,
  ["--test", ...files],
  {
    env: { ...process.env, NODE_PATH: path.join(root, "shims", "node_modules") },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
