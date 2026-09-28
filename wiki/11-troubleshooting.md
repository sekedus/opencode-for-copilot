# Troubleshooting

## Agent edits code when I only asked a question

Expected rule:

```text
question/review -> inspect and report
implementation request -> edit
```

If it edits anyway:

1. stop the agent;
2. inspect `git diff`;
3. revert or retain the change deliberately;
4. reinforce the execution boundary in project instructions if the request exposed a missing case.

**Do not** let one incident become a reason to add dozens of prompt rules.

## Agent asks too many questions

Check whether the agent is:

- asking about facts already present in the repository;
- asking low-risk implementation choices;
- grilling trivial changes.

The correct behavior is:

```text
inspect first
-> infer safe decisions
-> ask only high-value questions
```

## Agent changes too much at once

Check task scope.

A useful task should have:

- objective;
- in-scope items;
- out-of-scope items;
- acceptance criteria;
- verification.

For very large work, route through `/wayfinder`.

## Agent repeats work after context failure

**Do not** trust the last chat message.

Run the recovery protocol:

```text
dev/now.md
-> current task
-> git status
-> git diff
-> tests
-> reconcile
```

Then continue only from the actual repository state.

## Code becomes increasingly long after several prompts

This usually indicates a planning-horizon problem rather than simply poor coding ability.

Try:

```text
pause implementation
-> review current architecture
-> consolidate duplication
-> define the intended end state
-> continue
```

Use `/code-review` for the diff and `/improve-codebase-architecture` when the problem spans the codebase.

## Explanations are too long or too cryptic

Say:

```text
I don't understand.
```

or explicitly invoke `/wait-what`.

The global user preferences should already favor short, plain explanations.

## UI looks generic

Use a design skill before implementation, not only after the UI already exists.

Then use a review skill after implementation.

Recommended route:

```text
design direction
-> implementation
-> frontend-design-review
-> Playwright/browser verification
```

## Security review is shallow

**Do not** ask the general coding model to "make it secure" and stop there.

Route sensitive areas to targeted security skills and provide actual runtime/tool evidence when possible.

## Context reaches the danger zone

Stop adding more context.

Instead:

```text
finish bounded unit
-> verify
-> update now.md
-> handoff
-> new session
```

## Skill cannot be found

Check:

```bash
npx skills list --global
```

Then verify the skill exists under:

```text
%USERPROFILE%\.agents\skills\<skill-name>
```

Also check that your agent actually supports the skill location being used.

## A skill suddenly behaves differently

Skill repositories can evolve.

Record important project dependencies on skill behavior in project docs if the behavior is critical. Update deliberately rather than blindly in the middle of a critical task.


## Security skill seems wrong

**Do not** guess from a skill name. Open `dev/security.md` and classify the changed attack surface first.

Use:

```text
project type
-> trust boundary
-> attack surface
-> security domain
-> targeted skill
```

For example:

```text
OAuth login -> identity/OAuth testing
REST API   -> API security / authorization
Mobile app -> mobile application security
Kubernetes -> container/Kubernetes/cloud security
RAG app    -> AI/RAG/prompt-injection security
```

If the project crosses several domains, select one primary assessment workflow and only the targeted secondary checks that match the changed surfaces.

## A skill ran, but its workflow was incomplete

A common cause is a missing child skill. `grill-with-docs`, for example, explicitly calls both `grilling` and `domain-modeling`. The upstream docs warn that a missing child can make the model improvise the interview rather than execute the intended primitive.

Symptoms include: all questions arriving in one batch, missing `CONTEXT.md` updates, or a result that looks plausible but lacks the expected behavior of the parent workflow.

Fix:

1. Read `dev/skill-dependencies.md`.
2. Verify the child skills are installed.
3. Reload the harness if it caches skill discovery.
4. Re-run the parent skill.
5. Do not replace the child skill with an improvised prompt unless the user explicitly chooses a fallback.
