# Bug-Fix Records

`dev/bug-fixes/` contains durable records for **standalone, resolved bugs** that are worth preserving after verification.

## Active Bug Work

Bug investigation and implementation belong in `dev/tasks/` while the work is active.

If a bug is discovered while working on the active task and remains within that task's scope, keep it in the active task. Do **not** create a separate bug record just because the discovery is a bug.

Create a standalone bug task/record only when the issue is outside the active task or the user explicitly separates it.

## When a Bug Gets Its Own Record

Prefer a standalone record when the bug:

- caused meaningful user-visible behavior;
- required non-trivial investigation or code changes;
- exposed a security or reliability issue;
- contains a reusable prevention lesson.

Tiny typo fixes or obvious one-line mistakes normally do not need a record.

## Naming

Use a stable sequential ID:

```text
B-0001-<bug-slug>.md
B-0002-<bug-slug>.md
```

Keep the date in frontmatter or inside the record when useful; do not use the date as the primary identifier.

## Lifecycle

```text
report
  -> bounded task / investigation
  -> root cause
  -> fix
  -> run applicable automated checks
  -> resolve HDT requirement
  -> if required, wait for HDT PASS while the record stays active
  -> record completion evidence
  -> move record to done/ only after all required gates pass
```

`done/` is the historical archive. Keep active folders small enough to scan quickly. Automated checks are agent-owned when possible; do not ask the user to repeat successful commands. Human/runtime steps are reserved for a required HDT gate.

## Record Contents

Preserve only durable information:

- observed behavior;
- expected behavior;
- reproduction;
- impact;
- evidence-based root cause;
- fix summary;
- verification;
- security/regression risk;
- prevention lesson;
- related task, ADR, and commit.
