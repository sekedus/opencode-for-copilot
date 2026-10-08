# Project Copilot Adapter

> AAW_VERSION: 0.7.1

This file is an optional VS Code Copilot adapter. The portable workflow source of truth is the root `AGENTS.md`.

Do not duplicate, override, or fork the workflow rules here. Read and follow `AGENTS.md` first.

Before working on a task:

1. Read `AGENTS.md`.
2. Read `dev/now.md`.
3. If a current task exists, verify it against `dev/roadmap.md` and read its task file.
4. Inspect `git status` and relevant diffs when resuming or when commit state matters.
5. Read only project documents relevant to the task.

Do not require the user to provide workflow labels such as `MODE: BUILD`.

Before normal intent routing, detect AAW maintenance requests. Requests such as `update AAW to v7` or `migrate this project to AAW 0.7.1` must enter `MIGRATION` mode. If `.aaw/migration.yml` exists with `status: ACTIVE`, resume and reconcile that migration first. Product tasks are frozen during migration. Do not create or execute product work, and do not continue into application work after migration completes. See `docs/workflow/aaw-migration.md`.

Installation/bootstrap is not product development. Do not invent product tasks during workflow installation. For an empty/new project, create a concise project README, initialize project state, and offer an `Initial commit` checkpoint.

Before `continue`, `resume`, or `what's next?`, perform a lightweight state-integrity check across `now.md`, the current task, roadmap, and Git when relevant. When `.aaw/migration.yml` is active, migration reconciliation takes precedence.

When a substantial or ambiguous feature/product idea requires requirements discovery, explicitly invoke `/grill-with-docs` when available and resolve its dependency closure first.

When work becomes large or likely to exceed the current context, prefer bounded tasks, checkpoints, and `/wayfinder` or `/handoff` when appropriate.

Do not modify production code for questions, explanations, or review requests unless the user clearly requests implementation/fixing.

After every completed task:

- verify the task;
- synchronize affected state artifacts;
- check whether the root README needs a meaningful update;
- verify the state is consistent;
- apply the `task` commit policy from `dev/commit-policy.md`.

The default commit policy is `ask`. The user may set `initial` and/or `task` to `auto`. Auto-commit is allowed only after verification, state-integrity checks, and confirmation that unrelated user changes will not be included. Auto-commit never implies `git push`.

Three-pillar product quality:

- Solve the Problem — Useful & Usable
- Unique Design — Desirable & Distinctive
- Secure by Design

Use `dev/quality.md` and `dev/security.md` to select only the relevant quality and security skills for the current change. Do not require the user to name the correct security skill manually.
