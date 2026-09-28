# Adaptive Agent Workflow Wiki

Complete English documentation for installing, using, recovering, and maintaining the **Adaptive Agent Workflow**.

For a new project, read [Installation](01-installation.md) and [State Integrity](16-state-integrity-and-commits.md) first.

## Start here

1. [Principles](00-principles.md)
2. [Installation](01-installation.md)
3. [Project Setup](02-project-setup.md)
4. [Daily Usage](03-daily-usage.md)
5. [Intent Routing](04-intent-routing.md)
6. [Grilling & Requirements](05-grilling-and-requirements.md)
7. [Quality Gates](06-quality-gates.md)
8. [Recovery & Handoff](07-recovery-and-handoff.md)
9. [Project State](08-project-state.md)
10. [Project Switching](09-project-switching.md)
11. [Skills](10-skills.md)
12. [Troubleshooting](11-troubleshooting.md)
13. [Examples](12-examples.md)
14. [Maintenance](13-maintenance.md)
15. [Three-Pillar Product Model](14-three-pillars.md)
16. [State Integrity, README Updates, and Commit Checkpoints](16-state-integrity-and-commits.md)

## Important distinction

The repository root `README.md` is the **template repository README**. When the workflow is installed into another project, do **not** overwrite that project's root `README.md` with the template README unless the user explicitly asks.

The `wiki/` directory is optional project documentation. Keep it in the target project when the user wants the workflow guide available locally; otherwise it can remain only in the template repository.

## Design skills

The workflow keeps multiple design options available:

- `impeccable` — primary option for shaping, critiquing, auditing, polishing, and refining frontend interfaces.
- Anthropic `frontend-design` — alternative for deliberate, distinctive frontend design and implementation.
- Leonxlnx `taste-skill` (`design-taste-frontend`) — alternative for design taste / anti-generic visual direction. It should remain available alongside `impeccable` and `frontend-design`; choose based on the project's needs rather than running all design skills together.
- Microsoft `frontend-design-review` — independent post-implementation design review.

## Security skills

Users do not need to memorize security-skill names. The workflow classifies the project's attack surface in `dev/security.md` and routes to the smallest relevant security workflow.

See [Skills](10-skills.md) and [Security / Quality Gates](06-quality-gates.md) for the routing model.

For dependency-aware installation, see [Skill Dependencies](15-skill-dependencies.md).

For state synchronization and commit checkpoints, see [State Integrity](16-state-integrity-and-commits.md).
