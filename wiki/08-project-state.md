# Project State Files

The workflow separates current state, durable knowledge, work definitions, human orientation, and Git history.

## Root `README.md`

**Question answered:** How should a new human understand this project?

It is a concise orientation document, not a changelog.

Update it when project understanding changes materially.

## `CONTEXT.md`

**Question answered:** What does the domain mean?

Use it for domain vocabulary, definitions, agreed terminology, and concepts that should remain consistent across sessions.

## `docs/adr/`

**Question answered:** Why did we choose this?

Use ADRs for decisions that are important, durable, and difficult to reverse.

## `dev/project.md`

**Question answered:** What is this project?

Keep purpose, scope, stack, and stable project facts here.

## `dev/constraints.md`

**Question answered:** What boundaries must the implementation respect?

## `dev/roadmap.md`

**Question answered:** Where are we going?

It is the authoritative index of milestones and task IDs. Do not invent tasks during bootstrap.

## `dev/tasks/`

**Question answered:** What specific work must be done?

Each task is bounded and executable.

## `dev/now.md`

**Question answered:** What are we doing right now?

This is the primary resume/checkpoint file and navigation layer.

It is intentionally short and is **not** the absolute source of truth when it conflicts with durable artifacts or Git evidence.

## `dev/state-integrity.md`

**Question answered:** How do these state artifacts stay consistent?

Use it for invariants and state-transition rules.

## `dev/readme-policy.md`

**Question answered:** When should the user-facing README change?

## `dev/security.md`

**Question answered:** Which security surface does this project have, and which security workflows apply?

## Git

**Question answered:** What actually changed?

Git is the physical source of code/worktree history.

## Why these are separate

A common failure is treating one file as the entire project's memory. The workflow instead uses layers:

```text
README          human orientation
CONTEXT         domain memory
project         project identity
constraints     boundaries
roadmap         direction + task index
tasks           bounded work
now             current execution checkpoint
ADRs            durable decisions
Git             actual repository state
```

When these contradict each other, reconcile before continuing.
