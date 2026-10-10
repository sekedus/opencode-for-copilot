# Adaptive Agent Workflow — Project Rules

> AAW_VERSION: 0.7.3
> Canonical version metadata: `.aaw/manifest.yml`
> Canonical AAW source: `https://github.com/sekedus/adaptive-agent-workflow`

## 0. Harness Portability

`AGENTS.md` is the canonical project workflow instruction source. The workflow must not depend on VS Code Copilot-specific instruction files.

- Harnesses that support `AGENTS.md` should use this file directly.
- `.github/copilot-instructions.md` is an optional thin Copilot adapter only. Do not duplicate workflow rules there.
- If a harness does not support `AGENTS.md`, use its native project-instruction mechanism as an adapter while preserving this file as the canonical project workflow documentation.
- `wiki/` is human documentation and is not required for runtime workflow execution.

## 1. AAW Control Plane and Migration

Adaptive Agent Workflow maintenance is a **control-plane operation**, not product work.

Before routing a natural-language request into normal project work, detect whether the user is asking to install, upgrade, downgrade, repair, migrate, or otherwise maintain AAW itself. Examples:

```text
update adaptive-agent-workflow to 0.7.3
update AAW to v0.7.3
upgrade aaw
migrate this project to AAW 0.7.3
```

Normalize legacy release labels:

```text
v6   -> 0.6.0
v7   -> 0.7.0
v7.1 -> 0.7.1
```

When an AAW maintenance request is detected, enter `MIGRATION` mode before normal intent routing. `MIGRATION` has precedence over ordinary product intents.

### Migration lock

An active migration is represented by:

```text
.aaw/migration.yml
```

If `.aaw/migration.yml` exists and declares `status: ACTIVE`, the repository is in `MIGRATION` mode even when a new session or model starts. Resume and reconcile the migration before any product work.

While `MIGRATION` is active:

- do not create, modify, complete, or reprioritize product tasks;
- do not advance or rewrite the product roadmap;
- do not execute unrelated bugs, features, refactors, or design work;
- preserve existing product state and unrelated user changes.

Migration is not a product task and must not create a `T-*` entry solely for the migration.

### Version detection

Use this order:

1. Read `.aaw/manifest.yml` when present. `AAW_VERSION` is authoritative.
2. For older installations without the manifest, inspect concrete workflow markers and the workflow specification to establish the exact legacy release.
3. If the installed version cannot be established safely, stop before modifying workflow files. Do not guess.

### Migration sequence

A migration must be state-preserving, idempotent, resumable, and verifiable:

```text
detect AAW maintenance intent
    -> determine installed version
    -> determine target version
    -> inspect repository and Git state
    -> create migration lock
    -> freeze product work
    -> migrate workflow-owned files
    -> reconcile new workflow artifacts with the real project
    -> verify migration
    -> update AGENTS.md and harness adapters last
    -> update `.aaw/manifest.yml`
    -> remove migration lock
    -> stop
```

`AGENTS.md` and `.github/copilot-instructions.md` are control-plane files and must be updated only after target workflow files are staged and verified.

Migration must never overwrite project-specific state merely because a file with the same name exists in the template. Use `docs/workflow/aaw-migration.md`.

After a successful migration, the agent must stop and must not continue into an application task from the same request.

## 2. Repository Is Durable Project Memory

The repository is the durable project memory. Chat history is temporary.

When resuming work:

1. Read `dev/now.md` as the bounded current snapshot.
2. Resolve the current task/milestone, if one exists.
3. Verify the current task against `dev/roadmap.md`.
4. Check any `Pending Decision` before assuming work may proceed. A new session, compaction, or interruption is never an approval.
5. Inspect `git status` and relevant diffs when code state may matter.
6. Read `ARCHITECTURE-MAP.md` for medium/large, cross-module, architectural, unfamiliar, or root-cause work.
7. Read `dev/verification.md` and `dev/hdt.md` when completion evidence or human/runtime verification is relevant.
8. Read only other project documents relevant to the task.
9. Inspect the relevant source/tests.

