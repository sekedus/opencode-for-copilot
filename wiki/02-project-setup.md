# Starting a Project

## 1. Empty / new project bootstrap

Start with:

```text
Install the Adaptive Agent Workflow in this project.
```

The agent should:

1. install/merge workflow files;
2. create the project's own root `README.md`;
3. initialize project state without inventing product scope;
4. set `dev/now.md` to `DISCOVERY_PENDING`;
5. leave `dev/tasks/` without a product task;
6. validate the installation;
7. apply `dev/commit-policy.md` (default: ask; `initial: auto` may create the checkpoint automatically after safety checks).

The first product task is **not** created during installation.

## 2. Existing project bootstrap

Preserve the project's existing `README.md` and source code.

The agent should adapt the workflow to the real project rather than treating the project as empty.

## 3. Give the agent a natural request

For example:

```text
I want to build a bookmark manager.
```

The agent should inspect the repository and decide whether the idea is already sufficiently defined.

## 4. Discovery before implementation

For a substantial or ambiguous idea, use `/grill-with-docs`.

After discovery, synchronize:

```text
project.md
CONTEXT.md
constraints.md
quality.md
security.md
roadmap.md
now.md
ADR(s) when needed
```

Only then create the first real task:

```text
T-0001
```

## 5. README after discovery

If the project purpose or scope becomes known during discovery, update the root README so a new human can understand what the repository now is.

The README should summarize the project, not reproduce the entire grill or roadmap.

## 6. Establish project constraints early

Before implementation, fill in `dev/constraints.md` with what is actually known.

## 7. Create the first bounded task

A task should answer:

- what must be achieved;
- why it matters;
- what is in scope;
- what is out of scope;
- acceptance criteria;
- relevant files or modules;
- how to verify it.

## 8. Establish the checkpoint

`dev/now.md` should identify:

```text
workflow phase
state integrity
current milestone
current task
current step
last completed action
next action
blockers
relevant files
verification state
last commit
README status
```
