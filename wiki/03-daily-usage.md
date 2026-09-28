# Daily Usage

## 1. Start a session with ordinary language

You can simply say:

```text
continue
```

or:

```text
resume
```

The agent reads `dev/now.md`, resolves the current task, verifies task/roadmap state, and checks Git when relevant before continuing.

## 2. Asking a question

```text
why does this fail?
```

Expected behavior:

```text
inspect
-> diagnose
-> explain
-> do not modify production code
```

## 3. Asking for a review

```text
check the auth flow for security issues
```

Expected behavior:

```text
inspect
-> route to appropriate security workflow
-> report findings
-> do not silently apply fixes
```

## 4. Asking for a fix

```text
fix the token validation bug
```

Expected behavior:

```text
identify bounded issue
-> apply fix
-> test
-> checkpoint
```

## 5. What happens when a task finishes

A completed task goes through this checkpoint sequence:

```text
verify
-> synchronize task/roadmap/now
-> review README impact
-> state-integrity check
-> offer commit when work is uncommitted
```

A commit is recommended because it provides a durable review and recovery boundary. By default the agent asks. If `task: auto` is configured in `dev/commit-policy.md`, the agent creates the checkpoint automatically after safety checks.

Example when the policy is `ask`:

> `T-0001` is complete and verified. A commit is recommended as a checkpoint for review and recovery. Commit now?

## 6. Initial project commit

For an empty/new project, installation itself creates the first useful recovery boundary.

After the workflow and project README are validated, the agent applies the `initial` commit policy. With the default `initial: ask`, it offers:

```text
Initial commit
```

With `initial: auto`, it creates the checkpoint automatically after the auto-commit safety checks pass.

## 7. Root README updates

The root README is updated periodically, not after every tiny change.

Update it when a task changes what a new human needs to understand, such as:

- a new user-facing feature;
- a major integration;
- setup/install instructions;
- runtime/browser support;
- high-level architecture.

**Do not** turn README into a changelog.

## 8. Introducing a new idea during active work

If the current task is:

```text
Implement OAuth callback
```

and the user says:

```text
What if we also add passkeys?
```

This is not permission to switch tasks.

Discuss or park the idea, then keep the current task unchanged unless the user clearly changes the objective.

## 9. Stopping work

You do not need a long handoff message.

A simple:

```text
I'm stopping here.
```

should cause the agent to checkpoint if the current state is safe to record.

The next session can recover from `dev/now.md`, task state, roadmap state, and Git evidence.
