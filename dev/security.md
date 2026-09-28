# Project Security Profile

This file maps the project's actual attack surface to the security workflows that should be used.
It is intentionally project-specific. Do not copy an entire security catalog into the project.

## 1. Project Security Classification

Mark only what applies:

- [ ] Public web application
- [ ] REST API
- [ ] GraphQL API
- [ ] Authentication / authorization / sessions
- [ ] OAuth 2.0 / OpenID Connect / SSO
- [ ] JWT
- [ ] Payments / financial data
- [ ] File upload / file processing
- [ ] User-generated content / rich text / HTML
- [ ] Sensitive or regulated data
- [ ] Secrets / API keys
- [ ] Database exposed to untrusted input
- [ ] Server-side network access / SSRF-sensitive features
- [ ] Cloud infrastructure
- [ ] Containers
- [ ] Kubernetes
- [ ] CI/CD or software supply chain
- [ ] Mobile application
- [ ] Desktop / endpoint application
- [ ] Network infrastructure
- [ ] LLM / AI application
- [ ] RAG / vector database
- [ ] MCP / agent tooling
- [ ] Cryptography / key management
- [ ] Other: ...

## 2. Primary Attack Surface

Describe the most important trust boundaries:

- Untrusted users:
- Public endpoints:
- Authentication boundary:
- Authorization boundary:
- Sensitive data:
- External services:
- Files / parsing:
- Network egress:
- Deployment/infrastructure:

## 3. Security Skill Routing

Choose skills from the installed security library based on the checked attack surfaces.

### Web application

Typical concerns:
- authentication
- authorization / IDOR
- session management
- input validation
- XSS
- CSRF
- SSRF
- file upload
- business logic

Typical skills:
- `performing-web-application-penetration-test`
- `performing-web-application-vulnerability-triage`
- targeted XSS / SSRF / CSRF / file-upload skills as needed

### API

Typical concerns:
- broken object-level authorization
- authentication
- rate limiting
- schema validation
- sensitive data exposure
- GraphQL-specific exposure

Typical skills:
- API security skills
- targeted REST/GraphQL authorization and input-validation skills
- `performing-web-application-vulnerability-triage` when findings come from scanners

### OAuth / OIDC / SSO / JWT

Typical concerns:
- redirect URI validation
- state / nonce handling
- PKCE
- token leakage
- token validation
- scope escalation
- algorithm confusion
- session binding

Typical skills:
- OAuth/OIDC implementation testing
- JWT security testing
- open-redirect testing
- targeted identity/access-management skills

### Mobile

Typical concerns:
- insecure local storage
- transport security
- platform permissions
- mobile API authentication
- client-side secrets

Typical skills:
- `conducting-mobile-app-penetration-test`
- `testing-mobile-api-authentication`
- mobile traffic interception skills when required

### Cloud / containers / Kubernetes

Typical concerns:
- IAM
- public exposure
- secrets
- network policies
- workload identity
- image/configuration security

Typical skills:
- cloud-security skills for the actual provider
- container-security skills
- Kubernetes-specific hardening/testing skills when Kubernetes is actually used

### CI/CD / supply chain

Typical concerns:
- dependency confusion / typosquatting
- secret leakage
- unsigned artifacts
- compromised CI runners
- insecure workflows

Typical skills:
- DevSecOps skills
- supply-chain security skills
- SAST / dependency / SBOM tooling skills

### AI / LLM / RAG / MCP

Typical concerns:
- prompt injection
- indirect prompt injection
- tool abuse
- data exfiltration
- system prompt leakage
- insecure MCP/tool permissions

Typical skills:
- AI-security skills
- prompt-injection testing
- RAG security testing
- MCP/agent security skills

## 4. Selection Rule

**Do not** ask:

> "Which security skill should I use?"

until the project attack surface has been classified.

Use this sequence:

```text
Project type
    -> trust boundaries
    -> attack surface
    -> security domain
    -> primary assessment skill
    -> targeted tests
    -> evidence
```

Prefer one primary assessment workflow plus a small number of targeted tests.
**Do not** invoke a broad penetration-testing workflow when a focused check is sufficient.

## 5. Security Gate Levels

### Level 0 — Low Risk

No meaningful security boundary changed.

Action:
- normal verification only

### Level 1 — Security-Relevant

A security-sensitive component changed, but exposure is limited.

Action:
- targeted security review
- relevant regression tests

### Level 2 — High Risk

Examples:
- authentication
- authorization
- payment
- sensitive data
- file processing
- externally reachable service

Action:
- targeted security skill(s)
- behavioral tests
- failure/abuse-case tests
- code review

### Level 3 — Security Assessment

Examples:
- pre-release security assessment
- major attack-surface expansion
- suspected vulnerability
- explicit penetration test

Action:
- dedicated security assessment workflow
- runtime testing where possible
- findings triage
- remediation verification

## 6. Evidence

Record:

```text
Security level:
Attack surface:
Skills/workflows used:
Tools/tests executed:
Findings:
Remaining uncertainty:
```

A security review with no findings is not equivalent to proof that the system is secure.
