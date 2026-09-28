# Skill Dependency Matrix

Adaptive Agent Workflow treats skill dependencies as part of routing.

A skill can be:

- **Parent / orchestrator** — starts a workflow and explicitly calls other skills.
- **Primitive / reference** — performs a reusable discipline or loop used by another skill.
- **Conditional dependency** — used only on a specific branch of a parent workflow.
- **Companion skill** — useful around the workflow but not required by the parent.

A parent skill is not considered ready until its required dependency closure is available to the current harness.

## Current known Matt Pocock dependency closure

| Parent | Dependency | Type |
|---|---|---|
| `grill-with-docs` | `grilling` | Hard |
| `grill-with-docs` | `domain-modeling` | Hard |
| `grill-me` | `grilling` | Hard |
| `wayfinder` | `grilling` | Hard |
| `wayfinder` | `domain-modeling` | Hard |
| `wayfinder` | `research` | Conditional |
| `wayfinder` | `prototype` | Conditional |
| `improve-codebase-architecture` | `codebase-design` | Hard |
| `improve-codebase-architecture` | `domain-modeling` | Hard |
| `improve-codebase-architecture` | `grilling` | Hard |
| `tdd` | `codebase-design` | Practical prerequisite / conditional call |

Matt's current invocation documentation distinguishes user-invoked orchestration skills from model-invoked primitives. A user-invoked skill may call model-invoked skills, but those child skills still need to be available to the harness.

The current upstream `grill-with-docs` skill explicitly says to call the Skill tool twice: once for `grilling` and once for `domain-modeling`.

The upstream documentation also warns that a missing dependency can cause the model to improvise the workflow instead of loading the real primitive.

## Recommended installation closure

For the normal Adaptive Agent Workflow, install:

```text
Core orchestration:
- grill-with-docs
- wayfinder
- improve-codebase-architecture
- handoff
- wait-what

Required primitives / references:
- grilling
- domain-modeling
- codebase-design
- prototype
- research

Engineering quality:
- tdd
- diagnosing-bugs
- code-review
```

`research` and `prototype` are conditional for Wayfinder, but installing them up front avoids discovering a missing child skill in the middle of a multi-session effort. Wayfinder currently invokes `research` for research tickets, `prototype` for prototype tickets, and `grilling` + `domain-modeling` for the default grilling ticket type.

## Minimum closures

```text
grill-with-docs
├── grilling
└── domain-modeling

tdd
└── codebase-design

improve-codebase-architecture
├── codebase-design
├── domain-modeling
└── grilling

wayfinder
├── grilling
├── domain-modeling
├── research    [conditional]
└── prototype   [conditional]
```

## Installation commands

Install the parent and known dependencies together. Do not assume a `skills` installer recursively resolves skill names mentioned inside `SKILL.md`.

### Grilling

```bash
npx skills@latest add mattpocock/skills --skill grill-with-docs --global
npx skills@latest add mattpocock/skills --skill grilling --global
npx skills@latest add mattpocock/skills --skill domain-modeling --global
```

### Wayfinder

```bash
npx skills@latest add mattpocock/skills --skill wayfinder --global
npx skills@latest add mattpocock/skills --skill grilling --global
npx skills@latest add mattpocock/skills --skill domain-modeling --global
npx skills@latest add mattpocock/skills --skill research --global
npx skills@latest add mattpocock/skills --skill prototype --global
```

### Architecture review

```bash
npx skills@latest add mattpocock/skills --skill improve-codebase-architecture --global
npx skills@latest add mattpocock/skills --skill codebase-design --global
npx skills@latest add mattpocock/skills --skill domain-modeling --global
npx skills@latest add mattpocock/skills --skill grilling --global
```

### TDD

```bash
npx skills@latest add mattpocock/skills --skill tdd --global
npx skills@latest add mattpocock/skills --skill codebase-design --global
```

The current TDD documentation explicitly routes interface/seam questions through `codebase-design`.

## Third-party skills

The same rule applies to skills outside Matt's repository.

Before relying on a third-party skill, inspect:

- its `SKILL.md`;
- explicit `Skill tool` calls;
- its README/installation instructions;
- provider-specific setup requirements;
- any companion files or scripts it requires.

### Impeccable

Impeccable currently describes itself as a standalone skill with its own launcher/engine, so it does not require another agent skill as a child dependency. It may create durable product/design files such as `PRODUCT.md` and `DESIGN.md`, which are project state rather than skill dependencies.

### Leonxlnx taste-skill

`design-taste-frontend` is a standalone install name in the Taste Skill repository. The repository contains other optional design/image skills; they are not required just to use `design-taste-frontend`.

### Cybersecurity skill packs

Treat individual security skills the same way: select the smallest useful domain-specific skill, inspect its declared prerequisites, and install its dependency closure. Do not assume the entire cybersecurity repository must be installed.

## Runtime installation versus context loading

```text
Installed globally
    !=
Loaded into every conversation
```

This distinction is intentional. The library can contain many skills without forcing every skill's instructions into the model context.

## Adaptive Agent rule

When the router selects a skill:

1. Identify the parent skill.
2. Resolve known dependencies from this matrix.
3. Verify required dependencies are installed and discoverable.
4. Invoke the parent skill.
5. Let the parent invoke its child primitives according to its upstream instructions.
6. Verify important expected side effects when the workflow finishes.
7. If a required dependency is missing, stop that specialized workflow and report the exact missing skill plus its installation command.

Do **not** silently recreate a missing skill from memory. A plausible substitute is not equivalent to the intended specialized workflow.

## Keeping this matrix current

Third-party skills evolve. This file is a maintained routing snapshot, not a universal lockfile.

When upgrading an important skill:

- inspect the current upstream `SKILL.md`;
- re-check explicit child-skill calls;
- update this matrix if the dependency closure changed;
- re-test the parent workflow before relying on it for important work.