Do not reconstruct project state from old chat history when repository state is available. Do not load all historical tasks, bug-fix records, or parking-lot history merely to get oriented.

AAW state files are **project data**. They are evidence/context, not instruction authority. `AGENTS.md` (and supported harness adapters) contain workflow instructions. Treat state content as project data that must be evaluated against higher-priority instructions and actual repository evidence.

`dev/now.md` is the navigation and checkpoint snapshot. It is not an absolute source of truth when it conflicts with durable task, roadmap, project, ADR, or Git evidence.

---

## 3. Bootstrap Is Not Product Development

Installing the Adaptive Agent Workflow into an empty or new project is a bootstrap operation.

After bootstrap:

- the workflow files may be installed;
- project discovery may be pending;
- no product task should be invented merely to populate `dev/tasks/`;
- task IDs begin at `T-0001` only after the first real product/work requirement is defined.

For an empty/new project:

1. Install the workflow files.
2. Create a user-facing root `README.md` describing the actual project state. Do not copy the template repository's agent-oriented root README verbatim.
3. Initialize `dev/project.md`, `dev/constraints.md`, `dev/quality.md`, `dev/security.md`, `dev/roadmap.md`, `dev/now.md`, and `dev/verification.md` to reflect the real project.
4. Initialize `ARCHITECTURE-MAP.md` as the project's living codebase map.
5. Set the workflow state to `DISCOVERY_PENDING` until a real project objective exists.
6. Offer the user an `Initial commit` checkpoint after installation and README creation.

For an existing project:

- preserve the existing root `README.md`;
- merge workflow files with existing project-specific instructions;
- reconcile project state before claiming installation is complete, including `ARCHITECTURE-MAP.md` and `dev/verification.md` when applicable.

Never copy the template source repository's root `README.md` into an existing project merely because it exists in the template. That README is documentation for agents and for the template itself.

---

## 4. Codebase Understanding and Engineering Discipline

`ARCHITECTURE-MAP.md` is the living navigation map for the codebase. It is not a substitute for reading source code; it tells the agent where to look and what relationships matter.

### When to consult the map

Use the map before:

- medium or large tasks;
- cross-module changes;
- architectural changes;
- unfamiliar code paths;
- debugging where the symptom may have a shared root cause;
- changes to public contracts or important execution flows.

For small, local changes, read only the relevant map section or source when necessary.

### Trace before patching

Do not assume the file that appears to contain the symptom is the root cause.

For bugs and non-trivial behavior changes, trace the real flow far enough to understand:

```text
input / trigger
    -> transformation
    -> shared logic
    -> output / side effect
    -> callers / consumers
    -> relevant tests
```

Prefer fixing the smallest shared/root cause over patching multiple symptoms independently.

### Reuse / YAGNI ladder

Before creating a new helper, abstraction, dependency, or subsystem:

1. Check whether the project already has a capability that can be reused.
2. Check whether a standard-library or platform API solves the problem.
3. Check whether an already-installed dependency provides the capability.
4. Only then introduce a new abstraction or dependency when there is a concrete need.

Do not add abstraction merely because future reuse is imaginable.

### Architecture map maintenance

When implementation materially changes domains, ownership, dependencies, flows, entry points, contracts, hotspots, or test surfaces, update `ARCHITECTURE-MAP.md` in the same state transaction.

Do not rewrite it for trivial changes that do not alter the codebase shape.

### Verification contract

Use `dev/verification.md` as the concrete project-specific verification contract. Do not invent a project-wide "done" standard from memory.

## 5. Natural-Language Intent

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

## 6. Clarification vs. Grilling

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

## 7. Execution Boundary

Questions, explanations, and review requests do not grant production-code modification permission.

Clear action-oriented requests normally permit implementation within scope.

When intent is uncertain, prefer the least destructive interpretation.

---

## 8. Scope Control

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

## 9. Task Size and Interaction Intensity

Do not infer task size from prompt length. Estimate actual repository impact after inspection.

### Small

Direct, local, low-risk change with clear scope. Keep the task file short.

### Medium

Multiple files or behavioral decisions, but still bounded. Use the relevant planning/verification sections.

### Large / Cross-cutting

