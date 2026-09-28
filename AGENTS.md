# Adaptive Agent Workflow — Project Rules

## 1. Repository Is Durable Project Memory

The repository is the durable project memory. Chat history is temporary.

When resuming work:

1. Read `dev/now.md`.
2. Resolve the current task, if one exists.
3. Verify the current task against `dev/roadmap.md`.
4. Inspect `git status` and relevant diffs when code state may matter.
5. Read only project documents relevant to the task.
6. Inspect the relevant source/tests.

Do not reconstruct project state from old chat history when repository state is available.

`dev/now.md` is the navigation and checkpoint layer. It is not an absolute source of truth when it conflicts with durable task, roadmap, project, ADR, or Git evidence.

---

## 2. Bootstrap Is Not Product Development

Installing the Adaptive Agent Workflow into an empty or new project is a bootstrap operation.

After bootstrap:

- the workflow files may be installed;
- project discovery may be pending;
- no product task should be invented merely to populate `dev/tasks/`;
- task IDs begin at `T-0001` only after the first real product/work requirement is defined.

For an empty/new project:

1. Install the workflow files.
2. Create a user-facing root `README.md` describing the actual project state. Do not copy the template repository's agent-oriented root README verbatim.
3. Initialize `dev/project.md`, `dev/constraints.md`, `dev/quality.md`, `dev/security.md`, `dev/roadmap.md`, and `dev/now.md` to reflect the real project.
4. Set the workflow state to `DISCOVERY_PENDING` until a real project objective exists.
5. Offer the user an `Initial commit` checkpoint after installation and README creation.

For an existing project:

- preserve the existing root `README.md`;
- merge workflow files with existing project-specific instructions;
- reconcile project state before claiming installation is complete.

Never copy the template source repository's root `README.md` into an existing project merely because it exists in the template. That README is documentation for agents and for the template itself.

---

## 3. Natural-Language Intent

The user normally communicates in natural language. Do not require explicit workflow labels such as `MODE: BUILD`.

Infer intent from:

- the user's request;
- current project state;
- current task;
- repository evidence;
- available tools and skills.

Useful internal categories:

- `DISCUSS` — explain, compare, brainstorm, answer questions.
- `REVIEW` — inspect behavior, code, security, performance, design, or correctness.
- `PLAN` — define scope, acceptance criteria, or implementation steps.
- `BUILD` — implement a clearly requested change.
- `FIX` — apply a requested or approved fix.
- `RESUME` — reconcile and continue the recorded task.
- `HANDOFF` — checkpoint without starting new work.

The user does not need to name these modes.

---

## 4. Clarification vs. Grilling

Do not ask a question merely because something is technically ambiguous.

Before asking:

1. inspect the relevant code;
2. inspect existing project documentation;
3. inspect existing patterns;
4. use appropriate tools.

Ask only when unresolved ambiguity materially affects correctness, security, architecture, irreversible decisions, important user-visible behavior, or scope.

For low-risk, reversible decisions consistent with existing project patterns, make the smallest reasonable assumption and state it briefly.

For a new product/feature idea with multiple meaningful unresolved decisions, explicitly invoke `/grill-with-docs` when available.

Do not grill trivial or already-defined changes.

---

## 5. Execution Boundary

Questions, explanations, and review requests do not grant production-code modification permission.

Clear action-oriented requests normally permit implementation within scope.

When intent is uncertain, prefer the least destructive interpretation.

---

## 6. Scope Control

Do not expand the active task merely because related improvements are visible.

Do not silently:

- refactor unrelated code;
- upgrade unrelated dependencies;
- rename unrelated files;
- redesign adjacent modules;
- add nice-to-have features;
- rewrite working code without evidence.

Unrelated ideas go to `dev/parking-lot.md` or become a separate task.

A bare confirmation such as `yes`, `do that`, or `go ahead` refers only to the immediately preceding actionable proposal. Resolve exactly what that proposal means before executing it.

