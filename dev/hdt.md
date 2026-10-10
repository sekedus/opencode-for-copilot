# Human Development Test (HDT)

HDT is a human-run verification gate for behavior that automated checks cannot fully prove. It is separate from automated tests, linting, type checks, compilation, and packaging.

## Decide Whether HDT Is Required

Read the project's `dev/verification.md` first. Set the effective task field to `REQUIRED` or `NOT_REQUIRED` and record a short reason. Do not leave the decision implied or contradictory.

HDT is normally `REQUIRED` when a change depends on behavior in a real UI, VS Code/browser/IDE host, external integration, permissions/dialogs, lifecycle, or another runtime that the automated suite does not cover. It is also required when the project verification contract says so. For example, if the project verification matrix requires Extension Development Host (EDH) runtime checks for session-related changes, a session mapping/eviction change must use EDH even when unit tests cover the helper functions.

A large diff or line count alone does not prove that HDT is necessary. Use it as a signal to inspect the change's reach and risk; decide from behavior, integration boundaries, and the project's verification contract. Conversely, do not mark HDT `NOT_REQUIRED` merely because a helper has unit tests when the overall behavior crosses a runtime/integration boundary.

HDT is normally `NOT_REQUIRED` for docs-only, typo-only, formatting-only, internal-only, or purely mechanical/toolchain changes when the agent has run the applicable automated checks successfully and the project contract says those checks are sufficient. A dependency upgrade is not automatically safe just because installation succeeds: run the relevant type-check/lint/test/build checks and assess whether runtime behavior changed.

## Required Lifecycle

```text
implementation
  -> agent runs applicable automated checks
  -> decide HDT requirement
  -> NOT_REQUIRED: record evidence, mark COMPLETE, move to done/, then commit checkpoint
  -> REQUIRED: set AWAITING_HDT; keep task active; provide manual/runtime steps
  -> user reports observations
  -> PASS: record evidence, mark COMPLETE, move to done/, then commit checkpoint
  -> FAIL/unclear: keep task active; investigate/fix or request missing evidence; repeat relevant test
```

A required-HDT task must not be marked `COMPLETE`, moved into a `done/` folder, or offered the normal completed-task commit checkpoint while HDT is pending or failed. The active task remains the current task in `dev/now.md`. If the user declines a required HDT, set HDT status to `DECLINED`, record the gap, and leave the task active as `AWAITING_HDT` (or `BLOCKED` if an actual blocker prevents testing). Do not silently waive the gate or repeatedly ask the same question in every response. An explicitly requested partial checkpoint commit does not change task completion or verification status.

## Automated Verification Is Agent-Owned

Run available automated checks yourself and report which commands ran and their actual results. If `npm test`, `npm run lint`, type checks, compilation, packaging, or equivalent checks already passed in the current worktree, do not ask the user to rerun those same commands. Reporting the commands/results is enough.

If an applicable check cannot be executed, mark it unverified and explain the specific blocker. Ask the user to run it only when their environment or access is genuinely required; that request is not an HDT unless it tests human/runtime behavior. Never claim `TESTED` or `VERIFIED` for a check that was not actually executed or otherwise supported by evidence.

## User-Facing Report Contract

Use one of these two forms; do not mix them.

**Automated-only (`NOT_REQUIRED`):**

```text
Automated verification (run by agent):
- npm run lint — PASS
- npm test — PASS (159/159)
- npm run compile — PASS

HDT: NOT_REQUIRED — the project verification contract says these checks cover this toolchain-only change.
Task: COMPLETE; moved to done/.
[Offer/perform commit according to policy.]
```

Do not append "How to verify" instructions asking the user to rerun the same commands.

**Human/runtime gate (`REQUIRED`):**

```text
Automated verification (run by agent):
- npm run lint — PASS
- npm test — PASS
- npm run compile — PASS

HDT: REQUIRED — AWAITING_HDT
Task remains active; it is not COMPLETE and has not moved to done/.
[Give only the concrete manual/runtime steps and expected behavior.]
[Do not offer the normal completion commit checkpoint yet.]
```

Replace example command outcomes with the actual checks and results. Never claim PASS for a check not actually executed.

## Test Instructions

Keep human instructions beginner-friendly and concrete:

1. What to open/run.
2. What action to take.
3. What result to expect.
4. What information to report if the result differs.

Do not make the user translate internal implementation details into a test plan. Ask once, then wait for the report rather than presenting competing status claims or offering to commit before the gate passes. Never label HDT `NOT_REQUIRED` and then give the user manual steps to verify the same behavior as if those steps were still pending.

## Report Handling

Treat the user's report as evidence, not as an unconditional status command.

- Clear PASS evidence completes the HDT gate.
- Clear FAIL evidence requires investigation/fix and another relevant verification step.
- Incomplete or ambiguous evidence requires one targeted follow-up.