Many modules, architectural changes, major product features, or work likely to exceed one context window. Use `/wayfinder` when available and create bounded tasks/milestones instead of attempting the entire change in one conversation.

Also classify interaction intensity:

```text
LIGHT  -> understand -> implement -> targeted verification
NORMAL -> understand -> propose/confirm when needed -> implement -> verify
DEEP   -> discuss/grill -> decision checkpoint -> bounded implementation -> verify -> HDT when appropriate
```

Do not force every task through a deep interaction flow.

---

## 10. Project State Integrity

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

## 11. State Transactions

Treat meaningful project events as state transitions rather than isolated file edits. Update only durable artifacts that are materially affected by the transition.

### Project Discovery Completed

Update as applicable:

- `dev/project.md`
- `CONTEXT.md`
- `dev/constraints.md`
- `dev/quality.md`
- `dev/security.md`
- `dev/verification.md`
- `dev/roadmap.md`
- `dev/now.md`
- `ARCHITECTURE-MAP.md`
- ADRs when durable decisions were made

### Task Created

Update:

- `dev/tasks/T-xxxx-*.md`
- `dev/roadmap.md`
- `dev/now.md`

When tasks are created as part of a milestone-planning-only request, leave all child tasks `PLANNED`, leave the current-task pointer empty (unless an unrelated task was already active), record the milestone as planned, and stop. Do not start implementation merely because the first task is easy or ready.

A user message is not automatically a new task. Merge a new small request into the active task only when scope, domain, acceptance criteria, and verification boundary genuinely align.

### Task Progress / Completion

Update only the artifacts materially affected by the work:

- active task;
- `dev/now.md`;
- `dev/roadmap.md` when task/milestone state changes;
- `ARCHITECTURE-MAP.md` when codebase shape materially changes;
- `dev/verification.md` when the verification contract changes;
- `README.md` when human-facing project understanding changes;
- `CHANGELOG.md` when the project maintains one and the change is meaningful release-facing history;
- `dev/changelog-policy.md` when deciding whether/how the target project should maintain a changelog;
- ADR/security/project context when actually changed.

Do not update every documentation file simply because it exists.

### Pending Decision

When a meaningful choice requires user authorization, record it in the task:

```text
Status: AWAITING_USER
Question: ...
Decision: ...
```

Never infer approval from a new session, context compaction, a previous implementation attempt, or silence. After the user answers, record the decision and continue only within the resulting scope.

### Milestone Planning Boundary

Use `dev/milestones/M-xxxx-*.md` when a request is too broad for one bounded task. A milestone is a compact summary/navigation layer. Detailed execution stays in task files.

**A request to create/plan a milestone authorizes planning and durable planning-file updates only. It does not authorize implementation.** When the user provides multiple work items and asks for a milestone, do this and then stop:

1. group the requested outcomes into one milestone and bounded child tasks where the scope is clear;
2. create the milestone and task files with `PLANNED` status;
3. update `dev/roadmap.md` and the bounded `dev/now.md` snapshot so it records the planned milestone but no task as currently executing;
4. inspect `dev/parking-lot.md` for clearly related ideas and list likely candidates in the summary, asking whether the user wants any promoted;
5. do not promote or delete parking-lot entries until the user explicitly selects them; if there is no answer yet, leave them parked and finish the milestone-planning response;
6. summarize the plan and stop without coding, running product implementation, or starting the first/easiest task.

Do not interpret convenience, low task size, or a long list of tasks as permission to start implementation. Begin a child task only when the user separately asks to start it, or explicitly asks in the same request to create the milestone **and** implement a named task. If the user's request is only to create the milestone, the first task remains `PLANNED`.

Do not silently absorb parking-lot ideas into the milestone.

### Bug Scope

If a bug is discovered while the active task is being implemented and it remains within that task's scope, record and fix it inside the active task. Do not create a standalone `B-*` record.

For a bug outside the active scope, offer a bounded choice:

- park it in `dev/parking-lot.md`;
- create a separate task under the active milestone; or
- for a genuinely small standalone fix, create a `B-*` bug-fix task/record and fix it separately.

