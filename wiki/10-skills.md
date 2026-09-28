# Recommended Skills

The workflow is designed around **selective activation**, not installing or invoking every skill for every task.

Your global skill location is:

```text
%USERPROFILE%\.agents\skills\
```

## Skill dependencies are part of the workflow

Some skills are orchestrators that explicitly invoke other skills. Installing only the wrapper is not enough. For example, the current `grill-with-docs` skill explicitly calls `grilling` and `domain-modeling`. The upstream documentation also warns that missing child skills can cause the model to improvise instead of running the intended workflow.

The workflow therefore resolves dependency closure before invoking a routed skill.

See [`dev/skill-dependencies.md`](../dev/skill-dependencies.md) for the complete matrix.

## 1. Core Workflow Skills

These are the recommended starting set:

| Skill | Why use it | Typical trigger |
|---|---|---|
| `grill-with-docs` | Turns unclear product/feature ideas into shared understanding | New or ambiguous requirements |
| `wayfinder` | Maps genuinely large work into bounded multi-session tasks | Large/cross-cutting work |
| `tdd` | Keeps behavioral implementation/test loops tight | Important behavior |
| `diagnosing-bugs` | Forces evidence-driven debugging | Unknown/hard bugs |
| `code-review` | Reviews implementation against standards/spec | After meaningful implementation |
| `handoff` | Preserves context across sessions/models | Context pressure/session boundary |
| `wait-what` | Re-explains confusing agent output | User does not understand an explanation |
| `improve-codebase-architecture` | Finds structural friction across the codebase | Periodic/deep architecture review |

### Example installation

Install parents **and their known dependencies**:

```bash
# Grilling
npx skills@latest add mattpocock/skills --skill grill-with-docs --global
npx skills@latest add mattpocock/skills --skill grilling --global
npx skills@latest add mattpocock/skills --skill domain-modeling --global

# Large-work planning
npx skills@latest add mattpocock/skills --skill wayfinder --global
npx skills@latest add mattpocock/skills --skill research --global
npx skills@latest add mattpocock/skills --skill prototype --global

# Implementation / quality
npx skills@latest add mattpocock/skills --skill tdd --global
npx skills@latest add mattpocock/skills --skill codebase-design --global
npx skills@latest add mattpocock/skills --skill diagnosing-bugs --global
npx skills@latest add mattpocock/skills --skill code-review --global

# Session / understanding
npx skills@latest add mattpocock/skills --skill handoff --global
npx skills@latest add mattpocock/skills --skill wait-what --global

# Architecture review
npx skills@latest add mattpocock/skills --skill improve-codebase-architecture --global
```

**Do not** assume that a `skills` installer recursively installs a child skill named inside `SKILL.md`. Resolve dependencies explicitly.

## 2. Design Skills

### `impeccable` — recommended

