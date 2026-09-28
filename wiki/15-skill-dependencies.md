# Skill Dependencies

Adaptive Agent Workflow is dependency-aware. A skill that looks like one command can be an orchestrator that explicitly invokes one or more other skills.

## Example: `/grill-with-docs`

The current upstream skill is effectively:

```text
grill-with-docs
├── grilling
└── domain-modeling
```

Its `SKILL.md` explicitly calls both child skills, and the upstream documentation warns that missing dependencies can lead to an improvised interview.

## Known closures

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

Wayfinder's current skill definition also invokes `research` for research tickets and `prototype` for prototype tickets.

## Rule for Adaptive Agent Workflow

```text
select parent
    ↓
resolve closure
    ↓
verify installed
    ↓
invoke parent
    ↓
verify expected result
```

A missing dependency is a workflow failure, not an invitation for the model to improvise a replacement.

## Full matrix

See `dev/skill-dependencies.md` for installation commands and the maintenance policy.
