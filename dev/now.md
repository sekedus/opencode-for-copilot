# NOW

> Primary current-state checkpoint and navigation layer.
> Keep this short. It must be reconciled against durable project artifacts and Git when relevant.

## Workflow Phase

DISCOVERY_PENDING

## State Integrity

CONSISTENT

## Current Milestone

None yet.

## Current Task

None — product work has not been defined yet.

## Current Step

None.

## Objective

[Populate after the first real project objective is discovered.]

## Last Completed

- Adaptive Agent Workflow bootstrapped.

## Last State Transaction

BOOTSTRAP_COMPLETE

## Next Action

Define the first real project objective from the user's next request.

## Current Blocker

None.

## Relevant Files

- `README.md`
- `dev/project.md`
- `dev/constraints.md`
- `dev/roadmap.md`
- `dev/quality.md`
- `dev/security.md`

## Constraints

- Read `dev/constraints.md` before compatibility/platform decisions.

## Verification

Status: BOOTSTRAP_VALIDATED

Evidence:

- Workflow files installed (AGENTS.md, .github/copilot-instructions.md, CONTEXT.md, dev/, docs/, wiki/).
- Project-specific root README.md created (not a template copy).
- No product task created; dev/tasks/ contains only .task-template.md.
- Roadmap has no milestones/tasks; phase DISCOVERY_PENDING.

## Commit Policy

Initial: ASK
Task: ASK

See `dev/commit-policy.md`. The user may switch either checkpoint to `AUTO`.

## Last Commit

`chore: initialize adaptive agent workflow` — initial bootstrap checkpoint (see `git log -1` for hash).

## README Status

READY — initial project README created for opencode-for-copilot (discovery pending).

## Important Context

The workflow is installed, but product discovery has not started. Do not invent T-0001 or a milestone until the project objective is known.

## Do Not Change

- Do not invent product scope.
- Do not create implementation tasks merely to populate the roadmap.
- Do not overwrite an existing project README during bootstrap.

## Last Session

Workflow bootstrap completed.

## Resume Instruction

Read this file first. Since no active task exists, wait for or inspect the user's project objective. Once the objective is known, reconcile project-level artifacts before creating the first task.