Install **Impeccable** for frontend design work. The upstream project provides an Agents Skills-compatible workflow for design critique, audit, polish, refinement, and anti-generic design work. [Upstream repository](https://github.com/pbakaus/impeccable)

Preferred global installation for this workflow:

```bash
npx skills@latest add pbakaus/impeccable --skill impeccable --global
```

If you use the upstream installer directly instead, follow the repository's current `npx impeccable install` flow. Do not use both installers for the same global copy unless you intentionally want separate installations.

Use it for:

- new frontend direction;
- redesigns;
- visual critique;
- UX/UI audits;
- polishing an existing interface;
- eliminating generic AI-generated visual patterns;
- responsive/accessibility/design-system refinement.

### Leonxlnx `taste-skill` (`design-taste-frontend`) — alternative

Keep **Leonxlnx `taste-skill`** as a design option alongside `impeccable` and Anthropic `frontend-design`. Its `design-taste-frontend` skill is useful when you want stronger visual direction, anti-generic design guidance, and a more opinionated design-taste pass.

```bash
npx skills@latest add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend --global
```

**Do not** automatically run all three design systems on the same task; choose the smallest combination that gives useful signal.

Use this routing as a default:

```text
new / redesign-heavy UI
    -> impeccable OR frontend-design OR taste-skill

visual concept needs a stronger taste pass
    -> taste-skill

existing UI needs critique / polish
    -> impeccable

implemented UI needs independent review
    -> frontend-design-review
```

### Anthropic `frontend-design`

Use for deliberate, distinctive frontend creation when you want the Anthropic design workflow.

```bash
npx skills@latest add anthropics/skills --skill frontend-design --global
```

**Do not** automatically run both `impeccable` and `frontend-design` for every UI task. Choose the skill that fits the design phase.

### Microsoft `frontend-design-review`

Use as a post-implementation design review when you need systematic checks for design quality, accessibility, responsive behavior, theme behavior, and design-system compliance.

```bash
npx skills@latest add microsoft/skills --skill frontend-design-review --global
```

### Design routing

Prefer:

```text
new/ambitious UI
    -> impeccable OR frontend-design

existing UI needs critique/polish
    -> impeccable

implemented UI needs independent quality review
    -> frontend-design-review

browser interaction/responsive verification
    -> Playwright
```

`impeccable` is particularly useful for the user's **Desirable & Distinctive** pillar.

## 3. Browser / E2E Skills

For web applications, Playwright is strongly recommended when real browser behavior matters.

Typical uses:

- authentication flows;
- form behavior;
- navigation;
- responsive layout;
- loading/error/empty states;
- repeated interactions;
- browser regression testing.

The Playwright CLI provides an Agents Skills installation path into `.agents/skills`.

Example:

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills=agents -g
```

Prefer the project's local Playwright version when the repository already pins one.

## 4. Security Skills: Do Not Guess From Skill Names

The security library is intentionally huge. The current `mukul975/Anthropic-Cybersecurity-Skills` repository reports **817 skills across 34 security domains** on its current main branch. It includes web application security, API security, cloud security, mobile security, container security, DevSecOps, AI security, identity/access management, and many other domains.

Source: [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills)

You do **not** need to know which one to use from memory.

Use the project's `dev/security.md` as the routing layer.

### Security selection process

```text
1. Identify the project type.
2. Identify trust boundaries.
3. Identify the attack surface that changed.
4. Map the attack surface to a security domain.
5. Choose one primary assessment workflow.
6. Add only targeted skills for specific risks.
7. Run actual tests/tools where possible.
8. Record evidence and remaining uncertainty.
```

### Security routing matrix

| Project / changed area | Start with | Add targeted checks when relevant |
|---|---|---|
| Public web application | Web application security / OWASP WSTG-style testing | XSS, CSRF, SSRF, file upload, business logic |
| REST / GraphQL API | API security | BOLA/IDOR, authz, schema/input validation, sensitive data |
| OAuth / OIDC / SSO | Identity + OAuth-specific testing | redirect URI, state/nonce, PKCE, token leakage, scope escalation |
| JWT | JWT security testing | algorithm confusion, claim validation, key handling |
| Mobile app | Mobile application penetration testing | mobile API auth, storage, transport, platform controls |
| Cloud deployment | Cloud security for the actual provider | IAM, secrets, network exposure, storage permissions |
| Kubernetes | Kubernetes/container security | RBAC, network policies, workload identity, image/admission controls |
| CI/CD / package supply chain | DevSecOps + supply-chain security | secrets, SBOM, signing, dependency confusion/typosquatting |
| LLM / RAG / MCP | AI security | prompt injection, indirect injection, tool abuse, data exfiltration |
| Sensitive data | Data protection / sensitive-data exposure | API keys, PII, logs, storage, transmission |
| Network infrastructure | Network security | segmentation, exposed services, authentication |
| Cryptography / key management | Cryptography security | key lifecycle, algorithms, storage, rotation |

The repository itself documents security subdomains such as web-application-security, cloud-security, container-security, API-security, mobile-security, IAM, cryptography, DevSecOps, AI security, and others. Use those domain labels to narrow discovery rather than browsing hundreds of unrelated skills.

### Practical discovery

If the exact skill is unknown:

```bash
npx skills find security
npx skills find oauth
npx skills find api-security
npx skills find kubernetes-security
npx skills find mobile-security
```

Then filter the results against `dev/security.md`.

### Targeted examples

For a web application:

```bash
npx skills@latest add mukul975/Anthropic-Cybersecurity-Skills --skill performing-web-application-penetration-test --global
```

For vulnerability-finding triage:

```bash
npx skills@latest add mukul975/Anthropic-Cybersecurity-Skills --skill performing-web-application-vulnerability-triage --global
```

For mobile:

```bash
npx skills@latest add mukul975/Anthropic-Cybersecurity-Skills --skill conducting-mobile-app-penetration-test --global
```

For other domains, use `dev/security.md` and `npx skills find ...` rather than copying a random skill because its name sounds close.

## 5. Security Is a Routing Problem, Not a Memory Test

The goal is not:

> "The user must memorize 817 skill names."

The goal is:

```text
project
  -> security profile
  -> attack surface
  -> security domain
  -> targeted skill
```

That makes security usable even for a user who is not a security specialist.

## 6. Recommended Starting Set

If the immediate goal is to keep the global skill installation small:

```text
Core:
- grill-with-docs
- wayfinder
- tdd
- diagnosing-bugs
- code-review
- handoff
- wait-what
- improve-codebase-architecture

Design:
- impeccable
- frontend-design-review

Browser:
- Playwright CLI skill

Security:
- do NOT install the entire catalog initially
- install targeted security skills after classifying the project
```

## 7. Skill Update Policy

**Do not** update a large skill collection in the middle of a critical implementation without checking what changed.

Prefer:

```text
finish/verify current work
-> update selected skill
-> verify the skill still behaves as expected
-> continue
```
