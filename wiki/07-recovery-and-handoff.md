# Recovery, Context Limits, and Handoff

## 1. Interruptions are expected

A session can stop because of:

- context exhaustion;
- free-model/provider limits;
- network failure;
- tool failure;
- IDE restart;
- agent crash;
- human interruption.

The workflow assumes this will happen.

## 2. Resume is a reconciliation operation

**Do not** blindly trust the last chat message.

On resume:

```text
dev/now.md
  + current task
  + roadmap
  + git status
  + git diff
  + targeted tests
        |
        v
   state reconciliation
        |
   +----+----+
   |         |
consistent  inconsistent
   |         |
resume    reconcile
```

## 3. State integrity checks

Before continuing, verify:

- the current task exists;
- the same task ID exists in the roadmap;
- task objective matches roadmap objective;
- completed tasks are not still active;
- task status matches evidence;
- commit claims match Git.

## 4. If work is partial

Suppose the agent edited two files and then lost connection.

**Do not** repeat the whole operation.

Instead:

```text
inspect now
-> inspect diff
-> understand partial changes
-> run targeted verification
-> finish/revert the partial work as appropriate
-> update checkpoint
```

## 5. Context pressure

**Do not** try to consume the entire advertised context window.

When the session becomes unreliable:

```text
finish bounded unit
-> verify
-> synchronize state
-> optional /handoff
-> new session
```

## 6. Commit checkpoints

Commits are useful recovery boundaries.

The default commit policy is `ask`. Read `dev/commit-policy.md` to determine whether to ask or auto-commit at the initial bootstrap and task-completion checkpoints.

`initial: auto` applies only to the bootstrap checkpoint. `task: auto` applies only after completed and verified tasks.

Example:

> `T-0003` is complete and verified. The changes are uncommitted. A commit is recommended as a checkpoint for review/recovery. Commit now?

A user may decline and continue uncommitted work.

## 7. Handoff vs commit

These solve different problems:

- `now.md` / `/handoff` preserves execution context;
- Git commit preserves an exact code/state snapshot.

For maximum portability across devices, the user still needs to push commits to a remote when appropriate.
