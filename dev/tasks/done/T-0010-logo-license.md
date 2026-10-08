# T-0010 — Extension logo, icon & LICENSE

## Status

COMPLETE (verified 2026-10-03: manifest icon + MIT license + VSIX contents
+ README license section)

## Objective

Brand the extension with the project logo (`logo-opencode-for-copilot.png`,
1024x1024) as the manifest icon, add the missing MIT `LICENSE` file, and
note the license in the README.

## Why

User request 2026-10-03: OCT logo for the marketplace/explorer icon, plus
the MIT license file (`package.json` declares MIT but no file existed —
the deferred known issue from T-0009).

## In Scope

- `assets/logo-opencode-for-copilot.png` (extension icon, PNG export).
- `assets/logo-opencode-for-copilot.svg` (vector source).
- `package.json` `icon` field pointing at the PNG.
- `LICENSE` (MIT, `Copyright (c) 2026 sekedus` — matches manifest
  publisher and git author).
- README license section at the bottom.

## Out of Scope

- Marketplace publish.
- Icon redesign/resizing variants (1024px PNG scales fine; add sizes only
  if a store/pass demands them).
- Publisher rename (`oct` → `sekedus` in `package.json`): user-made
  directly 2026-10-03, recorded here only. Command/vendor IDs (`oct.*`)
  are unaffected (marketplace namespace ≠ command namespace).

## Dependencies / Inputs

- Source art: `assets/logo-opencode-for-copilot.svg` (Inkscape, 2026-10-03)
- `.vscodeignore` already allows `assets/` (no exclusion entry), so no packaging change needed.
- T-0009 known-issues entry (the deferred LICENSE warning).

## Allowed Product Files / Areas

- `assets/`
- `LICENSE`
- `package.json` (`icon` field only)

## State Synchronization Files

- `dev/tasks/T-0010-*.md`
- `dev/roadmap.md`
- `dev/now.md`
- `README.md`

## Acceptance Criteria

- [x] `assets/logo-opencode-for-copilot.png` (+ `.svg` source) exist in git.
- [x] `package.json` declares `"icon": "assets/logo-opencode-for-copilot.png"` and the path resolves.
- [x] README ends with a license section pointing at `LICENSE`.
- [x] `LICENSE` exists in git with complete MIT text.
- [x] `npx tsc --noEmit -p ./` exits 0 (manifest-only change, no TS impact).
- [x] `npx vsce ls` lists both assets + `LICENSE` (packaged, not ignored).
- [x] `npm run package` exits 0 with no `LICENSE not found` warning.

## Implementation Notes

- `assets/` holds the PNG icon (1024x1024, 7.6 KB export) plus its Inkscape
  SVG source; VS Code/marketplace downscale the PNG.
- Icon path is relative (`assets/logo-opencode-for-copilot.png`), the
  `vsce`-expected form (PNG, not SVG).
- `vsce` ships the license as `LICENSE.txt` in the VSIX automatically.

## Verification

Commands:

```text
node -e "require('./package.json').icon + exists check"
npx tsc --noEmit -p ./
npx vsce ls
npm run package
```

Expected result: icon field resolves to an existing file; tsc exit 0;
`vsce ls` contains `assets/logo-opencode-for-copilot.png` (+ `.svg`) and
`LICENSE`; package exits 0, warning gone (21 files, 59.01 KB).

## Current Progress

- [x] Art in `assets/` (PNG + SVG source, 2026-10-03)
- [x] `package.json` icon field (2026-10-03)
- [x] README license section at the bottom (2026-10-03)
- [x] `LICENSE` added (2026-10-03)
- [x] Verification: tsc 0 + vsce lists assets + package clean (2026-10-03)

## Evidence

- Implementation: IMPLEMENTED (`assets/logo-*.png` 7784 bytes + `.svg` source;
  `package.json` icon field; `LICENSE` 1064 bytes MIT; README license section).
- Tests: VERIFIED (`npx tsc --noEmit -p ./` exit 0, 2026-10-03; no TS
  surface touched — manifest/README only, `npm test` unaffected).
- Runtime/manual verification: VERIFIED (`npx vsce ls` lists both assets +
  `LICENSE`; `npm run package` → 21 files, 59.01 KB, no LICENSE warning).

## Known Issues / Blockers

- None.

## README Impact

License section at the bottom.

## Commit Checkpoint

Suggested commit message:

```text
feat: add extension logo, icon, and MIT license
```

Commit status:

```text
COMMITTED (ad25133)
```

## Handoff Notes

T-0010 done standalone; M2 still closed. No active task after this.
Standing OPEN: EDH redo (image workspace) + Steps 3–8.