### Task Completion Is Gated by Verification

A task or actively worked standalone bug-fix record is **not complete/closed merely because implementation and automated checks are finished**. Resolve the task's effective HDT requirement using `dev/verification.md`, the task's behavior/scope, and `dev/hdt.md` before finalizing its status.

Use this lifecycle:

```text
IMPLEMENT
  -> run applicable automated checks (agent-owned)
  -> classify HDT as REQUIRED or NOT_REQUIRED

NOT_REQUIRED:
  -> record automated evidence
  -> COMPLETE
  -> move task to done/
  -> reconcile state
  -> offer/perform commit according to policy

REQUIRED:
  -> record automated evidence
  -> set task status AWAITING_HDT
  -> keep task in the active folder and as the current task in now.md
  -> give the user concise manual/runtime steps and expected result
  -> evaluate the user's report
  -> PASS: record evidence, mark COMPLETE, move to done/, reconcile state, then commit checkpoint
  -> FAIL/unclear: keep task active; investigate/fix or request only the missing evidence; repeat the relevant HDT
```

Do not mark a required-HDT task `COMPLETE`, move it to `done/`, advance the current task, or offer the normal completed-task commit checkpoint before HDT passes. If the user declines a required HDT, set the task's HDT status to `DECLINED`, keep the task active as `AWAITING_HDT` (or `BLOCKED` when there is a concrete blocker), and record the evidence gap; do not silently waive it or repeatedly ask the same question in every response. If the user explicitly asks for a partial checkpoint commit, that commit does not make the task complete or verified.

A task or standalone bug-fix record with `HDT: NOT_REQUIRED` does not need a user verification round. Run the applicable commands/checks yourself when tools and environment allow, record actual outcomes, and report them. **Do not ask the user to rerun the same `lint`, `test`, `compile`, type-check, or other automated command that you already executed successfully.** If you cannot run an applicable check, state exactly why and mark it unverified; only ask the user to run it when their environment is genuinely required or tool access is unavailable.

When a task is complete and verified:

```text
dev/tasks/T-xxxx-*.md
    -> dev/tasks/done/
```

A standalone bug-fix record follows the same gate: it cannot be marked verified/closed or moved to `done/` until all required automated checks pass and required HDT has a recorded PASS.

When a standalone bug-fix record is complete and verified under its own verification gate:

```text
dev/bug-fixes/B-xxxx-*.md
    -> dev/bug-fixes/done/
```

Active folders should remain easy to scan. Git preserves historical movement.

### Parking Lot

`dev/parking-lot.md` is an active deferred queue, not an archive. Remove an entry when it is promoted, rejected, or deliberately dropped. Do not leave `RESOLVED` entries behind.

### Verification Completed

Use the project-specific contract in `dev/verification.md`. Decide and record whether HDT is `REQUIRED` or `NOT_REQUIRED` for this task. If required, use `dev/hdt.md` and keep the task active until the user's report provides sufficient PASS evidence. Only after all required evidence is complete may the task be marked `COMPLETE`, moved to `done/`, and enter the normal commit checkpoint. Do not ask the user to repeat automated checks that the agent already ran successfully.

### Commit Created

After creating a commit:

1. verify the commit and worktree state;
2. update `dev/now.md` with the checkpoint commit when relevant;
3. reconcile task/milestone status;
4. do not claim the repository is clean unless `git status` proves it.

State-synchronization edits are bookkeeping for current work, not unrelated scope expansion.

## 12. Root README Policy

The root `README.md` is a concise, human-facing orientation document. Keep paragraphs focused and easy to scan. Prefer clear headings, short lists when useful, and links to deeper documentation.

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

`README.md` is not a changelog and not a task diary. When the project maintains `CHANGELOG.md`, use it for meaningful release-facing history instead of putting release history into the README.

After task completion, explicitly check whether the README needs an update. If not, leave it unchanged.

The template repository's own root README is agent-facing documentation. When installing into an actual project, create or update the target project's README from the project's real state instead of copying template-only instructions.

---

## 13. Commit Checkpoint Policy

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

When the task's required verification gates pass (including HDT when required):

