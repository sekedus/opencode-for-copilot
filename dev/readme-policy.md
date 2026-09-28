# Root README Policy

The root `README.md` is the project's human-facing orientation document. It is separate from the Adaptive Agent Workflow template's agent-facing README.

## Purpose

The project README should let a new human understand the repository without reading the entire codebase or chat history.

At minimum, keep the following current when known:

- project name and purpose;
- problem being solved;
- current scope or important capabilities;
- high-level architecture/workflow when it materially helps understanding;
- setup/run instructions;
- important prerequisites or constraints.

## Empty / New Project Bootstrap

When installing the workflow into an empty or genuinely new project:

1. Create a user-facing `README.md` in the target project.
2. Do not copy the template repository's root README verbatim because it contains agent/template documentation.
3. Start with the project's actual state, even if that means a concise `Project is being defined` section.
4. Update it after project discovery when the project purpose, stack, or initial scope becomes known.
5. Offer an `Initial commit` after the README and workflow state are validated.

## Existing Project

Preserve the existing README. Update it only when the workflow or task introduces information that materially helps a new human understand or use the project.

## Task Completion Review

After a task completes, ask internally:

> Did this task change what a new human needs to know about the project?

Update the README only when the answer is yes.

Typical README-worthy changes:

- user-visible feature completed;
- changed setup/install flow;
- changed architecture or major integration;
- changed runtime/browser baseline;
- changed important operational workflow;
- changed project scope.

Usually not README-worthy:

- internal refactor with no behavior change;
- typo fix;
- test-only changes;
- minor internal bug fix;
- routine dependency maintenance with no user impact.

## Keep It Concise

The README is not a changelog and not a task diary.

**Do not** copy implementation logs, every task, every ADR, or every test result into the README.
