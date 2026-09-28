# State Integrity, README Updates, and Commit Checkpoints

## Why this exists

The most dangerous workflow failure is not a model forgetting a chat message. It is a repository where multiple durable artifacts disagree.

Example:

```text
now.md      -> T-0002
roadmap.md  -> T-0001
Git         -> code already implements T-0002
README      -> describes an older architecture
```

The workflow therefore treats meaningful changes as state transactions.

## Bootstrap transaction

For an empty/new project:

```text
install workflow
-> create project README
-> initialize project state
-> DISCOVERY_PENDING
-> validate
-> offer Initial commit
```

**Do not** create fake product tasks during bootstrap.

## Task creation transaction

```text
discovery complete
-> create T-0001
-> add to roadmap
-> point now.md to T-0001
-> update README if project identity changed
```

## Task completion transaction

```text
implementation
-> verification
-> task evidence
-> roadmap status
-> now next-state
-> README review
-> state-integrity check
-> commit offer
```

## Commit policy

Commit behavior is persistent in `dev/commit-policy.md` and has two independent checkpoints:

```yaml
initial: ask
task: ask
```

The default is to ask the user. The user may set either checkpoint to `auto`.

### `initial`

- `ask` — offer `Initial commit` after bootstrap validation.
- `auto` — create the initial checkpoint automatically after bootstrap validation and README/state creation.

### `task`

- `ask` — offer a commit after each completed and verified task.
- `auto` — automatically commit each completed and verified task.

### Auto-commit safety

Auto-commit is never blind. Before an automatic commit, the agent must:

1. verify the relevant work;
2. synchronize affected state;
3. review README impact;
4. pass state-integrity checks;
5. inspect Git status/diff;
6. confirm that unrelated user changes will not be committed.

If unrelated or ambiguous changes are present, do not auto-commit. Preserve the work and ask the user. Automatic commit never implies `git push`.

Suggested wording when the policy is `ask`:

> `T-0004` is complete and verified. A commit is recommended as a checkpoint for review and recovery. Commit now?

## README update policy

Update the root README when a new human needs to know something that changed.

Good triggers:

- project purpose established;
- user-facing capability added;
- architecture/integration changed materially;
- setup/install instructions changed;
- supported versions changed;
- operational workflow changed.

**Do not** add:

- every task;
- every test result;
- internal implementation details;
- temporary debugging notes.

The README is not a changelog.
