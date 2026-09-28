import { execFile } from "node:child_process";
import { MIN_OPENCODE_MAJOR } from "./config";

export interface BinaryCheckOk {
  ok: true;
  version: string;
  major: number;
}

export interface BinaryCheckFail {
  ok: false;
  message: string;
}

export type BinaryCheck = BinaryCheckOk | BinaryCheckFail;

/**
 * Verify the opencode binary exists and is v2+.
 * Runs `<binary> --version` and parses the first `v?2.x` token.
 */
export function checkOpencodeBinary(binary: string, timeoutMs = 15000): Promise<BinaryCheck> {
  return new Promise((resolve) => {
    // On Windows `opencode` resolves to `opencode.cmd`, which needs a shell.
    // Without `shell: true`, Node's execFile reports `spawn opencode ENOENT`
    // even when the binary is on PATH.
    const shell = process.platform === "win32";
    execFile(binary, ["--version"], { timeout: timeoutMs, shell }, (error, stdout, stderr) => {
      const output = `${stdout ?? ""}\n${stderr ?? ""}`;
      if (error) {
        resolve({
          ok: false,
          message: `Could not run "${binary} --version": ${error.message}. Install opencode v2 and ensure it is on PATH (or set oct.opencodeBinary).`,
        });
        return;
      }
      const match = output.match(/v?(\d+)\.(\d+)\.(\d+)/);
      if (!match) {
        resolve({
          ok: false,
          message: `Could not parse opencode version from: ${output.trim().slice(0, 200)}. Expected opencode v2+.`,
        });
        return;
      }
      const major = Number(match[1]);
      const version = `${match[1]}.${match[2]}.${match[3]}`;
      if (major < MIN_OPENCODE_MAJOR) {
        resolve({
          ok: false,
          message: `Found opencode v${version}, but OCT requires opencode v2+. Upgrade the opencode binary.`,
        });
        return;
      }
      resolve({ ok: true, version, major });
    });
  });
}