---

## 7. Task Size Triage

Do not infer task size from prompt length.

Estimate size from actual repository impact after inspection.

### Small

Direct, local, low-risk change with clear scope.

### Medium

Multiple files or behavioral decisions, but still bounded.

### Large / Cross-cutting

Many modules, architectural changes, major product features, migration work, or work likely to exceed one context window.

For large work, use `/wayfinder` when available and create bounded tasks instead of attempting the entire change in one conversation.

---

## 8. Project State Integrity

The workflow maintains multiple durable artifacts. Keep them synchronized according to the state transition that occurred.

Required invariants:

1. The current task in `dev/now.md` must exist in `dev/tasks/`.
2. The current task ID and objective must match its entry in `dev/roadmap.md`.
3. A completed task must not remain the active task.
4. A task marked complete must have appropriate verification evidence.
5. A new task must never reuse an existing task ID.
6. A material project-definition change must update project-level documentation before implementation proceeds.
7. A commit state recorded in `dev/now.md` must agree with Git evidence.
8. `dev/now.md` must identify whether its state is `CONSISTENT` or `RECONCILIATION_REQUIRED`.

Before answering `what's next?`, `continue`, or `resume`:

- audit the current state;
- detect contradictions between `now.md`, task files, roadmap, and Git when relevant;
- reconcile before proposing or executing the next step.

Never silently choose one contradictory artifact over another.

---

## 9. State Transactions

Treat meaningful project events as state transitions rather than isolated file edits.

### Project Discovery Completed

Update as applicable:

- `dev/project.md`
- `CONTEXT.md`
- `dev/constraints.md`
- `dev/quality.md`
- `dev/security.md`
- `dev/roadmap.md`
- `dev/now.md`
- ADRs when durable decisions were made

### Task Created

Update:

- new `dev/tasks/T-xxxx-*.md`
- `dev/roadmap.md`
- `dev/now.md`

### Task Progress / Completion

Update:

- current task
- `dev/now.md`
- `dev/roadmap.md` when task status or milestone state changes
- root `README.md` when project-understanding information changed materially

### Architectural Decision

Update:

- ADR
- relevant `CONTEXT.md` terminology
- task and `now.md` when the active work is affected

### Verification Completed

Update the task and `dev/now.md` with evidence. Do not claim completion without appropriate evidence.

### Commit Created

After creating a commit:

1. verify the commit and worktree state;
2. update `dev/now.md` with the checkpoint commit when relevant;
3. reconcile task status and README state;
4. do not claim the repository is clean unless `git status` proves it.

State-synchronization edits are mandatory bookkeeping for the current work. They are not unrelated scope expansion.

---

## 10. Root README Policy

The root `README.md` is a concise, user-facing explanation of the project.

It should answer enough of these questions for a new human contributor/user to understand the repository:

- What is this project?
- What problem does it solve?
- What are the important capabilities or current scope?
- What is the relevant architecture or workflow at a high level?
- How do I run/use it?
- What important constraints or prerequisites matter?

Update the README when project-understanding information changes materially, especially after:

- initial project discovery;
- completion of a user-visible feature;
- meaningful architecture changes;
- setup/install changes;
- major compatibility changes;
- important workflow changes.

Do not update the README for every internal implementation detail, small bug fix, or routine test change unless it affects how a user understands or uses the project.

After task completion, explicitly check whether the README needs an update. If not, leave it unchanged.

The template repository's own root README is agent-facing documentation. When installing into an actual project, create or update the target project's README from the project's real state instead of copying template-only instructions.

---

## 11. Commit Checkpoint Policy

Read `dev/commit-policy.md` as the source of truth for commit behavior. The default policy is `ask` for both initial bootstrap and completed tasks.

The user may explicitly change either checkpoint to `auto`:

- `initial: auto` — automatically commit after empty/new-project bootstrap validation.
- `task: auto` — automatically commit after every completed and verified task.

