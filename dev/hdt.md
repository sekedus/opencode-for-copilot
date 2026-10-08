# Human Development Test (HDT)

HDT is an optional human/runtime verification gate for changes that automated checks cannot fully prove.

## When HDT Is Appropriate

Use HDT when the change depends on real user interaction, a browser/extension/IDE runtime, external integration behavior, or another condition that automated checks do not fully reproduce.

Examples:

- user-visible UI behavior;
- VS Code / browser extension runtime behavior;
- interactive workflows;
- permissions, dialogs, or host-environment behavior;
- integration behavior that requires a real environment.

HDT is normally unnecessary for docs-only, typo-only, formatting-only, internal-only, or purely mechanical changes when project checks are sufficient.

## HDT Flow

```text
implementation
    -> automated verification
    -> classify HDT need
    -> ask user once when HDT is recommended
    -> provide short beginner-friendly test steps
    -> user reports observations
    -> agent evaluates the report
    -> PASS -> commit checkpoint
    -> FAIL / unclear -> investigate or ask for missing evidence
```

A user declining HDT does not automatically make a task `VERIFIED`; evidence labels must still match the project verification contract.

## Test Instructions

Keep instructions human-friendly:

1. What to open/run.
2. What action to take.
3. What result to expect.
4. What to report if the result differs.

Do not make the user translate internal implementation details into a test plan.

## Report Handling

Treat the user's report as evidence, not as a status command.

- Clear PASS evidence may complete the HDT gate.
- Clear FAIL evidence requires investigation/fix and another relevant verification step.
- Incomplete or ambiguous evidence requires a targeted follow-up request.
