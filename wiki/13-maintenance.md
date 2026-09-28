# Maintenance

## 1. Keep the workflow small

**Do not** turn `AGENTS.md` into a giant prompt encyclopedia.

Keep stable orchestration rules in `AGENTS.md`.
Keep domain terms in `CONTEXT.md`.
Keep project constraints in `dev/constraints.md`.
Keep current execution state in `dev/now.md`.
Keep state invariants in `dev/state-integrity.md`.
Keep README policy in `dev/readme-policy.md`.
Keep specialized behavior in skills.

## 2. Add a new rule only after a real failure

When an agent makes a mistake, ask:

```text
Is this a missing general rule?
Or is this an isolated mistake?
```

Add a permanent rule only if it prevents a recurring class of errors.

## 3. Audit state integrity periodically

Check:

```text
now ↔ current task
current task ↔ roadmap
completed state ↔ verification evidence
commit claims ↔ git
README ↔ project-understanding changes
```

## 4. Root README maintenance

The root README is a human orientation document.

Keep it current enough that a new human can understand the project without reading the entire repository.

Update it after meaningful project-understanding changes, not every code change.

## 5. Commit discipline

Commit behavior is controlled by `dev/commit-policy.md`. The default is `ask`; the project may set `initial: auto` and/or `task: auto`.

After every completed task:

```text
verify
-> synchronize state
-> review README
-> state-integrity check
-> apply task commit policy
```

Commit boundaries are especially valuable for recovery, review, and moving work across sessions/devices.

## 6. Prefer skill composition over giant custom prompts

If an existing skill already handles debugging, TDD, grilling, browser automation, security, or frontend design, route to it rather than reproducing its entire procedure in `AGENTS.md`.

## 7. Review skill selection periodically

Inspect your global skills periodically and keep only what you actually need.

## 8. Treat experimental skills as optional

Experimental skills such as `taste-skill` should remain optional unless you intentionally accept their changing behavior.
