# Intent Routing

Adaptive Agent Workflow treats the user's natural-language request as the interface and the workflow mode as an internal implementation detail.

## 1. DISCUSS

Typical requests:

```text
What do you think?
Could we use PostgreSQL?
Is this architecture reasonable?
```

Actions:

- explain;
- compare;
- identify trade-offs;
- do not edit production code unless the user explicitly asks for implementation.

## 2. REVIEW

Typical requests:

```text
Check this.
Why is this failing?
Is this secure?
Could there be a race condition?
```

Actions:

- inspect the actual code;
- run safe/read-only diagnostics where useful;
- report evidence and findings;
- stop before modifying production code unless the user asks to apply a fix.

## 3. PLAN

Typical requests:

```text
How should we implement subscriptions?
What is the best way to structure this feature?
```

Actions:

- define scope;
- identify decisions;
- define acceptance criteria;
- route to `/grill-with-docs` if important requirements are unresolved;
- route to `/wayfinder` if the work is too large for one session.

## 4. BUILD

Typical requests:

```text
Add pagination.
Implement password reset.
Create the endpoint.
```

Actions:

- inspect existing patterns;
- implement only the bounded task;
- test meaningful behavior;
- checkpoint.

## 5. FIX

Typical requests:

```text
Fix that bug.
Apply the security fix.
Make the failing test pass.
```

Actions:

- use the preceding finding or task as scope;
- avoid unrelated cleanup;
- verify the result;
- checkpoint.

## 6. RESUME

Typical requests:

```text
continue
resume
lanjutkan
what's next?
```

Actions:

1. read `dev/now.md`;
2. read the current task;
3. reconcile the worktree if the previous session may have been interrupted;
4. continue the exact next action.

## 7. GRILL

A new or ambiguous product/feature idea may route to `/grill-with-docs`.

**Do not** grill trivial changes.

## 8. Handoff

Handoff is mostly an internal checkpoint operation. It becomes important when:

- the session is getting large;
- the task has reached a clean boundary;
- the user wants to stop;
- another model/session/device will continue the work.

## 9. Intent confidence

When confidence is high and risk is low, act.

When confidence is low but the action is reversible, make a small assumption and state it.

When confidence is low and the action is high-impact or irreversible, ask.