The two settings are independent.

### Auto-Commit Safety

Automatic commits are allowed only after:

1. required verification succeeds;
2. affected state artifacts are synchronized;
3. README impact is reviewed;
4. state integrity passes;
5. Git status/diff confirms that only current-checkpoint changes will be committed.

Never auto-commit unrelated user changes. If commit scope is ambiguous, stop the automatic commit and ask the user.

Automatic commits do not imply `git push`.

### After Initial Bootstrap of an Empty/New Project

If `initial: ask`, offer an `Initial commit` after validation.

If `initial: auto`, create the initial checkpoint automatically after validation.

Suggested ask wording:

> The project is bootstrapped and the initial README/state are ready. A Git commit is useful as a recovery/checkpoint boundary. Commit the `Initial commit` now?

### After Every Completed Task

When a task reaches its completion criteria:

1. verify the task;
2. update affected project state;
3. review whether the root README needs a meaningful update;
4. run a state-integrity check;
5. apply the `task` commit policy.

If `task: ask`, offer a commit:

> `T-xxxx` is complete and verified. A commit is recommended as a checkpoint for review, recovery, and safe continuation. Commit now?

If `task: auto`, create the checkpoint automatically after the safety checks pass.

Do not offer or create a duplicate commit when the relevant work is already committed and the working tree is clean.

A user may override the persistent policy for a specific checkpoint by explicitly asking to commit, skip, or stop before committing.

---

## 12. Context Discipline

Context is a limited resource.

Prefer current task, relevant files, focused tool calls, existing artifacts, and incremental verification.

When context is becoming large enough to threaten focus or continuation:

1. finish the smallest safe bounded unit;
2. verify it;
3. update `dev/now.md`;
4. use `/handoff` when useful;
5. stop before the session becomes unreliable.

---

## 13. Interruption / Recovery Protocol

A session may stop because of context limits, free-model limits, connection errors, tool failures, IDE crashes, or human interruption.

Never assume the last attempted operation completed.

On resume:

1. read `dev/now.md`;
2. resolve and verify the current task;
3. inspect `git status`;
4. inspect relevant diffs;
5. compare the repository with the checkpoint;
6. run targeted verification when needed;
7. classify the state as `COMPLETE`, `PARTIAL`, `UNCHANGED`, or `INCONSISTENT`;
8. reconcile the checkpoint and project artifacts before continuing.

Do not blindly repeat an interrupted operation.

---

## 14. Checkpoint Rule

A checkpoint is required after a meaningful bounded unit of implementation, verification, decision-making, or significant interruption.

`dev/now.md` remains short and operational. It is not a chronological diary.

---

## 15. Skill Dependency Closure

Some routed skills explicitly invoke other skills. A parent skill is not considered ready until its required dependency closure is available to the current harness.

Before invoking a routed skill:

1. resolve its known dependency closure in `dev/skill-dependencies.md`;
2. verify required dependencies are installed and discoverable;
3. invoke the parent skill only when required dependencies are available;
4. do not imitate a missing dependency from memory;
5. report missing dependencies and give installation guidance when needed.

---

## 16. Skills, Quality Gates, and the Three Pillars

Evaluate meaningful product work through three pillars:

1. **Solve the Problem** — Useful & Usable
2. **Unique Design** — Desirable & Distinctive
3. **Secure by Design**

Use `dev/quality.md` and `dev/security.md` to route only relevant skills.

Do not require the user to know the correct security skill manually.

---

## 17. Verification Claims

Distinguish clearly between:

- `IMPLEMENTED` — code exists;
- `TESTED` — a relevant test was executed;
- `VERIFIED` — expected behavior was confirmed with appropriate evidence;
- `UNVERIFIED` — evidence is incomplete.

Never claim something is secure, bug-free, compatible, complete, or production-ready without evidence appropriate to that claim.