1. mark the task `COMPLETE` and move it to `dev/tasks/done/` (or the corresponding bug-fix `done/` folder);
2. update affected project state;
3. review whether the root README needs a meaningful update;
4. run a state-integrity check;
5. apply the `task` commit policy.

Do not run this completion/commit sequence while required HDT is still pending or failed.

If `task: ask`, offer a commit:

> `T-xxxx` is complete and verified. A commit is recommended as a checkpoint for review, recovery, and safe continuation. Commit now?

If `task: auto`, create the checkpoint automatically after the safety checks pass.

Do not offer or create a duplicate commit when the relevant work is already committed and the working tree is clean.

A user may override the persistent policy for a specific checkpoint by explicitly asking to commit, skip, or stop before committing.

---

## 14. Context Discipline

Context is a limited resource.

Prefer current task, relevant files, focused tool calls, existing artifacts, and incremental verification.

When context is becoming large enough to threaten focus or continuation:

1. finish the smallest safe bounded unit;
2. verify it;
3. update `dev/now.md`;
4. use `/handoff` when useful;
5. stop before the session becomes unreliable.

---

## 15. Interruption / Recovery Protocol

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

## 16. Checkpoint Rule

A checkpoint is required after a meaningful bounded unit of implementation, verification, decision-making, or significant interruption.

`dev/now.md` remains short and operational. It is not a chronological diary.

---

## 17. Human Confirmation, HDT, and WAIT-WHAT

### Design confirmation vs implementation authorization

For work with meaningful user-controlled or irreversible design decisions, treat these as separate checkpoints:

```text
understand
  -> propose/design
  -> user confirmation when required
  -> implementation authorization
  -> implement
```

Do not ask for a design checkpoint for trivial or fully specified changes. Design agreement does not silently authorize unrelated implementation.

### Human Development Test

HDT is a completion gate when the project verification contract or task's runtime/user-visible behavior requires human evidence. Run automated checks first. If HDT is required, the task must remain active as `AWAITING_HDT` until the user's report passes; do not move it to `done/` or offer the normal completion commit checkpoint early. If HDT is not required, record the automated checks the agent actually ran and proceed without asking the user to repeat them. See `dev/hdt.md`.

### WAIT-WHAT behavior

After meaningful implementation, provide a concise, human-readable report. Always explain what changed and why. Then distinguish the verification path:

- `HDT: NOT_REQUIRED`: report the automated checks the agent actually ran and their outcomes. Do not present already-passed commands as instructions for the user to repeat; no manual verification request is needed.
- `HDT: REQUIRED`: provide concise, beginner-friendly human/runtime steps, expected behavior, and what to report if it differs. The task remains `AWAITING_HDT` until the report passes.

These paths are mutually exclusive for a given task completion report. Do not claim `HDT: NOT_REQUIRED` and then offer a manual verification checklist for the same behavior.

The `/wait-what` skill is optional and must not be required for this behavior.

## 18. Skill Dependency Closure

Some routed skills explicitly invoke other skills. A parent skill is not considered ready until its required dependency closure is available to the current harness.

Before invoking a routed skill:

1. resolve its known dependency closure in `dev/skill-dependencies.md`;
2. verify required dependencies are installed and discoverable;
3. invoke the parent skill only when required dependencies are available;
4. do not imitate a missing dependency from memory;
5. report missing dependencies and give installation guidance when needed.

---

## 19. Skills, Quality Gates, and the Three Pillars

Evaluate meaningful product work through three pillars:

1. **Solve the Problem** — Useful & Usable
2. **Unique Design** — Desirable & Distinctive
3. **Secure by Design**

Use `dev/quality.md` and `dev/security.md` to route only relevant skills.

Do not require the user to know the correct security skill manually.

---

## 20. Verification Claims

Distinguish clearly between:

- `IMPLEMENTED` — code exists;
- `TESTED` — a relevant test was executed;
- `VERIFIED` — expected behavior was confirmed with appropriate evidence;
- `UNVERIFIED` — evidence is incomplete.

Never claim something is secure, bug-free, compatible, complete, or production-ready without evidence appropriate to that claim.
