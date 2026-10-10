# AAW Migration

**Applies to Adaptive Agent Workflow 0.7.1 and later.**

This is an agent-facing procedure for upgrading, downgrading, repairing, or migrating AAW in an existing project. It is not a product-development task.

## Principle

An AAW migration changes the **workflow control plane** while preserving the **product state**.

```text
product state  = protected
AAW control    = migratable
```

The user should be able to use natural language:

```text
update adaptive-agent-workflow to 0.7.3
update AAW to v0.7.3
upgrade aaw
migrate this project to AAW 0.7.3
```

Legacy release labels normalize as `v6 -> 0.6.0` and `v7 -> 0.7.0`.

## Version source of truth

For releases that support the manifest, read:

```text
.aaw/manifest.yml
```

Example:

```yaml
AAW_ID: adaptive-agent-workflow
AAW_SOURCE: https://github.com/sekedus/adaptive-agent-workflow
AAW_VERSION: 0.7.3
AAW_SCHEMA: 1
```

`AAW_VERSION` is authoritative. Version strings in README or prose documentation are informational only.

## Legacy version detection

AAW 0.6.0 and 0.7.0 predate the manifest. Use repository evidence instead of guessing. The workflow specification's release marker should be checked when present.

For 0.6.0, the project normally has the v6 state/workflow files but not the 0.7.0 additions:

```text
ARCHITECTURE-MAP.md
dev/verification.md
```

For 0.7.0, those two additions are present. These are evidence, not permission to infer a version when the evidence conflicts. If the version remains uncertain, stop.

## Migration lock

Before changing workflow files, create:

```text
.aaw/migration.yml
```

Minimum contract:

```yaml
mode: MIGRATION
status: ACTIVE
from: 0.7.2
to: 0.7.3
```

Optional fields such as a timestamp or migration identifier may be added.

If a new session finds an active lock, it must reconcile actual files and continue that migration before any product work.

## Product freeze

While migration is active:

- do not create, modify, complete, or reprioritize product tasks;
- do not advance or rewrite the product roadmap;
- do not execute application bugs, features, refactors, or design work;
- preserve the existing `dev/now.md` product state;
- preserve unrelated user changes in the Git worktree.

Migration is not a `T-*` task.

## File ownership

Protect project state unless a target release explicitly requires a workflow-only change:

```text
README.md
CONTEXT.md
dev/project.md
dev/constraints.md
dev/roadmap.md
dev/now.md
dev/tasks/
dev/tasks/done/
dev/bug-fixes/
dev/bug-fixes/done/
dev/milestones/
dev/bug-fixes/
dev/security.md
dev/quality.md
dev/commit-policy.md
docs/adr/
existing Git changes
```

AAW control-plane files may change:

```text
.aaw/manifest.yml
.aaw/migration.yml
AGENTS.md
.github/copilot-instructions.md
docs/workflow/adaptive-agent-workflow.md
AAW-specific wiki/docs
ARCHITECTURE-MAP.md          when required by the target release
dev/verification.md           when required by the target release
```

Do not replace project-specific files wholesale with template copies. Merge workflow changes while preserving actual project facts and decisions. `ARCHITECTURE-MAP.md` and `dev/verification.md` must describe the real project.

## Migration sequence

### 1. Detect intent

Recognize AAW maintenance before normal product intent routing.

### 2. Determine installed and target versions

Read the manifest when present; otherwise establish the legacy version from repository evidence. Normalize the requested target release.

### 3. Inspect before modifying

Inspect `git status`, relevant `git diff`, current AAW files, and durable project state. Do not assume the worktree is clean.

### 4. Create the migration lock

Write `.aaw/migration.yml` with `mode: MIGRATION` and `status: ACTIVE`.

### 5. Freeze product work

No product task is created or executed. Product roadmap and `now.md` remain preserved.

### 6. Stage the target workflow

Obtain the requested AAW release from the configured template/source and merge workflow-owned files carefully. Do not blindly copy the template root README into an existing project.

### 7. Reconcile target artifacts

For 0.7.0+ targets, build or reconcile `ARCHITECTURE-MAP.md` and `dev/verification.md` from the actual project.

### 8. Verify before flipping the control plane

Verify at minimum:

- target workflow files exist;
- project README/state remain preserved;
- active task and roadmap were not changed by migration;
- unrelated Git changes remain untouched;
- architecture map and verification contract are project-specific when required;
- no product task was created or executed because of the migration request.

### 9. Update control instructions last

Update `AGENTS.md` and `.github/copilot-instructions.md` only after the target workflow is staged and the preceding checks pass.

### 10. Write the target manifest

For a 0.7.3 target:

```yaml
AAW_ID: adaptive-agent-workflow
AAW_SOURCE: https://github.com/sekedus/adaptive-agent-workflow
AAW_VERSION: 0.7.3
AAW_SCHEMA: 1
```

There must be one authoritative manifest value.

### 11. Remove the migration lock

Only after verification succeeds, delete `.aaw/migration.yml`. The absence of the lock plus the verified manifest means normal workflow may resume.

### 12. Stop

The migration request ends here. Do not continue into application work from the same request.

## Recovery

Never trust chat history as proof that a step completed. If a session ends unexpectedly:

```text
read .aaw/migration.yml
    -> inspect actual files
    -> inspect git status/diff
    -> compare target workflow
    -> classify COMPLETE / PARTIAL / UNCHANGED / INCONSISTENT
    -> reconcile
    -> continue only migration
```

If migration cannot be completed safely, leave the lock active, preserve the repository, and report the exact blocker. Do not fall through into product work.

## Future releases

Every workflow release that changes semantics should document its `AAW_VERSION`, any `AAW_SCHEMA` change, migration steps, protected/migratable files, verification requirements, and supported source versions. Never invent an undocumented migration path.


## 0.7.2 migration notes

When upgrading an existing AAW 0.7.x project:

- preserve `dev/now.md` as a snapshot and remove stale historical appendices instead of copying the template snapshot over project state;
- remove promoted, rejected, or resolved entries from `dev/parking-lot.md`;
- stop creating new `dev/features/` records; if an existing project already has meaningful legacy feature records, preserve them as historical data rather than deleting them automatically;
- keep active work in `dev/tasks/`; move completed task files to `dev/tasks/done/`;
- use stable `B-*` IDs for standalone bug-fix records;
- create `dev/milestones/` only for broad bounded work that genuinely needs grouping;
- reconcile `dev/verification.md` to the compact verification contract;
- preserve existing project-specific content rather than replacing it with template placeholders.
