# Project Context

This file stores durable domain vocabulary and terminology agreed during discovery and implementation.

Do not use this file as a task list, implementation log, or general project diary.

## Domain Terms

- **OCT** — This bridge extension's provider identity. Vendor `oct`, display name "OCT" in the Copilot model picker.
- **Engine** — A local opencode terminal v2 server (`opencode serve`) exposing REST + SSE under `/api/*`.
- **Bridge** — This VS Code extension: owns server lifecycle, model listing, and chat mapping. No own chat webview.
- **Copilot conversation** — One Copilot Chat conversation in VS Code. MVP maps it 1:1 to one opencode session.
- **Opencode session** — Server-side session (`POST /api/session`, `POST /api/session/:id/prompt`, `GET /api/event`). Reused across turns, never created per turn.
- **Managed mode** — Bridge spawns and stops its own `opencode serve` (default).
- **External mode** — Bridge connects to a user-provided `oct.opencodeUrl` instead of spawning.
- **Activation gate** — OCT is disabled by default; `OCT: Enable` + window reload is required before the provider registers (background RAM cost).

## Important User/Business Concepts

- **Session sprawl** — The v1 proxy failure mode (1 Copilot request = 1 opencode session). The MVP's core fix is persistent reuse.
- **Text-only MVP** — Chat streams plain text; Copilot tool calls are advertised as unsupported until the tool-bridge follow-up.

## Naming Decisions

- Vendor must be called `oct` (lowercase) throughout code, config, and docs; display name is `OCT`.
- The engine must be called `opencode` (lowercase) with version qualifier `v2` when disambiguating from v1.
