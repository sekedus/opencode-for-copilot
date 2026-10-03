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
- [x] Secrets / API keys (opencode server password; engine's own provider keys stay in engine)
- [ ] Database exposed to untrusted input
- [x] Server-side network access / SSRF-sensitive features (explicit `oct.opencodeUrl` override only)
- [ ] Cloud infrastructure
- [ ] Containers
- [ ] Kubernetes
- [ ] CI/CD or software supply chain
- [ ] Mobile application
- [x] Desktop / endpoint application (VS Code extension host)
- [ ] Network infrastructure
- [x] LLM / AI application (chat bridge with Copilot tool execution via the bridge + engine-native approvals)
- [ ] RAG / vector database
- [x] MCP / agent tooling (Copilot tools via bundled `oct-tools` plugin + shuttle loop; engine `permission.asked/reply` approvals with default-deny)
- [ ] Cryptography / key management
- [ ] Other: ...

## 2. Primary Attack Surface

Describe the most important trust boundaries:

- Untrusted users: local VS Code user only (no multi-user; extension host trusts workspace content as usual). Engine tool output and Copilot tool results are untrusted input to the other side (prompt-injection / tool-abuse boundary).
- Public endpoints: none. Engine binds loopback `127.0.0.1` by default; the extension itself listens on a loopback-only ephemeral callback (`127.0.0.1`, random port) for the tool shuttle, guarded by a bearer token (`OCT_CALLBACK_TOKEN` / `oct.callbackToken`); 1 MB body cap.
- Authentication boundary: opencode server password (`OPENCODE_SERVER_PASSWORD` / Basic `opencode:<password>`); callback bearer token (managed mode: per-window random; external mode: user-configured stable token); external URL override is explicit opt-in.
- Authorization boundary: session IDs are per-conversation secrets persisted in `globalState` (`oct.conversationSessions.v1`); never expose across conversations. The callback token authorizes plugin → extension posts only.
- Sensitive data: chat text, tool inputs/outputs, workspace paths, server password, callback token. Never log password/token/headers/content; tool-shuttle logs record names/sizes only; approval decisions log action + resources only.
- External services: the engine's own model providers (unchanged by bridge); bridge egress is only to the configured opencode URL.
- Files / parsing: SSE + JSON from loopback engine plus loopback plugin callbacks; workspace folder path validated as absolute open-folder path; plugin installed via `OPENCODE_CONFIG_CONTENT` merge (managed) or manual absolute-path install (external).
- Network egress: loopback to engine; engine's own upstream calls out of scope.
- Deployment/infrastructure: local VSIX; no cloud, no CI secrets.
- Approvals: engine-native actions (`permission.asked/reply`) pause for a VS Code confirmation (once / client-side always-for-session auto-`once` / cancel) with default-deny on timeout, dismiss, disconnect, or cancellation; the bridge never sends `always` and never propagates VS Code Allow-all.

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
