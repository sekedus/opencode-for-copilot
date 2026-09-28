# End-to-End Examples

## Example 1: New small feature

User:

```text
add a clear button to the search box
```

Agent route:

```text
inspect UI
-> existing pattern found
-> small task
-> implement
-> targeted test/check
-> checkpoint
```

No grill. No Wayfinder. No security audit.

## Example 2: Ambiguous feature

User:

```text
I want subscriptions
```

Agent route:

```text
new non-trivial feature
-> inspect codebase
-> /grill-with-docs
-> record context/ADR
-> create bounded task
-> implement
-> verify
```

## Example 3: Hard bug

User:

```text
Sometimes login works and sometimes it immediately logs me out.
```

Agent route:

```text
REVIEW
-> /diagnosing-bugs
-> reproduce/minimize
-> instrument
-> identify cause
-> propose/apply fix according to user intent
-> regression test
-> checkpoint
```

## Example 4: User only asks about security

User:

```text
Can this auth flow be exploited?
```

Agent route:

```text
REVIEW
-> inspect auth code
-> targeted security workflow
-> findings
-> stop before code modification
```

User then says:

```text
fix the first issue
```

Agent route:

```text
FIX
-> apply bounded fix
-> test
-> checkpoint
```

## Example 5: UI design

User:

```text
Make the dashboard feel less generic.
```

Agent route:

```text
inspect existing UI
-> choose appropriate design skill
-> implement distinctive direction
-> frontend-design-review
-> browser verification when useful
```

## Example 6: Large feature

User:

```text
Add multi-device sync, offline mode, conflict resolution, and account recovery.
```

Agent route:

```text
large/cross-cutting
-> /grill-with-docs
-> /wayfinder
-> bounded tasks
-> implementation sessions
-> verification per task
-> periodic architecture/code review
```

**Do not** attempt the entire feature in one chat.

## Example 7: Very long user prompt, tiny actual problem

User provides a long description of an error.

Agent discovers:

```text
missing `await`
```

Route:

```text
small bug
-> fix
-> run targeted test
-> checkpoint
```

Prompt length does not define task size.

## Example 8: Tiny user prompt, huge actual task

User says:

```text
yes, do that
```

The immediately preceding proposal involves migrating the database.

The agent should recognize the referenced action as a large task and route accordingly instead of treating `yes` as a tiny task.

## Example 9: Agent dies halfway through implementation

Before failure:

```text
T-0031 token validation
```

After failure:

```text
dev/now.md says implementation started

git diff shows two modified files

tests were not run
```

Resume:

```text
reconcile
-> inspect diff
-> finish partial implementation
-> test
-> checkpoint
```

**Do not** restart blindly.

## Example 10: Switching projects

You are working on Project A and suddenly want to work on Project B.

Use:

```text
checkpoint A
-> switch to B
```

When returning weeks later:

```text
open A
-> continue
-> reconcile
-> resume the exact recorded task
```

## Example 11: Empty project installation

User:

```text
Install the Adaptive Agent Workflow in this project.
```

Expected route:

```text
bootstrap
-> create project README
-> initialize DISCOVERY_PENDING state
-> validate
-> apply initial commit policy
```

**Do not** invent `T-0001` merely to represent installation.

## Example 12: Completed task and commit checkpoint

User:

```text
finish the task
```

After the task meets its acceptance criteria, the agent should apply `dev/commit-policy.md`. With the default `task: ask`, it should offer the commit; with `task: auto`, it should create the checkpoint after safety checks.

The agent should:

```text
verify
-> update task
-> update roadmap if status changed
-> update now
-> review README impact
-> state-integrity check
-> offer commit if uncommitted
```

Example offer:

> `T-0003` is complete and verified. The changes are uncommitted. A commit is recommended as a checkpoint for review and recovery. Commit now?

The agent should not auto-commit unless explicitly authorized.

