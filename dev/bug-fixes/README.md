# Bug-Fix Records

`dev/bug-fixes/` contains durable records for bugs that were investigated, fixed, and verified.

## Purpose

Bug-fix records answer:

- What was broken?
- How could it be reproduced?
- What was expected?
- What was the evidence-based root cause?
- What changed?
- How was the fix verified?
- What regression or security risk remains?
- What lesson or prevention rule should survive the incident?

## Bug Records vs Tasks

Use `dev/tasks/` for active investigation and implementation work.

Use `dev/bug-fixes/` for the historical record after the bug has been resolved and appropriately verified.

**Do not** create a record merely because a user reports an issue. The investigation can remain in the task until the outcome is known.

## When to Create a Record

Create a bug-fix record when the bug:

- caused meaningful user-visible behavior;
- required non-trivial investigation or code changes;
- exposed a security or reliability issue;
- is likely to be useful for future troubleshooting or prevention.

Tiny typo fixes or obvious one-line mistakes normally do not need a record.

## Naming

Use:

```text
YYYYMMDD-<bug-slug>.md
```

Example:

```text
20260930-auth-token-refresh-loop.md
```

Optional raw evidence can use a sibling directory:

```text
20260930-auth-token-refresh-loop/
```

## Lifecycle

```text
report
  ↓
investigate
  ↓
root cause
  ↓
fix
  ↓
verify
  ↓
bug-fix record
  ↓
checkpoint commit
```

For security-sensitive bugs, also evaluate `dev/security.md` and preserve the relevant security lesson in the record or an appropriate project security/ADR artifact.
