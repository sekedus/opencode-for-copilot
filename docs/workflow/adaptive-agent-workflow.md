# Adaptive Agent Workflow

**Workflow version: 0.7.3**

## 0. AAW Maintenance and Migration

AAW installation, upgrade, downgrade, repair, and migration are control-plane operations. They take precedence over normal product intent routing.

Examples:

```text
update adaptive-agent-workflow to 0.7.3
update AAW to v0.7.3
upgrade aaw
migrate this project to AAW 0.7.3
```

Legacy labels normalize as `v6 -> 0.6.0` and `v7 -> 0.7.0`. The installed version is read from `.aaw/manifest.yml`, where `AAW_VERSION` is authoritative. Older projects without the manifest must be identified from concrete repository evidence; uncertain versions are a reason to stop rather than guess.

During migration:

```text
.aaw/migration.yml = ACTIVE
mode                = MIGRATION
product tasks       = FROZEN
product roadmap     = FROZEN
product state       = PRESERVED
```

Migration is not represented as a product `T-*` task. It must not create or execute product work. `AGENTS.md` and `.github/copilot-instructions.md` are updated last. The migration ends by writing the target manifest, removing the lock, and stopping.

See [`aaw-migration.md`](aaw-migration.md) for the full procedure.


## Milestone Creation Is Planning-Only

When the user provides multiple work items and asks to create/group them into a milestone, create the milestone plus bounded child task records, update `dev/roadmap.md` and the bounded `dev/now.md` snapshot, list related parking-lot candidates for user selection, and stop. Leave unselected parking-lot items untouched. All child tasks remain `PLANNED`; do not start the first or easiest task. Start implementation only if the user explicitly asks to begin a named task or explicitly combines milestone creation with implementation authorization.

## Completion and HDT Gate

The agent runs applicable automated checks and reports their actual results. Do not ask the user to rerun an automated command that the agent already executed successfully. Use `dev/verification.md` to set each task's effective HDT requirement to `REQUIRED` or `NOT_REQUIRED`. If required, the task remains active as `AWAITING_HDT` until a sufficient user-reported PASS is recorded. Only then may the task be marked `COMPLETE`, moved to `dev/tasks/done/`, and enter the normal commit policy. Failed, unclear, or declined required HDT leaves the task active and the evidence gap explicit. If HDT is not required and automated evidence is sufficient, complete/move/commit without an unnecessary human verification round.

## Harness Portability

The workflow is project-level and uses the root `AGENTS.md` as its canonical instruction source. Harness-specific instruction files are adapters, not competing workflow definitions.

- OpenCode/OpenChamber: use `AGENTS.md` directly.
- VS Code Copilot: `AGENTS.md` is the portable source; `.github/copilot-instructions.md` may remain as a thin adapter.
- Other harnesses: verify their current instruction discovery rules and use a thin adapter only when necessary.
- `wiki/` is optional human documentation.
- Personal user instructions are optional and must not be required for project workflow execution.

---

## 1. Design Goal

The workflow is designed for a user who:

- communicates best in natural language;
- may switch projects or return after long gaps;
- may use different models with different context windows;
- may use free models with weaker reasoning and higher hallucination risk;
- may continue work from another session, IDE, or device;
- may forget project details after a long interruption.

The workflow therefore optimizes for **recovery, bounded work, and evidence**, not conversation continuity.

---

## 2. Six Layers

```text
1. Global user preferences
   How the assistant should work with the user.

2. Environment / harness instructions
   Machine and tool-specific constraints.

3. Project instructions
   How this repository should be developed.

4. Skills
   Specialized workflows such as grilling, debugging, TDD, security, UI design, and browser testing.

5. Codebase memory
   Where capabilities, flows, ownership, dependencies, contracts, and test surfaces live.

6. Project state
   Where work actually is right now.
```

The project state is represented primarily by:

```text
CONTEXT.md       domain vocabulary
ADR              durable architectural decisions
tasks/           bounded work
now.md           current execution state
git              actual code/worktree state
```

---

## 3. Natural-Language Interface

The user should normally be able to say:

```text
continue
why is this failing?
can you check the auth?
i want to build a subscription
fix this
write some tests
i don't understand
```

The agent translates that into an internal intent.

The user does not need to repeat workflow labels in every prompt.

---

## 4. Intent Routing

### Discuss / Review

Examples:

