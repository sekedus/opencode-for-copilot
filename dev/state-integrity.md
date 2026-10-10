# State Integrity

This document defines how the workflow keeps project state synchronized across durable artifacts.

## Control-Plane Layers

| Artifact | Question answered |
|---|---|
| `.aaw/manifest.yml` | Which AAW release is installed? |
| `.aaw/migration.yml` | Is an AAW migration currently active? |
| `AGENTS.md` | What workflow rules does the agent follow? |
| `.github/copilot-instructions.md` | What thin Copilot adapter is active? |

The `.aaw/` files are workflow-control metadata, not product state.

## Durable Project Layers

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
applicable automated checks passed
+ HDT PASS if required (otherwise explicit NOT_REQUIRED rationale)
+ task marked COMPLETE
+ task moved to done/
+ roadmap status
+ now.md next task/state
+ architecture-map update when applicable
+ README review
```

For a task with `HDT: REQUIRED`, `AWAITING_HDT` is an active, non-complete state. Keep its task file in `dev/tasks/` and keep it pointed to by `dev/now.md` until a PASS report is recorded. Never move it to `done/` before then. Do not ask the user to rerun automated checks already executed successfully by the agent.

Creating a milestone from a multi-item request is a planning transaction only unless implementation is explicitly requested too: create the milestone and planned task records, update roadmap/now, and stop without starting any task.

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
4. A task is not marked complete while required HDT is pending, failed, or declined.
5. A task with required HDT stays active and in `dev/tasks/` until a PASS result is recorded.
6. Completed task is not still active.
7. Task IDs are unique.
8. Architecture map is updated when codebase shape changes.
9. Verification claims are supported by `dev/verification.md` and task evidence.
10. Verification evidence matches task status.
11. Commit claims match Git.
12. README reflects material project-understanding changes.
13. A completed task is not left in the active task folder; a standalone completed bug record is not left in the active bug folder.
14. A pending decision is explicit; it is never inferred from session continuity or silence.
15. If a project maintains `CHANGELOG.md`, release-facing changes are recorded there when applicable.
16. If `.aaw/migration.yml` is active, no product task is being executed or created.
17. After migration completion, `.aaw/manifest.yml` reports the verified target version and `.aaw/migration.yml` is absent.

## Recovery

When state is inconsistent, stop implementation and reconcile the artifacts before continuing.

## AAW Migration State

AAW migration is outside normal product task state. During an active migration:

```text
.aaw/migration.yml = ACTIVE
product task state  = frozen
product roadmap     = frozen
product now.md      = preserved
```

The migration lock is the durable signal that a new session must resume migration before normal work. A migration may update workflow-owned files and control-plane metadata, but it must preserve product state and unrelated user changes.

## Affected-artifact rule

After a meaningful change, identify which durable artifacts actually changed in meaning. Update only those artifacts. For example:

- small local fix -> active task + `dev/now.md` + affected verification evidence;
- architecture change -> task + `ARCHITECTURE-MAP.md` + ADR/verification when affected;
- user-facing feature -> task + README/CHANGELOG only when the project actually maintains them and the change is meaningful;
- workflow policy change -> the relevant AAW workflow documentation.

Unchanged artifacts should be left alone. Do not perform blanket documentation synchronization merely because the files exist.
