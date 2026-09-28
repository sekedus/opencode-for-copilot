# Adaptive Quality Gates

Adaptive Agent Workflow evaluates meaningful product work through three pillars:

```text
1. Solve the Problem — Useful & Usable
2. Unique Design — Desirable & Distinctive
3. Secure by Design
```

The purpose is not to run every skill after every change. Select the smallest meaningful set of gates based on task size, risk, and affected product surface.

## 1. Pillar 1 — Solve the Problem

Use when behavior or user workflow changes.

Typical checks:

- requirements still match the user's problem;
- intended user can complete the task;
- errors, loading, and empty states are usable;
- supported runtime/browser behavior is preserved;
- tests cover important public behavior.

Typical skills:

- `/grill-with-docs`
- `/tdd`
- `/diagnosing-bugs`
- Playwright for real browser flows

## 2. Pillar 2 — Distinctive Design

Use when frontend/interface design is affected.

Preferred routing:

```text
new / redesign / polish
    -> impeccable and/or frontend-design

implemented UI review
    -> frontend-design-review

real browser/responsive verification
    -> Playwright
```

**Do not** run a full design workflow for a one-line CSS correction.

## 3. Pillar 3 — Secure by Design

Before choosing a security skill, classify the changed attack surface in `dev/security.md`.

Use this sequence:

```text
project type
    -> trust boundary
    -> attack surface
    -> security domain
    -> primary assessment workflow
    -> targeted tests
    -> evidence
```

Examples:

```text
web app -> web application security
REST/GraphQL -> API security
OAuth/OIDC -> IAM + OAuth testing
JWT -> token security
mobile -> mobile security
Kubernetes -> container/Kubernetes/cloud security
CI/CD -> DevSecOps + supply chain
LLM/RAG/MCP -> AI security
```

**Do not** invoke the entire cybersecurity library for a normal feature.

## 4. Small / Local Change

Example:

```text
Fix a typo in a label.
```

Gate:

```text
targeted verification
```

## 5. Normal Feature

Example:

```text
Add bookmark tags.
```

Typical flow:

```text
implement
-> tests
-> affected pillar checks
-> code review
-> checkpoint
```

## 6. Hard Bug

Example:

```text
The token occasionally expires immediately.
```

Route to:

```text
/diagnosing-bugs
```

Then:

```text
reproduce
-> minimize
-> hypothesize
-> verify
-> fix
-> regression test
```

## 7. Large / Cross-Cutting Feature

Use:

```text
/grill-with-docs (when requirements are unresolved)
        |
        v
/wayfinder (when the work genuinely spans multiple sessions)
        |
        v
bounded tasks
        |
        v
implementation + targeted pillar gates
        |
        v
/code-review
```

## 8. Stress / Failure Testing

"Stress testing" is layered. Select the relevant categories:

- edge cases;
- invalid input;
- repeated actions;
- concurrency/races;
- network failure;
- timeout/retry behavior;
- browser/E2E behavior;
- load/performance tests;
- security abuse cases.

**Do not** run all of them unless the feature justifies it.

## 9. Periodic Architecture Review

Use `/improve-codebase-architecture` when repeated changes reveal structural friction or when the codebase needs a deliberate architecture review.

**Do not** perform a repository-wide refactor after every small feature.

## 10. Quality-Gate Output

When useful, record:

```text
Pillar:
Gate:
Result:
Evidence:
Remaining uncertainty:
```

Never turn "no obvious issue found" into "secure", "bug-free", or "production-ready" without appropriate evidence.
