# Changelog Policy

`CHANGELOG.md` is optional for target projects. It is recommended for projects with releases, external users, plugins/extensions, libraries, or meaningful user-visible version history.

If the project maintains a changelog, prefer [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and keep it human-facing.

## Purpose

A changelog answers:

> What meaningful changes should a human know about between releases?

It is not:

- a task diary;
- a commit dump;
- a debugging log;
- a copy of every test result.

## When to Update

Add an entry under `Unreleased` when a completed change is meaningfully release-facing, such as:

- new user-visible capability;
- changed user-visible behavior;
- important compatibility/support change;
- deprecation/removal;
- meaningful bug/security fix.

Do not add entries for every typo, internal refactor, test-only change, or workflow bookkeeping update.

## Format

Prefer the Keep a Changelog categories when useful:

```markdown
# Changelog

## [Unreleased]

### Added

### Changed

### Fixed

## [1.2.3] - YYYY-MM-DD

### Added
- ...
```

Do not update a project changelog merely because AAW itself changed. Update it when the target project's own release-facing history changed.
