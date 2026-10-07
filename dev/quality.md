# Adaptive Quality Gates

The product is evaluated through three primary pillars:

1. **Solve the Problem** — Useful & Usable
2. **Unique Design** — Desirable & Distinctive
3. **Secure by Design** — Security is part of the product design, not a final checkbox

The workflow uses quality gates selectively. The purpose is to increase confidence without wasting context on every change.

## 1. The Three-Pillar Model

### Pillar 1 — Solve the Problem

The product must solve the intended problem and be usable in the real workflow of its users.

Evaluate as appropriate:

- functional correctness;
- task completion;
- information architecture;
- interaction clarity;
- error and empty states;
- accessibility;
- performance that affects usability;
- compatibility with the declared runtime/browser baseline.

Typical gates:

- `/grill-with-docs` for unclear user requirements;
- `/tdd` for important behavior;
- targeted tests;
- browser/E2E verification with Playwright when user interaction matters.

### Pillar 2 — Distinctive Design

The product should be desirable and visually/experientially distinctive when visual design is part of the product.

Evaluate as appropriate:

- clear design direction;
- visual hierarchy;
- typography;
- color and contrast;
- spacing and composition;
- motion and interaction details;
- responsive behavior;
- consistency with the project's design language;
- avoidance of generic AI-generated patterns.

Typical gates:

- `impeccable` for frontend design shaping, critique, audit, polish, and refinement;
- Anthropic `frontend-design` for deliberate visual direction and implementation;
- Leonxlnx `taste-skill` (`design-taste-frontend`) as an alternative for a more opinionated visual-taste / anti-generic pass;
- Microsoft `frontend-design-review` for post-implementation review;
- Playwright/browser verification when UI behavior and responsive states matter.

**Do not** automatically invoke all three design-creation skills. Choose the smallest useful combination.

**Do not** run a full design workflow for a one-line CSS fix.

### Pillar 3 — Secure by Design

Security should be considered at requirement, architecture, implementation, and verification stages.

Evaluate as appropriate:

- trust boundaries;
- authentication and authorization;
- input handling;
- secrets and sensitive data;
- external integrations;
- file and network boundaries;
- abuse cases;
- dependency/supply-chain risk;
- runtime attack surface.

Use `dev/security.md` to map the project's actual attack surface to targeted security skills.

**Do not** treat a generic security checklist or a single AI review as a security guarantee.

## 2. Verification Contract

Use `dev/verification.md` as the project's concrete verification contract. Quality-gate selection answers **what** needs confidence; `dev/verification.md` answers **which commands/evidence** prove it.

 mark a task `VERIFIED` merely because an agent reports that a change works. Require evidence appropriate to the risk and project contract.

## 5. Codebase Engineering Discipline

Before non-trivial implementation:

```text
understand flow
  -> check existing capabilities
  -> choose smallest fitting change
  -> implement
  -> verify
```

Reuse ladder:

1. existing project capability;
2. standard library/platform API;
3. already-installed dependency;
4. new abstraction/dependency only when justified.

For bugs, establish reproduction and trace the real execution/data flow before patching symptoms.

## 6. Classification Dimensions

Before selecting gates, consider:

- task size;
- security sensitivity;
- user-visible impact;
- UI impact;
- architectural impact;
- regression risk;
- browser/runtime compatibility;
- likelihood of requiring real-world verification.

## 5. Small / Local Change

Example:

```text
Fix a typo in a label.
```

Gate:

```text
targeted verification
```

**Do not** run a full security assessment, design audit, or architecture review.

## 6. Normal Feature

Example:

```text
Add bookmark tags.
```

Typical gates:

```text
behavioral tests
-> relevant pillar checks
-> code review
```

Only activate the pillars affected by the change.

## 7. Large / Cross-Cutting Feature

Use:

- `/grill-with-docs` when requirements are unresolved;
- `/wayfinder` when the work genuinely spans multiple sessions;
- bounded tasks;
- checkpoints after meaningful units;
- targeted quality gates for all affected pillars;
- `/code-review` before considering implementation complete.

## 8. Bug / Unknown Failure

Use:

- `/diagnosing-bugs` when available;
- reproduction or an observable failure;
- the smallest valid fix;
- regression testing;
- verification.

**Do not** redesign the system before establishing the actual failure.

## 9. Security Gate

Use `dev/security.md` to classify the attack surface first.

Security routing should follow:

```text
project type
    -> trust boundaries
    -> attack surface
    -> security domain
    -> primary assessment skill
    -> targeted tests
    -> evidence
```

Examples:

```text
Web app
  -> web application security

OAuth/OIDC
  -> identity + OAuth-specific testing

REST/GraphQL API
  -> API security + authorization/data-exposure checks

Mobile app
  -> mobile security + mobile API security

Kubernetes
  -> container + Kubernetes/cloud security

CI/CD
  -> DevSecOps + supply-chain security

LLM/RAG/MCP
  -> AI security + prompt/tool abuse testing
```

**Do not** install or invoke the entire cybersecurity catalog for every project. Select only the domains and skills justified by the project's attack surface.

## 10. UI / Frontend Change

For a new or substantially redesigned UI:

```text
design direction
-> implementation
-> design review
-> browser verification when appropriate
```

Preferred design routing:

```text
new/design-heavy UI
    -> impeccable OR frontend-design OR taste-skill

stronger visual-taste / anti-generic direction
    -> taste-skill

existing UI needs critique / polish
    -> impeccable

implemented UI
    -> frontend-design-review

interactive/responsive UI
    -> Playwright
```

Use `impeccable` when the task is about shaping, critiquing, auditing, polishing, clarifying, distilling, or refining a frontend interface. It provides a larger design vocabulary and deterministic detectors for common AI-generated design patterns.

## 11. Behavior / Regression Work

Use `/tdd` when test-first development materially improves confidence.

Prefer tests around public behavior rather than implementation details.

## 12. Stress / Failure Testing

"Stress testing" is not one universal operation.

Select relevant categories:

- edge cases;
- invalid input;
- repeated actions;
- concurrency/race conditions;
- network failure;
- timeout/retry behavior;
- browser/E2E behavior;
- load/performance tests when the system needs them;
- abuse-case/security testing.

Select the smallest meaningful set based on the feature's risk.

## 13. Codebase-Wide Architecture Review

**Do not** perform architecture refactoring after every task.

Use `/improve-codebase-architecture` periodically or when repeated changes reveal structural friction.

## 14. Review Sequence

Normal feature:

```text
understand
  -> implement
  -> targeted verification
  -> relevant pillar gates
  -> code review
  -> checkpoint
```

Higher-risk feature:

```text
understand / grill
  -> plan
  -> implement in bounded units
  -> tests
  -> security / design / E2E / failure checks as appropriate
  -> code review
  -> checkpoint
```

## 15. Evidence Levels

Use these labels in task notes when useful:

- `IMPLEMENTED` — code exists.
- `TESTED` — a relevant automated/manual test was executed.
- `VERIFIED` — expected behavior was confirmed with appropriate evidence.
- `UNVERIFIED` — work exists but evidence is incomplete.

Never convert "no obvious issue found" into "secure", "bug-free", or "production-ready" without evidence appropriate to that claim.

## 16. Completion Checkpoint

A task is not considered operationally complete until the agent has:

```text
verify task
  -> synchronize task/roadmap/now
  -> review README impact
  -> state-integrity check
  -> offer commit when relevant changes are uncommitted
```

The commit offer is a checkpoint recommendation, not an automatic commit. Commits create useful recovery and review boundaries, especially when the project may later be resumed from a different session, model, IDE, or device.
