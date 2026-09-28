# opencode-for-copilot

Project under definition — product discovery is pending.

This repository has the Adaptive Agent Workflow installed to support
recovery-first, bounded AI-assisted development.

## Current state

- Workflow phase: `DISCOVERY_PENDING`
- Current task: none
- Roadmap tasks: none
- No product scope has been defined yet. `T-0001` will be created only
  after the first real project objective is known.

## Workflow entry points

- `AGENTS.md` — project operating rules and intent router.
- `dev/now.md` — current-state checkpoint; read this first when resuming.
- `dev/roadmap.md` — milestones and task direction.
- `dev/project.md` — project purpose and scope (pending discovery).
- `CONTEXT.md` — durable domain vocabulary (populated during discovery).
- `docs/workflow/adaptive-agent-workflow.md` — full workflow specification.
- `wiki/` — usage, recovery, quality-gate, and maintenance guide.

## Setup

No product runtime, dependencies, or build steps exist yet.

Once discovery defines the project objective, this README will be updated
with purpose, scope, prerequisites, and run instructions.

## Working with the agent

A normal request is enough, for example:

```text
I want to build ...
```

```text
continue
```

No `MODE:` labels are required. Bootstrap does not create product tasks.
See `dev/commit-policy.md` for the `initial` / `task` commit checkpoints
(default: `ask` for both).
