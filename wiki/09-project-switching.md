# Switching Projects, IDEs, Models, and Devices

## 1. Switching from Project A to Project B

When a new idea appears:

```text
Project A
   |
   +--> capture unrelated idea
   |
   +--> continue A
```

If you intentionally switch projects:

```text
Project A
   |
   v
checkpoint / handoff
   |
   v
Project B
```

**Do not** leave Project A with an unclear current state.

## 2. Returning after days or weeks

Open the repository and say:

```text
continue
```

The agent should rely on `dev/now.md`, the current task, and actual repository state rather than attempting to reconstruct the old conversation.

## 3. Switching models

**Do not** depend on transferring a giant conversation from model A to model B.

Instead:

```text
model A
-> checkpoint
-> repository state
-> model B
-> reconcile
-> continue
```

This is especially important when moving from a model with a large context window to one with a smaller window.

## 4. Switching IDEs/harnesses

The portable layer is:

```text
repository files
+ Git
+ agent skills
+ project instructions
```

IDE-specific tools belong in harness-specific instructions, not in the core workflow.

## 5. Switching devices

Before switching devices, prefer:

```text
verify
-> checkpoint
-> commit
-> push
```

Then on the next device:

```text
pull
-> read now.md
-> reconcile
-> continue
```

## 6. Avoid mental context switching

If you suddenly want to work on a different project, capture the idea first.

The point is not to forbid switching.

The point is to make switching explicit and recoverable.
