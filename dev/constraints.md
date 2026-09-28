# Project Constraints

Use this file for constraints that materially affect technical decisions.

## Runtime / Platform Baseline

- Runtime: VS Code `^1.125.0` (for `languageModelChatProviders` / `onLanguageModelChatProvider:oct`); Node 20+ extension host; opencode v2.0.x (verified 2.0.18 via `opencode --version`).
- OS/platform: Windows 10 Pro Build 19045 primary; macOS/Linux best-effort (process spawn + `taskkill` vs `SIGTERM` paths).
- Browsers: n/a (desktop extension, no web UI).
- Mobile platforms: n/a.

## Compatibility / Legacy

- Minimum supported runtime version: VS Code 1.125, opencode v2.0. No v1 (`opencode-llm-proxy` protocol) support.
- Minimum browser version(s): n/a.
- Legacy support policy: track latest opencode v2 `openapi.json`; do not backport to v1.

**Do not** invent additional legacy support beyond this policy.

## Resource Constraints

- Memory: 16 GB machine; opencode `serve` runs in background and eats RAM, so OCT is strictly opt-in (disabled by default, explicit Enable + reload, explicit Disable stops server).
- CPU: no GPU on dev machine; CPU-only tooling, no local model workloads, no GPU-dependent builds.
- Offline requirements: none (engine calls its own configured providers; bridge adds no extra egress except to the opencode URL).
- External service limitations: none imposed by bridge; model availability comes from the engine's own auth/config.

## Security Constraints

- Loopback-only by default (`127.0.0.1`); external `oct.opencodeUrl` is explicit user opt-in.
- Server password via `Authorization: Basic opencode:<password>`; never log password or full headers.
- Workspace folder is passed as `location.directory` for session create; must be an absolute open folder path, no traversal.

## Deployment Constraints

- Local VSIX install first (`vsce package`); marketplace publish is out of MVP scope.
- Git Bash is the default VS Code terminal on this machine; document shell-specific commands when they matter. Avast TLS interception: prefer normal cert verification; `curl --ssl-no-revoke` only when revocation checks fail (never `-k`).