- "Why is this failing?"
- "Is this secure?"
- "What do you think?"
- "Could this be a bug?"

Do not edit production code merely to answer these questions.

### Plan

Use when the user wants an implementation approach or when a feature needs explicit planning before code.

### Build

Use when implementation intent is clear.

### Fix

Use when the user explicitly asks to apply a fix or an already-approved fix.

### Resume

Use when the user says `continue`, `resume`, `lanjutkan`, or equivalent.

### Handoff

Used to checkpoint current state without starting new work.

---

## 5. Task-Size Triage

### Small

Characteristics:

- local change;
- low risk;
- clear intent;
- few files;
- little or no architectural consequence.

Do not add unnecessary process.

### Medium

Characteristics:

- multiple files;
- user-visible behavior;
- several tests or design choices;
- bounded scope.

Create or refine a task and implement in bounded units.

### Large

Characteristics:

- broad feature;
- architectural changes;
- migration;
- many modules;
- likely to exceed one context window.

Use requirement discovery, `/grill-with-docs` when needed, `/wayfinder` when available, multiple bounded tasks, and explicit checkpoints.

Prompt length is not a reliable task-size signal.

---

## 6. Grilling Policy

Invoke `/grill-with-docs` when the user introduces a substantial or ambiguous product/feature/design idea and implementation would otherwise require guessing.

Before grilling, inspect the repository so the user is not asked questions that the codebase can answer.

Stop grilling when implementation-critical ambiguity is sufficiently resolved.

Do not turn every small change into a long interview.

Persist durable domain vocabulary in `CONTEXT.md` and hard-to-reverse architectural choices in ADRs.

### Skill Dependency Closure

Skill routing is dependency-aware. Some orchestrators explicitly invoke other skills. The current `grill-with-docs` skill, for example, explicitly calls `grilling` and `domain-modeling`.

```text
routed parent
    ↓
known dependency closure
    ↓
availability check
    ↓
parent invocation
    ↓
child skill invocation as specified upstream
```

If a required dependency is unavailable, stop the specialized workflow rather than recreating it from memory. Report the missing skill and provide the installation command. See `dev/skill-dependencies.md`.

---

## 7. Codebase Memory and Engineering Discipline

`ARCHITECTURE-MAP.md` is the living codebase map. It is intentionally compact and navigational rather than a second architecture document or file-by-file index.

Use it to answer quickly:

- where a capability lives;
- who owns a module/domain;
- what depends on it;
- what depends on it;
- which flows cross module boundaries;
- which files are hotspots or sensitive contracts;
- where the relevant tests live.

### Trace before patching

For bugs and non-trivial behavior changes:

```text
symptom
  -> reproduction
  -> actual execution/data flow
  -> shared/root cause
  -> smallest correct fix
  -> regression test
```

### Reuse / YAGNI ladder

```text
existing project capability
    -> standard/platform API
    -> existing dependency
    -> new abstraction/dependency only when justified
```

Do not add abstractions merely for hypothetical future reuse.

### Living map rule

Update `ARCHITECTURE-MAP.md` in the same state transaction when code changes materially alter ownership, dependencies, flows, entry points, contracts, hotspots, or test surfaces.

### Verification contract

`dev/verification.md` defines the concrete project checks and evidence needed to move from `IMPLEMENTED` to `TESTED` or `VERIFIED`.

## 8. Build Policy

During implementation:

1. stay within the active task;
2. inspect existing patterns before introducing new ones;
3. make small, verifiable changes;
4. avoid speculative refactoring;
5. verify behavior after meaningful units;
6. checkpoint durable state.

A task may contain multiple implementation units. A chat session does not need to complete the whole task.

---

## 9. Three-Pillar Quality Model

Meaningful product work is evaluated through three primary pillars:

```text
1. Solve the Problem
   Useful & Usable

2. Unique Design
   Desirable & Distinctive

3. Secure by Design
   Security is part of design and verification
```

The pillars are not a fixed checklist. Apply each at the depth justified by the change.

Use `dev/quality.md` for quality-gate selection and `dev/security.md` for security-skill routing.

Examples:

```text
small CSS fix
-> Useful/Usable light check + targeted verification

normal user feature
-> behavior tests + relevant usability check + code review

new public UI
-> impeccable OR frontend-design OR taste-skill + design review + browser verification

authentication
-> behavior tests + targeted security workflows + E2E/failure tests + code review

LLM/RAG feature
-> behavior tests + AI-security checks + abuse-case testing

large architectural feature
-> grill/wayfinder + tests + affected pillar gates + review + ADR
```

