# Installation and Prerequisites

## 1. Repository template

Copy/merge the Adaptive Agent Workflow into the target project using the project installation rules.

The template intentionally does **not** contain the global skill library because this workflow assumes skills are installed globally under your agent's user-level skill directory.

For your setup, the existing global location is:

```text
%USERPROFILE%\.agents\skills\
```

## 2. Existing project vs. empty project

### Existing project

Preserve the existing root `README.md`.

Install the workflow files without blindly overwriting project-specific files. Reconcile the workflow state with the actual repository before claiming installation is complete.

### Empty / new project

Install the workflow files and create a **project-specific root `README.md`**.

**Do not** copy the template repository's agent-facing root README verbatim into the target project.

The initial project state should be:

```text
Workflow phase: DISCOVERY_PENDING
Current task: none
Roadmap tasks: none
```

**Do not** create `T-0001` just to represent installation.

## 3. Initial commit checkpoint

After an empty/new project has been bootstrapped, the README and workflow files validated, apply `dev/commit-policy.md`:

```yaml
initial: ask
```

The default is to ask before creating the `Initial commit`. The user may change it to `initial: auto` during installation or later.

The purpose of the initial commit is to establish a durable recovery/review boundary before product implementation begins.

## 4. Personal customization

The workflow assumes the global user preferences are installed separately under:

```text
%USERPROFILE%\.copilot\instructions\
```

## 5. Skill Dependency Closure

**Do not** install only the top-level skill that the workflow names. Some skills explicitly delegate to other skills.

For example:

```text
/grill-with-docs
    -> grilling
    -> domain-modeling
```

See [`dev/skill-dependencies.md`](../dev/skill-dependencies.md) for the maintained matrix and installation guidance.

## 6. Verify installation

Before continuing to product work, verify:

- required workflow files exist;
- the project README policy is satisfied;
- no product task was invented during bootstrap;
- `dev/now.md` says `DISCOVERY_PENDING` for a new/empty project;
- current task/roadmap consistency is valid;
- no project-specific instructions were accidentally overwritten.
