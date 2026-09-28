# Grilling and Requirements

## Why grill?

Free models often fail when the request is underspecified. They fill gaps with guesses, then produce a large implementation that later needs to be redesigned.

The goal of grilling is not to ask every possible question. The goal is to eliminate **implementation-critical ambiguity** before expensive work begins.

## When to invoke `/grill-with-docs`

Use it when:

- a new product or feature is substantial;
- multiple reasonable designs exist;
- important behavior is unspecified;
- architecture could change depending on the answer;
- implementation would otherwise require guessing.

**Do not** use it for:

- typo fixes;
- obvious local changes;
- a well-defined continuation;
- a change where existing code already resolves the ambiguity.

## How the interaction should feel

The user should be able to say:

```text
I want to add WhatsApp login.
```

The agent should inspect existing authentication code first, then route to `/grill-with-docs` if needed.

The user should answer in very short natural language:

```text
WhatsApp number is the primary identity.
```

or:

```text
Yes, five-minute OTP is fine.
```

The user should not have to fill out a formal requirements document manually.

## What the skill should produce

At minimum:

```text
shared terminology
important requirements
out-of-scope behavior
durable architectural decisions
acceptance criteria
```

Matt Pocock's skill repository currently positions `/grill-with-docs` as a codebase-aware grilling workflow that can write durable context/decisions, while `/wayfinder` is intended for route-finding work that spans multiple sessions.

## Recommended answer style

When several answers are plausible, recommend one briefly.

Example:

```text
How should a deleted bookmark behave?

Recommendation: soft delete. It preserves recovery and avoids
accidental permanent data loss.

Do you want soft delete or permanent delete?
```

This reduces the user's mental workload without silently making a high-impact decision.

## Stop condition

Stop grilling once:

- the user-visible behavior is clear;
- important edge cases are resolved;
- architecture-critical decisions are known;
- acceptance criteria can be written;
- the remaining choices are low-risk implementation details.

## Important rule

**Do not** use grilling to compensate for poor repository inspection.

If the codebase already answers a question, inspect it instead of asking the user.