Do not run every expensive skill on every change.

### Design Skill Routing

Keep multiple design options available instead of treating one design skill as mandatory:

```text
impeccable
  -> design shaping, critique, audit, polish, refinement

frontend-design
  -> deliberate frontend visual direction and implementation

taste-skill / design-taste-frontend
  -> alternative, more opinionated visual-taste and anti-generic pass

frontend-design-review
  -> independent post-implementation review
```

Select the smallest useful combination. Do not automatically run all design skills on every UI change.

## 10. Security Skill Routing

The user should not have to memorize security skill names. Classify the project's attack surface first:

```text
project type
  -> trust boundaries
  -> attack surface
  -> security domain
  -> primary assessment skill
  -> targeted tests
  -> evidence
```

`dev/security.md` is the project-specific routing layer.

The security library is intentionally large. Select the smallest set of skills that covers the changed attack surface.

---

## 11. Human Confirmation, HDT, and WAIT-WHAT

### Adaptive interaction intensity

AAW does not force every change through the deepest workflow:

```text
LIGHT  -> understand -> implement -> targeted verification
NORMAL -> understand -> propose/confirm when needed -> implement -> verify
DEEP   -> discuss/grill -> decision checkpoint -> bounded implementation -> verify -> HDT when appropriate
```

### Pending decisions

If implementation depends on a meaningful user decision, record a `Pending Decision` in the active task. A new session, compaction, silence, or interruption is never an approval.

### Human Development Test

Resolve HDT as `REQUIRED` or `NOT_REQUIRED` using the project's verification contract. If required, the task remains active as `AWAITING_HDT` until a sufficient user report passes; do not mark it `COMPLETE`, move it to `done/`, advance the current task, or offer the normal completion commit checkpoint before then. On FAIL/unclear evidence, investigate/fix or ask a targeted follow-up. See `dev/hdt.md`.

### WAIT-WHAT behavior

After meaningful implementation, briefly explain what changed and why, then choose one consistent verification report:

- `NOT_REQUIRED`: report automated checks the agent actually ran and their outcomes. Do not ask the user to rerun them or provide duplicate manual verification steps.
- `REQUIRED`: provide concise, beginner-friendly human/runtime steps, expected behavior, and what to report if it fails. Keep the task active until PASS.

Do not say HDT is not required and then ask the user to verify the same change manually. The `/wait-what` skill is optional; this communication contract is core AAW behavior.

## 12. Recovery-First Execution

A session can fail at any time:

- context window exhaustion;
- provider/free-model limit;
- network failure;
- tool failure;
- IDE restart;
- agent crash;
- human interruption.

The workflow assumes interruptions are normal.

### After interruption

Do not trust the last conversational claim.

Reconcile:

```text
now.md
  + current task
  + git status
  + git diff
  + relevant tests
  + actual source state
```

Then classify:

```text
COMPLETE
PARTIAL
UNCHANGED
INCONSISTENT
```

Only after reconciliation should implementation continue.

---

## 13. Context Safety

The goal is not to consume the maximum advertised context window.

When the conversation becomes large enough to threaten focus or continuation:

```text
finish bounded unit
  -> verify
  -> update now.md
  -> handoff/checkpoint
  -> new session
```

A new session should require only:

```text
now.md
  -> current task
  -> relevant files
```

not the entire previous conversation.

---

## 14. Project Switching

A project switch is not a loss of state.

Before intentionally switching away from a project:

```text
current work
  -> checkpoint now.md
  -> record blockers / next action
  -> optionally commit/push when the work must be portable
  -> switch project
```

New ideas belong in `dev/parking-lot.md` until intentionally promoted.

This allows the user to explore project B without losing the exact resume point in project A.

---

## 15. Verification Vocabulary

Use explicit evidence labels:

```text
IMPLEMENTED
  code has been changed.

TESTED
  a relevant test/check has been executed.

VERIFIED
  expected behavior has been confirmed with suitable evidence.

UNVERIFIED
  work exists but evidence is incomplete.
```

Avoid claims such as "secure" or "fully compatible" unless the evidence supports them.

---

## 16. Task, Milestone, and Bug Records

