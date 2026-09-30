# Feature Records

`dev/features/` contains historical records for meaningful, user-facing features that have been implemented and verified.

## Purpose

Feature records answer:

- What feature was added?
- Why was it needed?
- What user-visible behavior changed?
- What important design, technical, or security considerations were involved?
- How was the feature verified?
- Where can the detailed task, ADRs, and commit be found?

## Feature Records vs Tasks

Use `dev/tasks/` for active executable work.

Use `dev/features/` for the durable historical record after meaningful feature work has been completed.

**Do not** duplicate the complete task plan or source code in the feature record.

## When to Create a Record

Create a feature record when a feature:

- changes user-visible behavior;
- introduces an important product capability;
- changes a meaningful workflow or integration;
- is worth explaining to a future maintainer.

**Do not** create a record for every tiny refactor, typo fix, or internal cleanup.

## Naming

Use:

```text
YYYYMMDD-<feature-slug>.md
```

Example:

```text
20260930-whatsapp-otp-login.md
```

Optional raw artifacts can use a sibling directory:

```text
20260930-whatsapp-otp-login/
```

## Lifecycle

```text
idea / requirement
    ↓
task(s)
    ↓
implementation
    ↓
verification
    ↓
feature record
    ↓
checkpoint commit
```

Feature records are historical. The active task remains the source of execution state until it is complete.
