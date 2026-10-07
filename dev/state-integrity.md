# State Integrity

This document defines how the workflow keeps project state synchronized across durable artifacts.

## Durable Layers

| Artifact | Question answered |
|---|---|
| `README.md` | How should a new human understand the project? |
| `CONTEXT.md` | What does the project's domain language mean? |
| `ARCHITECTURE-MAP.md` | How is the codebase organized, and where are important flows/contracts/tests? |
| `dev/project.md` | What is the project? |
| `dev/constraints.md` | What boundaries constrain implementation? |
| `dev/roadmap.md` | Where is the product going? |
| `dev/tasks/` | What bounded work must be done? |
| `dev/verification.md` | What concrete evidence proves work is tested/verified? |
| `dev/now.md` | What is happening right now? |
| `docs/adr/` | Why was a durable technical decision made? |
| Git | What actually changed in the worktree/history? |

## Bootstrap State

A newly installed workflow starts at:

```text
DISCOVERY_PENDING
```

No product task is created until a real project objective is known.

## Task State Transaction

When a task is created:

```text
new task file
+ roadmap entry
+ now.md current-task pointer
```

When a task is completed:

```text
task evidence
+ roadmap status
+ now.md next task/state
+ architecture-map update when applicable
+ README review
```

When codebase structure changes:

```text
source change
+ ARCHITECTURE-MAP.md update
+ relevant verification/test evidence
```

When a task is committed:

```text
Git commit
+ now.md commit checkpoint
+ state-integrity verification
```

## Integrity Checks

At minimum verify:

1. `now.md` current task exists.
2. The same task exists in the roadmap.
3. Task objective matches roadmap objective.
4. Completed task is not still active.
5. Task IDs are unique.
6. Architecture map is updated when codebase shape changes.
7. Verification claims are supported by `dev/verification.md` and task evidence.
6. Verification evidence matches task status.
8. Commit claims match Git.
9. README reflects material project-understanding changes.

## Recovery

When state is inconsistent, stop implementation and reconcile the artifacts before continuing.
