# T-0009 — VSIX packaging (local install artifact)

## Status

COMPLETE (verified 2026-10-02: artifact + user-run install proof; M2 complete)

## Objective

Produce a local-installable `.vsix` of the OCT extension (`vsce package`)
with exactly the runtime files (`out/`, `plugin/`, manifest, README) and no
dev/test sources, and prove it installs cleanly.

## Why

M2's last item. The deployment constraint is local VSIX first; everything to
date has run from source via F5. A packaged artifact is the handoff to real
usage and catches manifest/packaging errors EDH never sees.

## In Scope

- `@vscode/vsce` as a pinned devDependency + `package` script.
- `.vscodeignore` (exclude `src/`, `test/`, `out-test/`, `dev/`, configs,
  maps? keep `out/**/*.js` + `plugin/` + manifest + README/LICENCE).
- `npm run package` green; artifact contents verified (file list + size).
- Install proof: `code --install-extension <vsix>` succeeds (human step in
  the live IDE — the agent verifies the artifact, the user runs install).
- `dev/project.md` build-tools line if it changes meaningfully (tsc stays;
  no bundler switch in this task).

## Out of Scope

- Marketplace publish (explicitly out of MVP scope).
- esbuild migration (planned in project.md, separate decision).
- Icon/branding assets (add only if `vsce` demands them — it doesn't).
- Re-verifying chat behavior inside the installed VSIX (EDH already covers
  function; install + activation is the gate here).

## Dependencies / Inputs

- `package.json` (manifest must already satisfy `vsce`: publisher, version,
  engines, main, contributes — all present).
- `dev/constraints.md` (local VSIX first; Git Bash shell notes).
- `.gitignore` already excludes `*.vsix` (artifacts stay out of git).

## Allowed Product Files / Areas

- `package.json` (devDep + script)
- `package-lock.json` (lock update from the vsce install)
- `.vscodeignore` (new)
- `test/` only if packaging needs a contents assertion (prefer manual `vsce ls`)

## State Synchronization Files

- `dev/tasks/T-0009-*.md`
- `dev/roadmap.md`
- `dev/now.md`
- `README.md` only if install instructions change (setup section covers F5;
  add VSIX line if warranted)

## Acceptance Criteria

- [x] `npm run package` exits 0 and writes `opencode-for-copilot-0.1.0.vsix`.
- [x] Artifact contains `out/` JS + `plugin/oct-tools` + manifest, and none
  of `src/`, `test/`, `dev/`, `out-test/` (verified via listing).
- [x] `code --install-extension` succeeds on the artifact (user-run).
- [x] `npx tsc --noEmit -p ./` + `npm test` still green (packaging changed
  no product code).

## Implementation Notes

- No runtime `dependencies` exist (only `@types/*` + `typescript` devDeps),
  so the vsix needs no bundled `node_modules`.
- Keep `out/*.js.map`? Source maps aid diagnostics; decide at packaging
  time (small size either way).
- Version stays `0.1.0` (local artifact, not a release).

## Verification

Commands:

```text
npm run package
npx @vscode/vsce ls
npm test
npx tsc --noEmit -p ./
```

Plus user-run: `code --install-extension opencode-for-copilot-0.1.0.vsix`.

Expected result: installable local artifact; tree clean except task/roadmap/now.md (+ manifest lockfile) bookkeeping; `.vsix` untracked by `.gitignore`.

## Current Progress

- [x] Task scoped (2026-10-02)
- [x] vsce devDep (`@vscode/vsce@4.0.0`) + `package` script
- [x] .vscodeignore (refreshed: `test/`, `out-test/`, `.github/`, lockfile, maps, `*.vsix`) + contents verification
- [x] Install proof (user-run 2026-10-02: installed, status/picker/turn verified)
- [x] Regression (`tsc` + `npm test` 32/32 green) + docs sync

## Evidence

- Implementation: IMPLEMENTED (`npm run package` → `opencode-for-copilot-0.1.0.vsix`, 18 files, 48.51 KB: manifest + `package.json` + `readme.md` + `out/**/*.js` (no maps) + `plugin/oct-tools/index.js`; no `src/`/`test/`/`dev/`/`out-test/`)
- Tests: VERIFIED (`npm test` 32/32 green post-packaging; `tsc --noEmit` exit 0)
- Runtime/manual verification: VERIFIED (user-run install 2026-10-02: install → reload → status/picker/turn all pass)

## Known Issues / Blockers

- `vsce package` warns `LICENSE not found` (warning only; `package.json`
  declares MIT with no license file). Left as-is; add a `LICENSE` file only
  if distribution needs it.
- Install proof is user-run (installing into the live IDE is
  environment-affecting, so the agent stops at the verified artifact).

## README Impact

One line if VSIX install becomes the documented path (setup section is
F5-first today).

## Commit Checkpoint

Suggested commit message:

```text
chore: package local VSIX artifact
```

Commit status:

```text
UNCOMMITTED
```

## Handoff Notes

After this task M2 is complete (tool bridge, titles/sync, tests, VSIX).
Standing OPEN: EDH redo with image workspace + Steps 3–8.
