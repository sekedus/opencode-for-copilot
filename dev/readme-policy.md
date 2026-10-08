# Root README Policy

The root `README.md` is the project's **human-facing orientation document**. It is not a task diary, implementation log, or agent memory dump.

## Readability Rules

Keep it easy to scan:

- use clear headings;
- keep paragraphs focused on one idea;
- avoid walls of dense prose;
- use short lists when they improve scanning;
- prefer plain language over internal workflow jargon;
- link to detailed docs rather than embedding every technical detail.

A paragraph should be long enough to explain one idea and short enough to scan comfortably. Do not force arbitrary paragraph lengths.

## Purpose

A new human should be able to understand, without reading chat history:

- what the project is;
- what problem it solves;
- current important capabilities/scope;
- how to run/use it;
- important prerequisites/constraints;
- where deeper documentation lives.

## Keep History Elsewhere

`README.md` is not the release changelog. Use `CHANGELOG.md` for meaningful release-facing changes when the project maintains one.

Do not copy task-by-task history, implementation notes, every test result, or the full architecture map into the README.

## Bootstrap / Existing Project

Preserve an existing project README. For an empty/new project, create a concise human-facing README from the project's real state rather than copying the AAW template README.

## Task Completion Review

Ask internally:

> Did this task materially change what a new human needs to know about the project?

Only update the README when the answer is yes.
