# Commit Policy

This project uses two independent commit checkpoints:

- `initial` — after Adaptive Agent Workflow bootstrap in an empty/new project.
- `task` — only after a task has met all acceptance and verification gates, including HDT when required.

## Defaults

```yaml
initial: ask
task: ask
```

The default is to ask the user before creating a commit.

---

## Allowed Values

Each checkpoint may use:

- `ask` — offer the commit and wait for the user.
- `auto` — create the commit automatically when all auto-commit safety checks pass.

## Configuration Examples

```yaml
# Ask for both checkpoint types.
initial: ask
task: ask

# Automatically create the initial bootstrap commit, but ask after each completed task.
initial: auto
task: ask

# Ask for the initial bootstrap commit, then automatically commit each completed task.
initial: ask
task: auto

# Automatically commit both the initial bootstrap and completed tasks.
initial: auto
task: auto
```

## Auto-Commit Safety Rules

An `auto` policy does not bypass verification or state integrity.

Before an automatic commit, the agent must:

1. complete all required automated verification;
2. complete required HDT and record a PASS result; an `AWAITING_HDT` task is not eligible for the normal completed-task checkpoint;
3. synchronize affected project state;
4. review the root README when applicable;
5. pass the state-integrity check;
6. inspect Git status and diff;
7. ensure the commit contains only changes belonging to the current checkpoint.

If unrelated user changes are present or the intended commit scope cannot be determined safely:

- do not auto-commit;
- preserve the working tree;
- explain the conflict;
- ask the user whether to proceed manually.

Automatic commits never imply automatic `git push`.

If required HDT is pending, failed, or declined, do not apply the normal completed-task commit policy. Keep the task active and unverified at that gate. The user may explicitly request a partial checkpoint commit; if so, commit only the requested scoped changes and leave the task status incomplete.

## Commit Messages

Use concise messages that identify the workflow checkpoint.

Initial bootstrap:

```text
chore: initialize adaptive agent workflow
```

Completed task:

```text
feat: <task outcome>
```

Use an appropriate conventional-commit type when the task clearly fits another category, such as `fix:` or `refactor:`.

## Changing the Policy

The user may change the policy using natural language, for example:

- `keep asking before commits`
- `automatically commit the initial setup`
- `auto-commit after every completed task`
- `auto-commit both initial setup and completed tasks`

After changing the policy, update this file and `dev/now.md` when the change affects the current checkpoint.
