# The Three Product Pillars

Adaptive Agent Workflow uses three pillars as the product-quality model:

```text
1. Solve the Problem
   Useful & Usable

2. Unique Design
   Desirable & Distinctive

3. Secure by Design
   Security is part of design and verification
```

The goal is not to turn every feature into a giant checklist. The goal is to prevent a common failure mode of AI-assisted development:

```text
feature works
but
- users do not really benefit from it;
- the product looks generic or confusing;
- the implementation exposes avoidable security risks.
```

## Pillar 1 — Solve the Problem

### Useful

Ask:

- Does this solve the user's actual problem?
- Is the behavior aligned with the product requirements?
- Does the feature remove work or create unnecessary complexity?

Typical tools/skills:

- `/grill-with-docs`
- `/tdd`
- `/diagnosing-bugs`
- Playwright for real user flows

### Usable

Ask:

- Can users understand what to do?
- Can they recover from errors?
- Are loading, empty, and failure states handled?
- Does the interaction remain usable on supported devices?
- Is accessibility considered where relevant?

The gate is not "looks good". It is "users can accomplish the intended task reliably."

## Pillar 2 — Distinctive Design

### Desirable

The interface should communicate the product's purpose and quality.

Consider:

- visual hierarchy;
- typography;
- color;
- motion;
- composition;
- tone;
- interaction details.

### Distinctive

**Do not** accept generic AI output as the default.

The design should have a deliberate point of view appropriate to the product.

Use:

```text
impeccable
```

for design shaping, critique, audit, polish, and refinement.

Use:

```text
frontend-design
```

when you want a deliberate frontend creation workflow.

Use:

```text
frontend-design-review
```

to independently review the resulting UI.

A distinctive design does not mean "visually loud". A refined minimalist product can be distinctive through typography, spacing, composition, interaction, and product-specific details.

## Pillar 3 — Secure by Design

Security is considered before implementation when the attack surface is meaningful.

Ask:

- What do we trust?
- What do we not trust?
- Where does untrusted input cross a boundary?
- What data is sensitive?
- What actions require authorization?
- What can an attacker control?
- What happens when dependencies or external services fail?

The project-level routing file is:

```text
/dev/security.md
```

It maps project characteristics to security domains and targeted skills.

## 4. Pillar Interaction

The pillars overlap.

Example: a password-reset feature belongs to all three:

```text
Useful & Usable
-> the user can actually recover the account

Desirable & Distinctive
-> the flow is understandable and coherent with the product

Secure by Design
-> tokens, expiry, enumeration resistance, and authorization are handled safely
```

A feature should not be considered complete merely because it passes one pillar.

## 5. Adaptive Application

Not every change activates all three pillars at the same depth.

| Change | Useful/Usable | Distinctive | Secure |
|---|---:|---:|---:|
| Text typo | Light | Light | None |
| UI component | Medium | High | Light |
| New user flow | High | High | Medium/High |
| Authentication | High | Medium | High |
| Payment flow | High | Medium | High |
| Database migration | Medium | None | Medium/High |
| New marketing landing page | High | High | Medium |
| Internal refactor | Low/Medium | None | Depends on boundary |

The agent should select the smallest meaningful set of gates rather than mechanically running every skill.

## 6. Definition of Done

For a meaningful product feature, the agent should be able to answer:

```text
Problem:
What user problem does this solve?

Usability:
Can the intended user complete the task reliably?

Design:
Does the UI have intentional, product-appropriate direction?

Security:
What attack surface was introduced or changed?

Evidence:
What tests, browser checks, security checks, or reviews support the result?
```

If one answer is unknown, record the uncertainty instead of pretending the feature is complete.
