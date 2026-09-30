# Adaptive Agent Workflow

**Workflow version: v5**

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

## 2. Five Layers

```text
1. Global user preferences
   How the assistant should work with the user.

2. Environment / harness instructions
   Machine and tool-specific constraints.

3. Project instructions
   How this repository should be developed.

4. Skills
   Specialized workflows such as grilling, debugging, TDD, security, UI design, and browser testing.

5. Project state
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

**Do not** edit production code merely to answer these questions.

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

**Do not** add unnecessary process.

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

**Do not** turn every small change into a long interview.

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

## 7. Build Policy

During implementation:

1. stay within the active task;
2. inspect existing patterns before introducing new ones;
3. make small, verifiable changes;
4. avoid speculative refactoring;
5. verify behavior after meaningful units;
6. checkpoint durable state.

A task may contain multiple implementation units. A chat session does not need to complete the whole task.

---

## 8. Three-Pillar Quality Model

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

**Do not** run every expensive skill on every change.

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

## 9. Security Skill Routing

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

## 10. Recovery-First Execution

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

**Do not** trust the last conversational claim.

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

## 11. Context Safety

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

## 12. Project Switching

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

## 12. Verification Vocabulary

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

## 13. Feature and Bug-Fix Records

Active work belongs in `dev/tasks/`. Completed work may produce a historical record when it is useful to preserve project understanding.

### Features

Create `dev/features/YYYYMMDD-<feature-slug>.md` when the change introduces meaningful user-visible capability or an important workflow/integration. Use `.feature-template.md`.

### Bug Fixes

Create `dev/bug-fixes/YYYYMMDD-<bug-slug>.md` when a bug has been investigated, fixed, and verified and the incident is worth preserving for future troubleshooting, reliability, or security work. Use `.bug-fix-template.md`.

**Do not** create records for every trivial change. The record should summarize the durable lesson and link to the task, ADRs, tests, and commit rather than duplicating implementation details.

Feature/bug records are part of the state transaction that closes the work, but they do not replace the task or `now.md`.

---

## 14. Final Checkpoint

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

## v5 State-Integrity Lifecycle

Adaptive Agent Workflow separates bootstrap from product development. Installing the workflow in an empty/new project does not create product tasks. It produces a `DISCOVERY_PENDING` state, creates a project-specific root README, validates the installation, and applies the `initial` commit policy (default: `ask`).

The first real product requirement creates `T-0001`. Task creation is a state transaction that updates the task file, roadmap, and `now.md`.

Task completion is also a state transaction: verify the task, synchronize affected artifacts, review README impact, run a state-integrity check, then apply the persistent `task` commit policy (`ask` by default or `auto` when configured).

Commit policy is stored in `dev/commit-policy.md`. `initial` and `task` are independent settings. Auto-commit requires verification, state-integrity checks, and a commit scope containing only attributable checkpoint changes.

The template repository's own root README is agent-facing documentation and is not copied verbatim into target projects. For an empty/new project, the agent generates a user-facing README from the actual project state. Existing project READMEs are preserved and updated only when project understanding materially changes.