Active work belongs in `dev/tasks/`. Use `dev/milestones/` when a bounded outcome is too broad for one task. Use `dev/bug-fixes/` only for standalone meaningful bugs after verification.

### Tasks

A task is a bounded work unit, not one user message. A new small request may join an active task when scope, domain, acceptance criteria, and verification boundary genuinely align. Otherwise, create a separate task or park it.

Small task files should stay small. Do not fill a tiny task with large planning/history sections merely because a template contains them.

### Milestones

A milestone is a compact grouping and navigation layer for related tasks. It is not a second source of truth for execution details. When creating a milestone, inspect `dev/parking-lot.md` for related ideas and ask the user before promoting any candidate.

### Bug fixes

A bug discovered inside the active task remains inside that task when it is within scope. For standalone meaningful bugs, use stable IDs such as `B-0001-<slug>.md`. Move completed task files to `dev/tasks/done/` and completed bug-fix records to `dev/bug-fixes/done/`.

Do not use active folders as archives. Git history preserves historical movement.

## 17. Final Checkpoint

Before ending a meaningful session, `dev/now.md` should answer:

1. What are we building?
2. What task is active?
3. What was just completed?
4. What happens next?
5. What files matter?
6. What must not be changed?
7. What verification exists?
8. What remains uncertain?

If these cannot be answered, the handoff is incomplete.

---

## Historical: 0.5.0 State-Integrity Lifecycle

Adaptive Agent Workflow separates bootstrap from product development. Installing the workflow in an empty/new project does not create product tasks. It produces a `DISCOVERY_PENDING` state, creates a project-specific root README, validates the installation, and applies the `initial` commit policy (default: `ask`).

The first real product requirement creates `T-0001`. Task creation is a state transaction that updates the task file, roadmap, and `now.md`.

Task completion is also a state transaction: verify the task, synchronize affected artifacts, review README impact, run a state-integrity check, then apply the persistent `task` commit policy (`ask` by default or `auto` when configured).

Commit policy is stored in `dev/commit-policy.md`. `initial` and `task` are independent settings. Auto-commit requires verification, state-integrity checks, and a commit scope containing only attributable checkpoint changes.

The template repository's own root README is agent-facing documentation and is not copied verbatim into target projects. For an empty/new project, the agent generates a user-facing README from the actual project state. Existing project READMEs are preserved and updated only when project understanding materially changes.

## Historical: 0.7.0 Engineering Discipline Summary

The 0.7.0 layer adds codebase memory and engineering discipline to the recovery-first workflow. Project state remains centered on `now.md`, tasks, roadmap, and Git, while `ARCHITECTURE-MAP.md` explains the shape of the codebase and `dev/verification.md` defines concrete evidence for completion.


## 0.7.1 Migration Foundation

The 0.7.1 layer adds explicit workflow control metadata:

```text
.aaw/manifest.yml
    = authoritative installed AAW version

.aaw/migration.yml
    = durable active-migration lock/state

MIGRATION
    = control-plane mode with product work frozen
```

This lets a user request an AAW upgrade using natural language while the agent determines the installed release, preserves project state, migrates workflow-owned files, verifies the target, updates control instructions last, and stops without executing an application task.


## 0.7.2 Workflow Ergonomics

The 0.7.2 layer keeps the 0.7.1 migration/control plane and adds a lighter operating model for real project use:

```text
compact now snapshot
active-only parking lot
adaptive task records
milestones for broad bounded work
standalone B-* bug records
done/ lifecycle folders
pending decisions
adaptive interaction intensity
HDT when human/runtime evidence matters
WAIT-WHAT as core behavior, optional skill
affected-artifact state synchronization
compact architecture / verification contracts
```

The goal is less bookkeeping, not more documentation.


## 0.7.3 Planning and Verification Gates

The 0.7.3 layer clarifies two lifecycle boundaries:

- **Milestone creation is planning-only** by default. Create the milestone and planned child task records, update the roadmap/current snapshot, and stop. Do not start a first/easiest task without explicit implementation authorization.
- **Required HDT gates completion.** Automated checks are run by the agent when possible; a task with required HDT stays active as `AWAITING_HDT` until PASS, then moves to `done/` and enters the commit policy. Toolchain updates still require relevant automated checks, but do not need HDT when the project's verification contract confirms automated evidence is sufficient.
