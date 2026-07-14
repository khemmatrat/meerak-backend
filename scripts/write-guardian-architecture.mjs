#!/usr/bin/env node
/**
 * AQOND Guardian Kernel — Architecture Document Generator
 * Chief Security Architect deliverable. DOCS ONLY — no production code.
 *
 * Usage: node scripts/write-guardian-architecture.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARDIAN = path.join(ROOT, 'docs', 'aqond-os', 'architecture', 'guardian');
const TODAY = new Date().toISOString().slice(0, 10);

fs.mkdirSync(GUARDIAN, { recursive: true });

function w(name, body) {
  fs.writeFileSync(path.join(GUARDIAN, name), body.trimStart() + '\n');
  console.log('  wrote', name);
}

const HEADER = (title, status = 'APPROVED — Phase 0 Architecture') => `# ${title}

**Status:** ${status}  
**Date:** ${TODAY}  
**Subsystem:** AQOND Guardian Kernel (AGK) / AQOND AI OS  
**Classification:** Internal — Architecture  
**Audience:** Platform, Security, AI Infrastructure, SRE, Compliance  

> **Nomenclature:** This is **not** an AI agent. Do not call it "Guardian AI".  
> Canonical names: **AQOND Guardian Kernel**, **AGK**, **AI Security Kernel**.

`;

// ─── 000-overview ───────────────────────────────────────────────────────────
w('000-overview.md', `${HEADER('AQOND Guardian Kernel — Architecture Overview')}

## Executive summary

AQOND is transitioning from a super-app with embedded AI features (Jarvis, Hermes) to an **AI-native operating system** that hosts multiple **untrusted AI workers**. Sprint 35 completed the last feature sprint before this security architecture phase.

**AQOND Guardian Kernel (AGK)** is the mandatory security control plane. It is **not** an LLM and **not** a chatbot. It is the **AI hypervisor + policy engine + audit spine** through which every AI request, tool invocation, memory write, skill load, and egress must pass.

**No AI may bypass Guardian. Ever.**

## Mission Statement (supreme design criterion)

> **AQOND Guardian Kernel exists to ensure that no AI, no service, no skill, and no human operator can exceed the permissions explicitly granted by the platform. Every action must be authenticated, authorized, auditable, and attributable before it is executed.**

Every future design decision — new AI, skill, or service — is measured against this sentence.

## The Four Planes of AQOND AI OS

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE — AQOND Guardian Kernel (AGK)                     │
│  Auth · Policy · Risk · Audit · Hypervisor · Scheduler · Identity│
├─────────────────────────────────────────────────────────────────┤
│  EXECUTION PLANE — AI Agents (untrusted workers)                  │
│  jarvis-prod-01 · hermes-worker-01 · athena-01 · sentinel-01   │
├─────────────────────────────────────────────────────────────────┤
│  KNOWLEDGE PLANE — curated read models (NOT raw DB)              │
│  Knowledge Graph · Search · Embeddings · Vector · FAQ · Docs     │
├─────────────────────────────────────────────────────────────────┤
│  DATA PLANE — AQOND Platform                                     │
│  Commerce · Wallet · Orders · CRM · Analytics · Postgres…        │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

| Plane | Role | Trust |
|-------|------|-------|
| **Data Plane** | System of record | Protected — agents **never** direct SQL |
| **Control Plane** | Guardian Kernel | Authoritative policy |
| **Execution Plane** | AI agents | **Untrusted** — certificate-bound identities |
| **Knowledge Plane** | Derived, scoped views | Agent-readable via Guardian tools only |

> **Guardian is the Control Plane.** Not a chatbot. Not an agent.

## Document index

| # | Document | Scope |
|---|----------|--------|
| 000 | overview.md | This file — Four Planes, phases |
| 001 | vision.md | AI OS vision, 10-year horizon |
| 002 | security-principles.md | Non-negotiable principles |
| 003 | zero-trust.md | Zero Trust model for AI workloads |
| 004 | threat-model.md | AI + platform threat model |
| 005 | trust-boundaries.md | Security zones and data flows |
| 006 | component-diagram.md | C4 / component architecture |
| 007 | sequence-diagrams.md | Critical path sequences |
| 008 | permission-matrix.md | RBAC/ABAC for humans and agents |
| 009 | ai-capability-matrix.md | Agent capabilities and tool allowlists |
| 010 | data-classification.md | Data tiers and handling |
| 011 | sensitive-data-policy.md | PII, PCI, secrets in AI context |
| 012 | memory-isolation.md | Memory tiers, poisoning defenses |
| 013 | ai-skills.md | Skill manifests, signing, lifecycle |
| 014 | sandbox.md | Tool execution isolation |
| 015 | human-approval.md | HITL workflows |
| 016 | multi-tenant.md | Tenant isolation at scale |
| 017 | ai-hypervisor.md | Agent registration, quotas, kill switch |
| 018 | event-bus.md | Signed events, Guardian tap |
| 019 | api-gateway.md | Kong + Guardian integration |
| 020 | audit.md | Immutable audit, compliance |
| 021 | secrets.md | Vault, token broker, no prompt secrets |
| 022 | disaster-recovery.md | RPO/RTO, regional failover |
| 023 | incident-response.md | AI compromise playbooks |
| 024 | deployment-topology.md | Global topology |
| 025 | docker.md | Dev / staging containers |
| 026 | kubernetes.md | Production K8s |
| 027 | service-boundaries.md | Ownership matrix |
| 028 | folder-structure.md | Repository layout |
| 029 | microservices.md | AGK microservice decomposition |
| 030 | rollout-plan.md | Phased platform evolution |
| 031 | roadmap.md | Phase 0–6 roadmap |
| **032** | **ai-identity.md** | **AI_ID, certificates, rotation** |
| **033** | **skill-marketplace.md** | **Skill App Store model** |
| **034** | **resource-scheduler.md** | **CPU/GPU/token/memory scheduling** |
| **035** | **ai-constitution.md** | **The Constitution of AQOND AI OS** |
| **036** | **ai-lifecycle.md** | **Create → destroy lifecycle** |
| **037** | **ai-communication-protocol.md** | **AI Message Envelope** |
| **038** | **ai-governance.md** | **Who may deploy/suspend/approve** |
| **039** | **api-contract-freeze.md** | **Phase 0.5 — frozen API contracts** |
| **040** | **state-machines.md** | **Phase 0.5 — Agent/Skill/Policy/HITL FSM** |
| **041** | **performance-budget.md** | **Phase 0.5 — latency & SLO targets** |
| **042** | **failure-matrix.md** | **Phase 0.5 — dependency failure behavior** |
| **043** | **compatibility-matrix.md** | **Phase 0.5 — Sprint 31–35 backward compat** |
| **044** | **constitution-compliance.md** | **Phase 0.5 — doc ↔ Constitution map** |
| **045** | **architecture-review-report.md** | **Phase 0.5 — formal review & readiness** |
| **046** | **phase-05-freeze-gate.md** | **Phase 0.5 — approval checklist** |
| **047** | **emergency-playbook.md** | **Phase 0.6 — incident runbooks** |
| **048** | **kill-switch-matrix.md** | **Phase 0.6 — component isolation** |
| **049** | **feature-flag-strategy.md** | **Phase 0.6 — phased enforcement flags** |
| **050** | **rollback-strategy.md** | **Phase 0.6 — fast rollback procedures** |
| **051** | **production-acceptance-criteria.md** | **Phase 0.6 — phase transition gates** |
| **053** | **kernel-readiness-gate.md** | **Phase 3.5 — soak + chaos + memleak + long-context + attack** |
| **054** | **ai-service-mesh.md** | **Phase 4 — Service Registry + SERVICE_ID** |
| **055** | **production-confidence-program.md** | **Phase 3.6 — canary + shadow + confidence score** |
| **056** | **governance-validation.md** | **Phase 3.7 — insider + tenant + DR + HITL** |
| **057** | **identity-hierarchy.md** | **TENANT_ID → SERVICE_ID → AI_ID** |
| **058** | **intent-layer.md** | **Intent authorization + capability decomposition** |
| **059** | **mission-session.md** | **MISSION_ID audit spine** |
| **060** | **autonomous-collaboration.md** | **Phase 8 vision** |

## Platform evolution

\`\`\`
Phase 0    Architecture              ✅ APPROVED (000–038)
Phase 0.5  Kernel Specification Freeze  ✅ APPROVED (039–046)
Phase 0.6  Operational Readiness     ← CURRENT GATE (047–051)
Phase 1.1  Guardian — Observe Only   ← first code (after 0.6 approved)
Phase 1.2  Soft Enforcement         ← shadow firewall, alert only
Phase 1.3  Hard Enforcement         ← fail-closed for money/PII/permissions
Phase 2    AI Runtime
Phase 3    Hypervisor + Scheduler        ✅
Phase 3.5  Kernel Readiness Gate         ← soak + chaos + memleak + attack (053)
Phase 3.6  Production Confidence         ← canary + shadow (055)
Phase 3.7  Governance Validation         (056)
Phase 3.8  Intent + Mission              ← CURRENT (058–059)
Phase 4    AI Service Mesh              ← blocked by 053+055+056
Phase 7    Digital Economy Layer
Phase 8    Autonomous Collaboration      ← vision (060)
\`\`\`

See \`051-production-acceptance-criteria.md\` (Phase 0.6 gate) before any Phase 1.1 code.

## Fail-open / fail-closed by phase (canonical — do not misapply in production)

| Phase | Default when AGK dependency unavailable |
|-------|----------------------------------------|
| **1.1 Observe** | **Fail open** — Jarvis/Hermes unchanged; SDK timeout 15 ms → skip tap |
| **1.2 Soft Enforcement** | **Fail open** for L0/low-risk only; alert on degradation |
| **1.3 Hard Enforcement** | **Fail closed** for financial, PII, and permission actions (L2+) |

Full matrix: \`042-failure-matrix.md\`. Operations: \`047\`–\`051\`.

## Relationship to Jarvis (Sprints 31–35)

Sprint 35 is **frozen**. All phases must preserve:

- \`POST /api/ai/jarvis\` response schema
- \`POST /v1/jarvis/concierge\` contract
- Feature flags (\`JARVIS_*\`, \`AIVOS_JARVIS_*\`)
- \`user_ai_preferences.context_json\` shapes

**Phase 1.1 (observe):** Audit tap only — **zero behavior change**.  
**Phase 1.2 (soft):** Prompt firewall **alert** mode only — still no block.  
**Phase 1.3+:** Enforcement per Constitution.

## Approval gates

\`\`\`
Phase 0     Architecture           → APPROVED
Phase 0.5   Kernel Spec Freeze     → APPROVED (039–046)
Phase 0.6   Operational Readiness  → PENDING (047–051)
Phase 1.1   Observe-only code      → after Phase 0.6 approved
Phase 1.2   Soft enforcement       → after 051 acceptance criteria met
\`\`\`

**Architecture-first forever:** documents lead code. No exceptions.

**STOP:** No Phase 1.1 code until \`051-production-acceptance-criteria.md\` Phase 0.6 gate is signed off.

## Phase 1.1 iron rules (non-negotiable)

1. **No behavior change** to Jarvis or Hermes
2. **No block or deny** of any request
3. **Sprint 35 regression** must pass 100%
4. Every request: **correlation_id**, **trace_id**, **AI_ID** for audit
`);

// ─── 001-vision ─────────────────────────────────────────────────────────────
w('001-vision.md', `${HEADER('001 — Vision: AQOND as AI Operating System')}

## 1. The shift

AQOND is not "an app with AI features." It is an **AI Operating System (AI OS)** where:

- **Users** interact through product surfaces (Marketplace, Food, Wallet, Admin…)
- **AI Workers** (Jarvis, Hermes, future agents) execute bounded tasks on behalf of users and merchants
- **Guardian Kernel** enforces security, policy, and observability for every worker

Jarvis and Hermes originate from **open-source lineages**. They must be treated as **untrusted code paths** that can be compromised via prompt injection, malicious skills, supply-chain attacks, or model vulnerabilities.

## 2. What Guardian Kernel is

| Guardian IS | Guardian IS NOT |
|-------------|-----------------|
| Policy enforcement point | An LLM / chatbot |
| Identity & authZ broker for AI | A replacement for Jarvis UX |
| AI firewall & risk scorer | Hermes orchestration logic |
| Audit & compliance spine | User-facing product |
| Hypervisor for agent runtimes | Optional middleware |

## 3. AI OS layers — Four Planes

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│  Product Surfaces (Storefront, Admin, Mobile, Merchant OS)   │
├─────────────────────────────────────────────────────────────┤
│  CONTROL PLANE — AQOND Guardian Kernel (AGK)                 │
│  Identity · Policy · Risk · Audit · Hypervisor · Scheduler   │
├─────────────────────────────────────────────────────────────┤
│  EXECUTION PLANE — AI Agents (certificate-bound identities)  │
│  jarvis-prod-01 · hermes-worker-01 · athena-01 · sentinel  │
├─────────────────────────────────────────────────────────────┤
│  KNOWLEDGE PLANE — Graph · Search · Embeddings · Vector     │
│  (Agents read HERE — not raw Data Plane databases)           │
├─────────────────────────────────────────────────────────────┤
│  DATA PLANE — AQOND Platform (commerce, wallet, orders…)    │
└─────────────────────────────────────────────────────────────┘
\`\`\`

**AQOND Platform = Data Plane.**  
**AQOND Guardian Kernel = Control Plane.**  
**AI Agents = Execution Plane.**  
**Knowledge Plane = safe cognitive substrate for agents.**

Every agent instance has unique **AI_ID** — never \`jarvis = jarvis\`. See \`032-ai-identity.md\`.

## 4. Ten-year horizon

Design assumptions:

- **10⁸+** registered identities, **10⁷** merchants, **10⁶** concurrent AI sessions
- **10⁷–10⁸** AI requests/day globally
- Multi-region active-active with data residency (TH, SG, US, EU)
- Financial-grade audit for wallet/payment-adjacent AI actions
- Regulatory evolution (AI Act, PDPA, PCI-DSS, local payment rules)

## 5. Success criteria

1. Zero unauthenticated AI tool execution in production
2. 100% AI requests emit structured audit events with trace_id
3. Prompt injection blocked or downgraded before tool plane
4. Cross-tenant memory leakage: **impossible by construction**
5. Kill switch halts all AI workers globally in < 60 seconds
6. Sprint 35 Jarvis regression suite green through G1–G2

## 6. Strategic challenge to current architecture

The explore review identified **critical gaps** that Guardian must close:

- \`optionalAuth\` + client-supplied \`userId\` without JWT binding → **spoofing**
- BFF minting service JWT from \`x-user-id\` → **trust inversion**
- ai-core open if \`AI_CORE_API_KEY\` unset → **fail-open**
- Internal routes gated only by \`AQOND_LOCAL_DEV\` → **dev leakage risk**
- Fragmented event buses without signed envelopes → **audit gaps**

Vision without fixing these is insufficient. Guardian exists to make fail-open paths **fail-closed**.
`);

// Continue with remaining files in batches - I'll write a condensed but comprehensive set

const files = {
'002-security-principles.md': `${HEADER('002 — Security Principles')}

## Non-negotiable principles

### P1 — Zero Trust for AI
Never trust an agent, skill, model output, or user prompt. Verify identity, intent, policy, and risk on every hop.

### P2 — Fail closed
If Guardian cannot authenticate, authorize, score risk, or reach policy store → **deny** (or safe read-only degrade). Never fail open to ai-core.

### P3 — Least privilege
Agents receive minimal capability tokens per request. Tools are allowlisted per agent × tenant × surface. No ambient admin.

### P4 — Defense in depth
Gateway + Guardian + sandbox + network policy + secrets broker + audit. Compromise of one layer must not imply full platform compromise.

### P5 — Immutable audit
Security-relevant events append-only, tamper-evident, retained per compliance tier. AI decisions reconstructable.

### P6 — Memory is attack surface
Treat \`context_json\`, Hermes episodic memory, and session state as **untrusted input** to the model and **protected output** to other tenants.

### P7 — Skills are supply chain
Third-party and open-source skills require signing, provenance, sandbox, and version pinning. Unsigned skills: **blocked in prod**.

### P8 — Human sovereignty
High-impact actions (pay, post, publish, delete, PII export, admin config) require human approval or step-up auth.

### P9 — Separation of duties
Guardian operators ≠ AI model operators ≠ merchant support with full memory access.

### P10 — Backward compatibility during migration
Sprint 35 contracts frozen. Guardian G1 must not break \`POST /api/ai/jarvis\` consumers.

## Anti-patterns (explicitly forbidden)

| Anti-pattern | Why |
|--------------|-----|
| "Guardian AI" chatbot | Confuses control plane with agent |
| Direct BFF → Ollama | Bypasses policy and audit |
| Shared agent memory across tenants | Cross-tenant leakage |
| Secrets in prompts or context_json | Exfiltration via injection |
| optionalAuth + query userId | Identity spoofing |
| Global kill switch only in env var | No centralized hypervisor |

## Principle → control mapping

| Principle | Primary controls |
|-----------|------------------|
| P1 | mTLS, JWT binding, continuous re-auth for sensitive tools |
| P2 | Guardian sidecar required; health = deny |
| P3 | Capability matrix (009), OPA/Cedar policies |
| P4 | Sandbox (014), network policies (026) |
| P5 | Audit bus (020), WORM storage |
| P6 | Memory isolation (012) |
| P7 | Skill signing (013) |
| P8 | Approval workflow (015) |
| P9 | RBAC separation (008) |
`,

'003-zero-trust.md': `${HEADER('003 — Zero Trust Model')}

## 1. Definition for AQOND

**Zero Trust** means no request—human or AI—is trusted based on network location, prior session, or "internal" service name. Every access decision uses:

1. **Identity** — Who (user, merchant, agent, service)?
2. **Context** — Surface, tenant, device, geo, risk score?
3. **Policy** — What is allowed now?
4. **Resource** — What is being accessed?

## 2. Zero Trust pillars (NIST SP 800-207 adapted for AI)

### 2.1 Identity
- Users: Firebase/OIDC JWT with \`sub\`, \`tenant_id\`, \`amr\`, \`acr\`
- Services: SPIFFE/SPIRE or cloud workload identity (AWS IRSA, GKE WI)
- **AI Workers:** non-human identities \`agent:jarvis\`, \`agent:hermes\` with **delegation** from user JWT (OAuth2 token exchange)

**Fix required:** Eliminate \`req.query.userId\` without \`sub\` match.

### 2.2 Device / client
- Web: device fingerprint (low assurance), step-up for wallet
- Mobile (future): app attestation, keychain-bound tokens
- Server-side BFF: **never** accept raw \`x-user-id\` without user JWT

### 2.3 Network
- Default deny between namespaces
- Egress allowlist per sandbox
- No flat Docker network in production

### 2.4 Application / workload
- Guardian validates every AI request before worker invocation
- Workers run with distinct service accounts
- Model endpoints are **external untrusted** — output sanitized before tools

### 2.5 Data
- Classification-driven encryption (010)
- Tenant-scoped encryption keys (BYOK future)
- DLP on prompt/response paths

## 3. Trust zones

| Zone | Trust level | Examples |
|------|-------------|----------|
| Z0 Public Internet | Untrusted | Browsers, mobile apps |
| Z1 Edge / CDN | Low | Cloudflare, WAF |
| Z2 API Gateway | Verified transport | Kong, rate limits |
| Z3 Guardian | High — policy authority | AGK services |
| Z4 Agent runtime | Untrusted compute | Jarvis route, Hermes orchestrator |
| Z5 Tool sandbox | Highly restricted | Order lookup, search |
| Z6 Data plane | Protected | Postgres, Redis, object store |

## 4. Continuous verification

- Short-lived tokens (≤15 min) for AI sessions
- Re-evaluate policy on tool escalation
- Risk engine can revoke mid-flight (kill partial chain)

## 5. Migration from current state

| Current | Target |
|---------|--------|
| optionalAuth + userId param | JWT required; userId = claims.sub only |
| AI_CORE_API_KEY optional | Required in all non-dev envs |
| Kong key-auth only | Key-auth + Guardian policy token |
| Dev internal routes | mTLS service identity in prod |
`,

'004-threat-model.md': `${HEADER('004 — AI Threat Model')}

## 1. Methodology

- **STRIDE** for platform components
- **MITRE ATLAS** for ML/AI-specific threats
- **OWASP LLM Top 10** for application layer

## 2. Threat actors

| Actor | Motivation | Capability |
|-------|------------|------------|
| External attacker | Fraud, data theft | Prompt injection, API abuse |
| Malicious merchant | Competitor intel, refund abuse | Poisoned catalog, fake orders via AI |
| Compromised OSS skill | Supply chain | Arbitrary tool calls |
| Insider | Data exfil | Admin paths, memory dumps |
| Rogue model output | Unintended | Tool hallucination → wrong action |
| Nation-state (long-term) | Surveillance | Infrastructure compromise |

## 3. AI-specific threats

### T-AI-01 Prompt injection (direct / indirect)
- **Vector:** User message, feed caption, memory summary, merchant product description
- **Impact:** Tool misuse, data exfil, policy bypass
- **Mitigation:** AI firewall, input canonicalization, tool argument validation, separate system/user channels

### T-AI-02 Jailbreak / policy bypass
- **Vector:** Multi-turn coercion, role-play
- **Mitigation:** Risk scoring, turn limits, policy templates immutable to user

### T-AI-03 Malicious skills
- **Vector:** Unsigned skill package, typosquat skill name
- **Mitigation:** Skill signing (013), sandbox (014), allowlist registry

### T-AI-04 Memory poisoning
- **Vector:** \`jarvis_memory\`, Hermes episodic, \`context_json\` writes
- **Mitigation:** Write validation, provenance tags, decay, admin purge, cross-check with commerce truth

### T-AI-05 Token / secret leakage
- **Vector:** Model echoes API keys, logs, prompts
- **Mitigation:** Secrets broker (021), redaction, no secrets in context

### T-AI-06 Model vulnerability
- **Vector:** Adversarial inputs, model theft
- **Mitigation:** Model gateway, output filtering, private deployment

### T-AI-07 Browser / OS automation exploit
- **Vector:** Future computer-use agents
- **Mitigation:** **Not enabled** until sandbox maturity; deny by default in capability matrix

### T-AI-08 Cross-tenant leakage
- **Vector:** Shared cache, wrong userId in query
- **Mitigation:** Tenant guard in Guardian, mandatory \`tenant_id\` in all memory keys

### T-AI-09 Denial of wallet / commerce
- **Vector:** AI-triggered mass orders, wallet drain
- **Mitigation:** Rate limits, spend caps, human approval (015)

### T-AI-10 Audit evasion
- **Vector:** Direct ai-core call, dev flag in prod
- **Mitigation:** Network policy blocks direct access; Guardian audit tap mandatory

## 4. STRIDE snapshot (Guardian Kernel)

| Threat | Guardian component |
|--------|-------------------|
| Spoofing | JWT binding, service mTLS |
| Tampering | Signed events, immutable audit |
| Repudiation | trace_id, user + agent attribution |
| Info disclosure | DLP, memory isolation |
| DoS | Rate limits, quota hypervisor |
| Elevation | Capability matrix, approval gates |

## 5. Risk acceptance (explicit)

Until G3: **local Jarvis rules fallback** remains for availability — logged as degraded security mode when Guardian offline (fail-closed preferred in G2+).
`,

'005-trust-boundaries.md': `${HEADER('005 — Trust Boundaries')}

## 1. Boundary diagram

\`\`\`mermaid
flowchart TB
  subgraph Z0[Z0 Untrusted Client]
    Browser[Browser / Mobile]
  end
  subgraph Z2[Z2 API Gateway]
    Kong[Kong / WAF]
  end
  subgraph Z3[Z3 Guardian Kernel]
    AGK[Policy · Risk · Audit · Hypervisor]
  end
  subgraph Z4[Z4 Agent Runtime Untrusted]
    Jarvis[Jarvis BFF + ai-core]
    Hermes[Hermes Orchestrator]
    Future[Future AI Workers]
  end
  subgraph Z5[Z5 Tool Sandbox]
    Tools[Search · Orders · Wallet RO]
  end
  subgraph Z6[Z6 Data Plane]
    PG[(Postgres)]
    Redis[(Redis)]
  end
  Browser --> Kong
  Kong --> AGK
  AGK --> Jarvis
  AGK --> Hermes
  AGK --> Future
  Jarvis --> Tools
  Hermes --> Tools
  Tools --> PG
  AGK -. audit tap .-> PG
\`\`\`

## 2. Data flow rules

| Crossing | Requirement |
|----------|-------------|
| Z0 → Z2 | TLS 1.3, WAF, bot detection |
| Z2 → Z3 | Authenticated request + trace_id |
| Z3 → Z4 | Delegation token + capability set |
| Z4 → Z5 | Sandbox invocation only via Guardian tool proxy |
| Z5 → Z6 | Row-level tenant filter, read-only default |
| Z4 → Z6 direct | **Forbidden** in G3 (must via tools) |

## 3. Current violations (to remediate)

1. Storefront \`POST /api/ai/jarvis\` → ai-core with API key only
2. Backend Jarvis routes accept \`userId\` without binding
3. \`/api/internal/jarvis/commerce-signals\` — dev gate only
4. Hermes Kong route — key-auth without user delegation chain

## 4. Trust boundary invariants

- **I1:** User identity originates only from validated JWT \`sub\`
- **I2:** Agent identity is separate from user identity
- **I3:** Model output never executes tools without Guardian re-check
- **I4:** Memory writes include \`tenant_id\`, \`user_id\`, \`agent_id\`, \`provenance\`
`,

'006-component-diagram.md': `${HEADER('006 — Component Diagram')}

## C4 Context

\`\`\`mermaid
C4Context
  title AQOND AI OS — Context
  Person(user, "User / Merchant")
  System(aqond, "AQOND Super Platform")
  System_Ext(llm, "LLM Providers")
  Rel(user, aqond, "Uses products + AI")
  Rel(aqond, llm, "Inference via gateway")
\`\`\`

## C4 Container

\`\`\`mermaid
flowchart LR
  subgraph Clients
    SF[Storefront BFF]
    ADM[Admin Console]
  end
  subgraph Gateway
    KONG[Kong API Gateway]
  end
  subgraph AGK[Guardian Kernel]
    GAPI[guardian-api]
    GPOL[guardian-policy]
    GRISK[guardian-risk]
    GAUD[guardian-audit]
    GHYP[guardian-hypervisor]
  end
  subgraph Workers
    JAR[Jarvis Pipeline]
    HER[Hermes Orchestrator]
    AIC[ai-core]
  end
  subgraph Data
    PG[(Postgres)]
    VAULT[Secrets Vault]
    BUS[Event Bus]
  end
  SF --> KONG --> GAPI
  GAPI --> GPOL
  GAPI --> GRISK
  GAPI --> GHYP
  GAPI --> JAR
  GAPI --> HER
  JAR --> AIC
  HER --> AIC
  GAPI --> GAUD --> BUS
  GPOL --> PG
  Workers --> VAULT
\`\`\`

## Component responsibilities

| Component | Responsibility |
|-----------|----------------|
| guardian-api | Northbound API, request normalization, trace_id |
| guardian-policy | OPA/Cedar evaluation, capability checks |
| guardian-risk | Prompt injection ML + heuristics, rate anomaly |
| guardian-audit | Append-only security events |
| guardian-hypervisor | Agent registration, quotas, kill switch |
| guardian-tool-proxy | Sandboxed tool invocation (G2+) |

## Integration with existing code (G1 shim)

\`\`\`
storefront/app/api/ai/jarvis/route.ts
  → [NEW] guardian client.Enforce() — observe mode
  → existing pipeline (Sprint 31–35)
\`\`\`
`,

'007-sequence-diagrams.md': `${HEADER('007 — Sequence Diagrams')}

## S1 — Jarvis chat (target G3)

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant BFF as Storefront BFF
  participant K as Kong
  participant G as Guardian Kernel
  participant J as Jarvis/ai-core
  participant T as Tool Sandbox
  participant A as Audit

  U->>BFF: POST /api/ai/jarvis
  BFF->>K: JWT + body
  K->>G: Authorize + risk scan
  G->>A: ai.request.received
  alt risk high
    G-->>BFF: 403 or HITL required
  else allow
    G->>J: delegation_token + capabilities
    J->>G: tool_call intent
    G->>T: execute (sandbox)
    T-->>G: result
    G->>A: ai.tool.executed
    J-->>G: model response
    G->>A: ai.response.sent
    G-->>BFF: response (schema frozen)
  end
\`\`\`

## S2 — Hermes tool call

\`\`\`mermaid
sequenceDiagram
  participant M as Merchant
  participant BFF as Storefront
  participant G as Guardian
  participant H as Hermes
  participant AC as ai-core

  M->>BFF: merchant assistant
  BFF->>G: agent=hermes surface=merchant
  G->>H: scoped token
  H->>AC: inference
  H->>G: tool catalog.optimize
  G->>G: policy check + approval if needed
  G-->>BFF: result
\`\`\`

## S3 — Kill switch

\`\`\`mermaid
sequenceDiagram
  participant SOC as Security Ops
  participant GH as guardian-hypervisor
  participant W as All AI Workers

  SOC->>GH: POST /guardian/v1/kill {scope: global}
  GH->>W: revoke delegation tokens
  GH->>GH: persist kill state
  Note over W: New requests rejected fail-closed
\`\`\`

## S4 — Human approval (wallet action)

See 015-human-approval.md — sequence: risk flag → pending approval → user step-up → single-use capability grant.
`,

'008-permission-matrix.md': `${HEADER('008 — Permission Matrix')}

## 1. Human roles (platform)

| Role | Jarvis chat | Hermes tools | Admin AI | Memory read | Memory purge | Kill switch |
|------|-------------|--------------|----------|-------------|--------------|-------------|
| guest | RO chat | deny | deny | own session | deny | deny |
| buyer | full chat | deny | deny | own | deny | deny |
| merchant | chat + merchant persona | listing tools | deny | own + shop | own | deny |
| rider | deny shopping | rider-voice only | deny | own job | deny | deny |
| support L1 | impersonate RO | RO | deny | ticket-scoped | deny | deny |
| support L2 | RO | RO | deny | tenant-scoped | request | deny |
| admin | RO | RO | config | audit | approve purge | regional |
| security | audit | audit | policy | audit | force purge | **global** |

## 2. AI agent identities

| Agent ID | Can invoke | Cannot invoke |
|----------|------------|---------------|
| agent:jarvis | search, compare, food tools, track_order | wallet debit, admin, raw SQL |
| agent:hermes | catalog, listing, merchant memory RO | user wallet, cross-merchant |
| agent:director | ad plan draft | auto-publish, billing |
| agent:rider-voice | dispatch advance, incident | shopping, merchant admin |

## 3. Delegation rules

User JWT + requested surface → Guardian mints **delegation token**:

\`\`\`json
{
  "sub": "user-uuid",
  "tenant_id": "t-xxx",
  "agent": "agent:jarvis",
  "capabilities": ["jarvis:search", "jarvis:food_order"],
  "exp": 900,
  "risk_tier": "low"
}
\`\`\`

## 4. Fix for current spoofing

**Rule:** \`capabilities\` valid only if \`sub\` === authenticated JWT subject. Query \`userId\` ignored.
`,

'009-ai-capability-matrix.md': `${HEADER('009 — AI Capability Matrix')}

## Agent × Product × Tool

| Tool / Action | Jarvis | Hermes | Director | Rider-voice | Future |
|---------------|--------|--------|----------|-------------|--------|
| product search | ✅ | ✅ | — | — | — |
| place order | ✅ HITL | — | — | — | — |
| wallet read | ✅ RO | — | — | — | — |
| wallet debit | ❌ | ❌ | ❌ | ❌ | HITL only |
| merchant orders write | — | ✅ HITL | — | — | — |
| ad publish | — | — | ✅ HITL | — | — |
| dispatch advance | — | — | — | ✅ | — |
| browser automation | ❌ | ❌ | ❌ | ❌ | deny until G5+ |
| OS automation | ❌ | ❌ | ❌ | ❌ | **deny default** |
| admin config | ❌ | ❌ | ❌ | ❌ | ❌ |

## Risk tier → controls

| Tier | Examples | Controls |
|------|----------|----------|
| L0 read | search, FAQ | Auto allow |
| L1 write | cart add | Rate limit + audit |
| L2 financial | place order | HITL or step-up |
| L3 admin | policy change | deny for agents |

## Sprint 35 compatibility

Voice path (\`JARVIS_VOICE\`) adds capability \`jarvis:voice\` — STT/TTS stays client-side; Guardian audits transcript metadata only (not raw audio in G1).
`,

'010-data-classification.md': `${HEADER('010 — Data Classification')}

## Tiers

| Tier | Label | Examples | Encryption | AI in prompt |
|------|-------|----------|------------|--------------|
| T0 | Public | Product titles, public menus | TLS | Allowed |
| T1 | Internal | Aggregate analytics | TLS + at-rest | Summaries only |
| T2 | Confidential | PII, order details, chat | AES-256 + tenant key | Redacted / tokenized |
| T3 | Restricted | PAN, CVV, secrets, KYC docs | HSM / vault | **Forbidden** |
| T4 | Regulated | PCI CHD, government ID images | PCI scope | **Never** |

## Tagging

All Guardian-proxied payloads carry:

\`\`\`json
{ "data_tags": ["T2:pii", "T1:order_meta"], "tenant_id": "..." }
\`\`\`

DLP scanner blocks T3+ from entering model context.

## Retention

| Data | Hot | Warm | Cold |
|------|-----|------|------|
| AI audit | 90d | 1y | 7y |
| Prompts (opt-in) | 30d | — | — |
| jarvis_memory | user TTL | 7d medium | years long |
`,

'011-sensitive-data-policy.md': `${HEADER('011 — Sensitive Data Policy')}

## 1. Prohibited in AI context

- Full card numbers, CVV, PIN
- Private keys, API secrets, \`AI_CORE_API_KEY\`
- Other users' PII
- Cross-merchant competitive data

## 2. Tokenization

Wallet balance → \`"balance_band": "100-500 THB"\` not exact micros unless L2 approved.

## 3. Prompt logging

Production: log **hash + risk flags**, not raw prompt, unless tenant opts in with DPA.

## 4. Output filtering

Guardian response DLP:

- PAN regex block
- Thai national ID pattern block
- JWT/API key pattern block

## 5. Merchant data isolation

Hermes merchant memory scoped \`merchant_id\` + \`tenant_id\`. Jarvis cannot read Hermes merchant episodic without explicit capability.
`,

'012-memory-isolation.md': `${HEADER('012 — Memory Isolation Strategy')}

## 1. Memory classes

| Class | Store today | Guardian envelope |
|-------|-------------|-----------------|
| Short session | client sessionStorage | not synced |
| Medium | context_json.jarvis_memory | tenant+user scoped |
| Long | context_json.jarvis_memory.long | signed writes |
| Permanent | jarvis_locale | RO to model |
| Hermes episodic | hermes_* tables (PG) | separate agent namespace |
| Experience | user_experience_profiles | product plane |

## 2. Isolation keys

\`\`\`
memory_key = sha256(tenant_id | user_id | agent_id | memory_class | version)
\`\`\`

## 3. Poisoning defenses

- Write provenance: \`{ source: "user"|"agent"|"commerce_event", event_id }\`
- Anomaly detection: sudden business_context flip
- User visibility + purge API (existing prefs merge → Guardian-gated)
- No memory write on high-risk injection score

## 4. Cross-agent rules

Jarvis **cannot read** Hermes raw episodic. Shared facts via **commerce truth** (orders DB) only.

## 5. Sprint 31–35 preservation

Schema \`jarvis_memory.v1\` unchanged; Guardian wraps **writes** with policy in G2.
`,

'013-ai-skills.md': `${HEADER('013 — AI Skill Architecture')}

## 1. Skill definition

\`\`\`yaml
skill:
  id: aqond.skill.food_order@v1
  agent: agent:jarvis
  tools: [search, feed_food_order]
  risk_tier: L1
  signing_key_id: aqond-root-2026
  sandbox: wasm-js-v1
  network_egress: [search-svc, order-svc]
\`\`\`

## 2. Lifecycle

Draft → Signed → Staged → Prod → Deprecated → Revoked

## 3. Open-source Hermes/Jarvis skills

Treat bundled prompts as **skills** with hash pinning. Upgrade requires security review.

## 4. Registry

\`guardian-skill-registry\` (PG + OCI artifacts). Unsigned: dev only.

## 5. Supply chain

- SLSA level 2+ for skill images
- Dependabot + manual review for OSS agent repos
`,

'014-sandbox.md': `${HEADER('014 — AI Sandbox Architecture')}

## 1. Requirements

- No host filesystem
- Egress allowlist per tool
- CPU/memory/time quotas
- No raw SQL — parameterized tool APIs only

## 2. Technology options

| Phase | Technology | Use |
|-------|------------|-----|
| G1 | Process isolation + seccomp | Low-risk RO tools |
| G2 | gVisor / Firecracker microVM | Hermes tools |
| G3 | WASM (Extism) | Portable skills |
| G4 | Dedicated sandbox fleet | Untrusted OSS plugins |

## 3. Tool proxy pattern

Agents emit **intent**; Guardian executes:

\`\`\`
tool_call { name, args } → policy → sandbox → result
\`\`\`

## 4. Browser/OS automation

**Denied** in capability matrix until dedicated security review and isolated VDI fleet.
`,

'015-human-approval.md': `${HEADER('015 — Human Approval Workflow')}

## 1. Triggers

- L2+ financial action
- PII export > threshold
- First-time merchant AI publish
- Risk score > 0.85
- Policy exception

## 2. Flow

\`\`\`mermaid
stateDiagram-v2
  [*] --> Pending: risk/HITL
  Pending --> Approved: user step-up
  Pending --> Denied: timeout/user
  Approved --> Executed: single-use token
  Executed --> [*]
  Denied --> [*]
\`\`\`

## 3. UX surfaces

- Push notification + in-app modal
- Admin queue for merchant bulk actions
- Timeout: 5 min default → deny

## 4. Audit

Each approval stores: who, when, device, policy version, action hash.
`,

'016-multi-tenant.md': `${HEADER('016 — Multi-Tenant Security')}

## 1. Tenant model

\`\`\`
tenant_id = marketplace_region | merchant_org | platform
\`\`\`

All Guardian rows include \`tenant_id\`. Row-level security in Postgres.

## 2. Noisy neighbor

Per-tenant quotas: AI req/min, tokens/day, tool calls/day.

## 3. Data residency

TH tenant data in ap-southeast-1; EU in eu-central-1. Guardian policy rejects cross-region memory reads.

## 4. Admin super-tenant

Platform admin ≠ tenant admin. Cross-tenant access requires break-glass with audit.
`,

'017-ai-hypervisor.md': `${HEADER('017 — AI Hypervisor Architecture')}

## 1. Role

Orchestrates **untrusted agent runtimes** like a VM hypervisor:

- Register agent binaries/images
- Enforce resource limits
- Revoke tokens globally
- Health checks

## 2. Agent registration

\`\`\`json
{
  "agent_id": "agent:jarvis",
  "version": "35.0.0",
  "image_digest": "sha256:...",
  "max_concurrency": 50000,
  "capabilities_default": ["jarvis:search"]
}
\`\`\`

## 3. Kill switch hierarchy

| Scope | Example |
|-------|---------|
| global | SOC incident |
| tenant | merchant abuse |
| agent | Hermes CVE |
| user | compromised account |

Existing \`AIVOS_EXPERIENCE_KILL\` migrates to hypervisor API.

## 4. Not an AI

Hypervisor is deterministic control plane — no LLM in decision path for allow/deny (risk ML is advisory with fail-closed override).
`,

'018-event-bus.md': `${HEADER('018 — Event Bus Architecture')}

## 1. Unified envelope

\`\`\`json
{
  "event_id": "uuid",
  "type": "ai.tool.executed",
  "tenant_id": "...",
  "trace_id": "...",
  "actor": { "type": "agent", "id": "agent:jarvis" },
  "payload": {},
  "signature": "ed25519:...",
  "occurred_at": "ISO"
}
\`\`\`

## 2. Buses (convergence)

| Bus | Today | Target |
|-----|-------|--------|
| userCommerceEvents | PG | + Guardian sign |
| experience_events | PG | + Guardian tap |
| jarvisEventBridge | signals | subscribe signed only |
| Redpanda | compose | prod primary |
| aqondEventBus (file) | dev | **remove prod** |

## 3. ACL

Publish: registered services only. Subscribe: least privilege per consumer.

## 4. Guardian tap

Every AI request emits \`guardian.ai.*\` events — dual-write audit + bus.
`,

'019-api-gateway.md': `${HEADER('019 — API Gateway Design')}

## 1. Layers

\`\`\`
Client → CDN/WAF → Kong → Guardian → Service
\`\`\`

Kong handles: TLS termination, rate limit, API keys, JWT validation (partial today).

Guardian handles: AI policy, delegation tokens, risk, audit.

## 2. Route migration

| Route | Today | G3 |
|-------|-------|-----|
| /api/ai/jarvis | BFF → ai-core | BFF → Guardian → ai-core |
| /api/v1/hermes | Kong → Hermes | Kong → Guardian → Hermes |
| /api/jarvis/* | BFF → backend | + Guardian observe/enforce |

## 3. Deny direct access

NetworkPolicy: ai-core, Hermes not reachable from internet — only Guardian service accounts.

## 4. JWT

Consolidate \`JWT_SECRET\`, \`KONG_JWT_SECRET\` → single IdP long-term (Phase G4).
`,

'020-audit.md': `${HEADER('020 — Audit Architecture')}

## 1. Principles

- Append-only (WORM bucket + hash chain)
- Structured JSON schema versioned
- trace_id links HTTP → AI → tool → DB

## 2. Event types

\`guardian.auth.*\`, \`guardian.policy.*\`, \`guardian.risk.*\`, \`ai.request.*\`, \`ai.tool.*\`, \`ai.memory.write\`, \`guardian.kill.*\`

## 3. SIEM

Export to Splunk/Datadog via Kafka connector. Retention per 010.

## 4. Compliance

PCI: no CHD in audit payloads. PDPA: user export/delete hooks.
`,

'021-secrets.md': `${HEADER('021 — Secrets Management')}

## 1. Vault (HashiCorp or cloud SM)

- AI_CORE_API_KEY
- KONG keys
- DB credentials
- Model API keys

## 2. Token broker

Short-lived tokens for tool sandbox — never passed through LLM context.

## 3. Rotation

90-day rotation; emergency rotation playbook linked to kill switch.

## 4. Dev

\`.env\` local only; **never** commit. Guardian rejects requests if prod detects unset required secrets (fail-closed).
`,

'022-disaster-recovery.md': `${HEADER('022 — Disaster Recovery')}

## Targets

| Tier | RPO | RTO |
|------|-----|-----|
| Guardian control plane | 5 min | 15 min |
| Audit log | 0 (sync replicate) | 1 hr |
| AI workers (stateless) | n/a | 5 min |
| Postgres primary | 15 min | 1 hr |

## Multi-region

Guardian active-passive per region; global kill switch via global control plane (separate failure domain).

## Backup

Policy DB + audit: cross-region replicate. Test restore quarterly.
`,

'023-incident-response.md': `${HEADER('023 — Incident Response')}

## Playbooks

### IR-AI-01 Prompt injection campaign
1. Enable elevated risk threshold
2. Toggle agent-scoped kill if needed
3. Forensics via trace_id
4. Notify affected tenants

### IR-AI-02 Compromised skill
1. Revoke skill version in registry
2. Global kill Hermes if widespread
3. Rotate secrets
4. Post-mortem + signature review

### IR-AI-03 Model provider outage
1. Fail to rules fallback (Jarvis local) — **degraded mode logged**
2. No tool execution in degraded mode (G2+)

## SOC contacts

24/7 rotation; runbooks in PagerDuty.
`,

'024-deployment-topology.md': `${HEADER('024 — Deployment Topology')}

## Global

\`\`\`
                    ┌─────────────┐
                    │ Global DNS  │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      [APAC region]   [EU region]    [US region]
      Kong+Guardian   Kong+Guardian  Kong+Guardian
      Workers         Workers        Workers
      PG primary      PG primary     PG primary
\`\`\`

## Cell-based scaling

10M users/cell; Guardian stateless replicas behind LB.

## Sprint 35 dev

Single-machine: storefront:3003, backend:3001, ai-core — Guardian as sidecar optional G1.
`,

'025-docker.md': `${HEADER('025 — Docker Architecture')}

## Dev compose stack

\`\`\`yaml
services:
  guardian-api:
    image: aqond/guardian-api:dev
    environment:
      GUARDIAN_MODE: observe
  guardian-policy:
    image: aqond/guardian-policy:dev
  kong:
    extends: aqond-v2/gateway
  ai-core:
    networks: [ai-internal]
  hermes:
    networks: [ai-internal]
networks:
  ai-internal:
    internal: true
\`\`\`

## Principles

- Non-root containers
- Read-only root FS where possible
- No secrets in images
`,

'026-kubernetes.md': `${HEADER('026 — Kubernetes Deployment')}

## Namespaces

| NS | Workloads |
|----|-----------|
| aqond-gateway | Kong, WAF |
| aqond-guardian | guardian-* |
| aqond-ai | ai-core, hermes, ollama |
| aqond-data | postgres operators |
| aqond-apps | storefront, backend |

## NetworkPolicy

- ai-internal: ingress only from aqond-guardian
- default deny egress from ai namespace

## HPA

guardian-api: CPU + request rate.custom metric

## Helm

Chart \`aqond-guardian\` versioned independently from Jarvis feature releases.
`,

'027-service-boundaries.md': `${HEADER('027 — Service Boundaries')}

| Domain | Owner service | Guardian interaction |
|--------|---------------|----------------------|
| Commerce orders | order-svc | tool proxy |
| Wallet | wallet-svc | HITL tools only |
| Jarvis UX | storefront BFF | first hop |
| Jarvis brain | ai-core | worker |
| Hermes | hermes-orchestrator | worker |
| Experience | backend experience | event tap |
| Payments | payment-svc | deny AI direct |
| Identity | Firebase + backend | JWT source |

**Rule:** No service owns both Guardian policy and agent execution.
`,

'028-folder-structure.md': `${HEADER('028 — Folder Structure')}

## Proposed repository layout (post-approval)

\`\`\`
aqond-v2/
  guardian/                    # NEW — Guardian Kernel
    guardian-api/
    guardian-policy/
    guardian-risk/
    guardian-audit/
    guardian-hypervisor/
    guardian-sdk/              # Node + Python client for BFF/workers
    contracts/                 # OpenAPI, event schemas, Cedar policies
    deploy/
      docker/
      helm/
docs/aqond-os/architecture/guardian/   # THIS document set
backend/lib/jarvis/            # FROZEN feature layer — wraps via SDK G1
aqond-v2/apps/storefront/      # BFF — Guardian SDK hook in jarvis/route.ts
\`\`\`

Do **not** move Jarvis logic into Guardian — separation is intentional.
`,

'029-microservices.md': `${HEADER('029 — Microservice Boundaries')}

## Guardian microservices

| Service | Scale | Stateful | Notes |
|---------|-------|----------|-------|
| guardian-api | High | No | Northbound |
| guardian-policy | Med | Cache | OPA bundle |
| guardian-risk | Med | No | GPU optional |
| guardian-audit | High write | Kafka | |
| guardian-hypervisor | Low | Yes | kill state |
| guardian-tool-proxy | High | No | G2+ |

## Monolith avoidance

backend/server.js **does not** absorb Guardian — separate deploy cycle for security patching.

## SDK

\`@aqond/guardian-sdk\` — \`enforce(req)\`, \`delegate(capabilities)\`, \`audit(event)\`
`,

'030-rollout-plan.md': `${HEADER('030 — Production Rollout Plan (Phase 0–6)')}

## Platform evolution overview

| Phase | Name | Exit criteria |
|-------|------|---------------|
| **0** | Architecture | Docs 000–038; Constitution ratified ✅ |
| **0.5** | **Kernel Spec Freeze** | 039–046 approved; contracts frozen ✅ |
| **0.6** | **Operational Readiness** | 047–051 approved; kill switch + rollback ready |
| **1.1** | Observe Only | guardian-api SDK; audit tap; **no block** |
| **1.2** | Soft Enforcement | Firewall shadow; alerts only |
| **1.3** | Hard Enforcement | Policy deny; JWT binding |
| **2** | AI Runtime | ACP; Knowledge Plane v1 |
| **3** | Hypervisor + Scheduler | Resource scheduler live |
| **3.5** | **Kernel Readiness** | 053 — 7d soak + chaos + 72h memleak + long-context + attack sim |
| **4** | **AI Service Mesh** | SERVICE_ID registry; Marketplace is one service |
| **5** | AI Federation | Cross-region ACP |
| **6** | Global AI OS | 10M+ AI req/day |

## Phase 1.1 — Observe Only (Sprint 1 scope)

**Allowed:**
- guardian-api (observe endpoints only)
- @aqond/guardian-sdk \`observe()\`
- AI_ID registry skeleton (read/register stub)
- Audit tap in jarvis/route.ts
- correlation_id + trace_id on every request

**Forbidden:**
- Block / deny requests
- Change Jarvis logic or response schema
- Policy enforcement
- Permission denial

**Exit:** 7 days prod-like traffic; 100% audit coverage; Sprint 35 regression green.

## Fail-open / fail-closed (canonical)

| Phase | AGK unavailable | Financial / PII / permissions |
|-------|-----------------|------------------------------|
| **1.1 Observe** | Fail open — request proceeds | N/A (no enforce) |
| **1.2 Soft** | Fail open for L0/low-risk | Alert only; no deny |
| **1.3 Hard** | Fail closed L1+ | **Fail closed** — deny or HITL |

See \`042-failure-matrix.md\`, \`049-feature-flag-strategy.md\`.

## Phase 1.2 — Soft Enforcement

- Prompt firewall **shadow** mode (log would-block)
- Risk engine scores attached to audit
- Still **no** user-visible denials

## Rollback

See \`050-rollback-strategy.md\`. Emergency: \`AGK_OBSERVE=off\` removes tap; zero Jarvis behavior change. Target: **< 5 minutes**.
`,

'031-roadmap.md': `${HEADER('031 — Platform Evolution Roadmap')}

## Phase 0 — Architecture ✅

Docs 000–038. Constitution ratified.

---

## Phase 0.5 — Kernel Specification Freeze ✅

**No code.** Freeze specs before Platform Core build.

| Deliverable | Doc |
|-------------|-----|
| API contract freeze | 039 |
| State machines | 040 |
| Performance budget | 041 |
| Failure matrix | 042 |
| Compatibility matrix | 043 |
| Constitution compliance | 044 |
| Architecture review report | 045 |
| Freeze gate checklist | 046 |

**Exit:** Owner sign-off on 046 — **APPROVED**.

---

## Phase 0.6 — Operational Readiness ⬜

**No code.** Prepare operations before AGK enters every request path.

| Deliverable | Doc |
|-------------|-----|
| Emergency playbook | 047 |
| Kill switch matrix | 048 |
| Feature flag strategy | 049 |
| Rollback strategy | 050 |
| Production acceptance criteria | 051 |

**Exit:** Owner sign-off on 051 Phase 0.6 gate → then Phase 1.1 code allowed.

---

## Phase 1.1 — Guardian Kernel Foundation (Observe Only)

First code **only after Phase 0.6 approved**.

| # | Deliverable | Constitution |
|---|-------------|--------------|
| 1 | guardian-api | Art. 10 (audit) |
| 2 | @aqond/guardian-sdk | Art. 14 |
| 3 | AI_ID registry skeleton | Art. 6 |
| 4 | Audit tap jarvis/route.ts | Art. 10 |
| 5 | correlation_id / trace_id / AI_ID | Art. 6, 10 |
| 6 | Telemetry dashboards | — |

**Non-goals:** block, deny, firewall enforce, identity enforce

**Iron rules:** no Jarvis/Hermes behavior change; Sprint 35 green 100%; full traceability

**Gate to 1.2:** \`051\` acceptance criteria + Observe soak + Sprint 35 green

---

## Phase 1.2 — Soft Enforcement

- Prompt firewall alert mode
- Risk scores in audit
- JWT binding design validated in shadow

---

## Phase 1.3 — Hard Enforcement

- Policy deny (OPA/Cedar)
- Tool proxy
- ai-core delegation header required

---

## Phases 2–6

Unchanged — see prior roadmap (Runtime, Hypervisor, Marketplace, Federation, Global OS).
`,

'032-ai-identity.md': `${HEADER('032 — AI Identity Architecture')}

## 1. Problem

Human users have Auth (JWT, Firebase). **AI workers do not.** Today \`agent:jarvis\` is a string — **unacceptable**. Every agent instance must have identity equivalent to a service principal.

## 2. AI_ID naming

| AI_ID | Agent class | Environment | Example UUID |
|-------|-------------|-------------|--------------|
| jarvis-prod-01 | Jarvis concierge | production | \`a1b2c3d4-...\` |
| jarvis-prod-02 | Jarvis (scale-out) | production | \`...\` |
| hermes-worker-01 | Hermes orchestrator | production | \`...\` |
| athena-01 | Analytics/reasoning | staging | \`...\` |
| sentinel-01 | Security monitor | production | \`...\` |

**Rule:** \`jarvis\` alone is a **role label**, never an authentication principal.

## 3. Identity record

\`\`\`json
{
  "ai_id": "jarvis-prod-01",
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "agent_class": "jarvis",
  "environment": "production",
  "certificate": {
    "format": "spiffe://aqond.ai/agent/jarvis-prod-01",
    "public_key_pem": "...",
    "issued_at": "ISO",
    "expires_at": "ISO",
    "serial": "..."
  },
  "private_key_ref": "vault://guardian/ai-keys/jarvis-prod-01",
  "rotation_policy": { "days": 90, "overlap_hours": 24 },
  "status": "active|suspended|destroyed",
  "owner_team": "platform-ai",
  "governance_approver": "user-uuid"
}
\`\`\`

Private keys **never** on disk in agent containers — HSM/Vault signing proxy.

## 4. Certificate issuance

1. Governance approves agent creation (038)
2. Lifecycle stage \`Register\` (036)
3. guardian-identity CA issues cert bound to agent_uuid + tenant scope
4. Hypervisor registers runtime only if cert validates

## 5. Authentication flow

\`\`\`
Agent → mTLS (SPIFFE cert) → Guardian → validates AI_ID + expiry + revocation
       → mints delegation token for user request (separate from agent identity)
\`\`\`

## 6. Rotation

- Automatic at 80% of TTL
- Overlap window: old + new cert both valid
- Emergency revocation via hypervisor CRL

## 7. Anti-patterns

| Forbidden | Required |
|-----------|----------|
| Shared API key for all Jarvis pods | Per-instance AI_ID + cert |
| \`agent: jarvis\` in JWT without uuid | Full agent_uuid + ai_id |
| Long-lived never-rotated keys | 90-day max (configurable) |

## 8. Migration from today

| Current | Phase 1 target |
|---------|----------------|
| AI_CORE_API_KEY (shared) | Service identity + per-agent cert |
| Hermes Kong key | hermes-worker-01 cert |
| No agent registry | guardian-identity DB |
`,

'033-skill-marketplace.md': `${HEADER('033 — AI Skill Marketplace')}

## 1. Vision

AQOND will host **thousands of skills** (tools, prompts, workflows). Skills are distributed like an **App Store** — signed, reviewed, versioned, permissioned.

## 2. Skill manifest (required)

\`\`\`yaml
skill_id: aqond.skill.food_order
version: 2.1.0
publisher: aqond-official | merchant-org-uuid | partner-id
display_name: Food Order Assistant
hash: sha256:abc123...
signature: ed25519:...
permissions:
  - jarvis:food_order
  - knowledge:search_index:read
risk_level: L1
dependencies:
  - aqond.skill.search@v1
runtime: wasm-js-v1 | python-sandbox-v1
resource_limits:
  cpu_ms: 500
  memory_mb: 128
  network_egress: [search-svc, order-svc]
  token_budget_max: 4000
tenant_scope: [TH, SG]
status: draft | review | published | deprecated | revoked
\`\`\`

## 3. Marketplace roles

| Role | Actions |
|------|---------|
| Publisher | Submit skill |
| Security reviewer | Risk + sandbox review |
| Platform curator | Approve publish |
| Tenant admin | Allowlist skills for org |
| Agent | Install only signed + allowed skills |

## 4. App Store pipeline

\`\`\`
Submit → Automated scan → Security review → Staging → Publish → Monitor → Revoke
\`\`\`

## 5. Relation to 013-ai-skills.md

013 defines **architecture**; 033 defines **marketplace operations** (Phase 4).

## 6. Constitution alignment

- Article 4: L2+ skills require HITL
- Article 5: Skills cannot grant DB access — Knowledge Plane tools only
`,

'034-resource-scheduler.md': `${HEADER('034 — AI Resource Scheduler')}

## 1. Role

Hypervisor (017) manages agent **lifecycle**. **Scheduler** manages **resource contention** among agents.

Jarvis, Hermes, Athena, and future workers **compete** for finite resources through Guardian — not free-for-all.

## 2. Scheduled resources

| Resource | Unit | Example quota |
|----------|------|---------------|
| CPU | millicores-seconds | 50k/s per cell |
| GPU | inference slots | 100 concurrent |
| RAM | MB-seconds | per agent class |
| Context window | tokens | 32k max per request |
| Token budget | tokens/day | per tenant |
| Memory budget | KB episodic | per user-agent pair |

## 3. Scheduling algorithm (outline)

1. Request arrives with \`agent_uuid\`, \`tenant_id\`, \`priority\`, \`risk_tier\`
2. Scheduler checks quotas in guardian-scheduler
3. If insufficient: queue, downgrade model, or deny with retry-after
4. Preemption: sentinel > hermes merchant SLA > jarvis interactive > batch athena

## 4. Fairness

- Per-tenant minimum guaranteed share (5%)
- Burst credits for premium merchants
- Global kill drains queue immediately

## 5. Architecture

\`\`\`
guardian-api → guardian-scheduler → hypervisor → agent runtime
                      ↓
                 metrics (Prometheus)
\`\`\`

Phase 3 deliverable — design now, implement after Phase 2 runtime stable.

## 6. Observability

Dashboards: token burn rate, GPU queue depth, OOM kills, scheduler denials by tenant.
`,

'035-ai-constitution.md': `${HEADER('035 — The Constitution of AQOND AI OS', 'RATIFIED — Phase 0')}

# The Constitution of AQOND AI OS

**This document is the supreme architectural law of AQOND AI.**  
Every sprint, phase, module, and agent **must cite** the articles it satisfies.  
Amendments require Platform + Security + Legal super-majority.

---

## Preamble

AQOND is an AI Operating System. AI agents are **untrusted workers**. The Guardian Kernel is the **Control Plane**. No agent is above the law.

---

## Article 1 — No AI owns data

Data belongs to users, merchants, and tenants. Agents have **temporary delegation** to read or act — never ownership. Memory is a loan, not a right.

## Article 2 — Every action requires permission

No tool call, memory write, egress, or message without explicit capability granted by Guardian for **this** request.

## Article 3 — Default deny

If policy, identity, or risk cannot be evaluated → **deny**. Fail closed. No silent allow.

## Article 4 — Financial execution prohibited without human sovereignty

Wallet debit, payment capture, payout, refund — agents may **propose** only. Execution requires HITL or cryptographically verified user step-up.

## Article 5 — No direct database access

Agents **shall not** connect to Data Plane databases. Reads via Knowledge Plane tools; writes via audited tool APIs only.

## Article 6 — Unique AI identity

Every agent instance has AI_ID, Agent UUID, certificate, rotation, and expiration. Shared string names are not identity.

## Article 7 — Signed skills only in production

Unsigned or revoked skills **shall not** execute in production environments.

## Article 8 — Inter-agent communication uses ACP

Agents communicate only via AI Communication Protocol (037) — signed envelopes, never ad-hoc internal APIs.

## Article 9 — Kill switch supremacy

Security operations may halt any agent, tenant, or global AI scope. No agent may disable Guardian.

## Article 10 — Audit is mandatory

Every security-relevant event is logged immutably. No AI request without trace_id.

## Article 11 — Memory is untrusted input

All memory tiers treated as injectable. Writes require provenance; reads require classification scan.

## Article 12 — Knowledge Plane separation

Cognitive reads use Knowledge Graph, Search, Embeddings, Vector, FAQ, Documentation — not raw SQL.

## Article 13 — Multi-tenant isolation

Cross-tenant access is forbidden unless break-glass with audit.

## Article 14 — Architecture before code

No production module without approved architecture document citing this Constitution.

## Article 15 — Amendment

Articles may be amended by documented super-majority. Emergency security patches may add restrictive clauses without loosening Articles 3–5.

---

## Citation template (required in all design docs)

\`\`\`
Constitution: Art. 2 (permission), Art. 5 (no DB), Art. 12 (Knowledge Plane)
\`\`\`
`,

'036-ai-lifecycle.md': `${HEADER('036 — AI Lifecycle')}

## 1. AI lifecycle equals user lifecycle rigor

\`\`\`mermaid
stateDiagram-v2
  [*] --> Draft: design approved
  Draft --> Create: governance approve
  Create --> Register: AI_ID assigned
  Register --> CertIssue: CA issues cert
  CertIssue --> Permission: capabilities bound
  Permission --> Deploy: hypervisor admits
  Deploy --> Active: serving traffic
  Active --> RotateKeys: schedule
  RotateKeys --> Active
  Active --> Suspend: incident/policy
  Suspend --> Active: reinstate
  Active --> Destroy: decommission
  Suspend --> Destroy
  Destroy --> [*]: CRL + audit
\`\`\`

## 2. Stage owners

| Stage | Approver (038) |
|-------|----------------|
| Create | AI Platform Lead |
| Register | guardian-identity auto + audit |
| CertIssue | guardian-identity CA |
| Permission | Security + Product |
| Deploy | SRE + Hypervisor |
| RotateKeys | Automatic + alert |
| Suspend | Security on-call |
| Destroy | AI Platform + Security |

## 3. Artifacts per stage

| Stage | Artifact |
|-------|----------|
| Create | Architecture doc + Constitution cite |
| Register | agent_uuid, ai_id |
| CertIssue | PEM / SPIFFE, expiry |
| Deploy | K8s Deployment digest pinned |
| Destroy | CRL entry, key destroy proof |

## 4. Relation to 032

Identity (032) defines **what**; lifecycle (036) defines **when and how**.

## 5. User parity

Like HR offboarding: Destroy must revoke certs, memory namespaces, and scheduler quotas within SLA (24h).
`,

'037-ai-communication-protocol.md': `${HEADER('037 — AI Communication Protocol (ACP)')}

## 1. Problem

Jarvis, Hermes, Athena must not call each other via random internal HTTP. **ACP** is the only lawful inter-agent bus.

## 2. AI Message Envelope

\`\`\`json
{
  "acp_version": "1",
  "message_id": "uuid",
  "trace_id": "uuid",
  "sender": {
    "ai_id": "jarvis-prod-01",
    "agent_uuid": "uuid",
    "cert_thumbprint": "sha256"
  },
  "receiver": {
    "ai_id": "hermes-worker-01",
    "agent_uuid": "uuid"
  },
  "intent": "request.tool | notify | query.knowledge",
  "scope": {
    "tenant_id": "t-xxx",
    "user_delegation": "delegation-token-jti"
  },
  "permission": ["hermes:catalog:read"],
  "payload": { "redacted": true, "type": "..." },
  "risk": { "tier": "L0", "score": 0.12 },
  "ttl_sec": 30,
  "signature": "ed25519:...",
  "occurred_at": "ISO"
}
\`\`\`

## 3. Transport

- Phase 2: Guardian-mediated HTTP (\`POST /guardian/v1/acp/deliver\`)
- Phase 5: Federated bus (Kafka topic \`acp.messages\`)

## 4. Rules

1. Guardian validates sender cert + receiver allowlist
2. Payload DLP scan before deliver
3. TTL enforced — no replay
4. Receiver **never** trusts payload without Guardian signature

## 5. Knowledge Plane reads

\`intent: query.knowledge\` routes to Knowledge Plane adapters — not Postgres.

## 6. Forbidden

Direct \`fetch('http://hermes:8120/...')\` from Jarvis runtime in Phase 2+.
`,

'038-ai-governance.md': `${HEADER('038 — AI Governance')}

## 1. Separation of powers

Not every admin may do everything. Governance is **role-based** with separation of duties.

## 2. Governance matrix

| Action | Platform Admin | Security | AI Platform | Product | SRE | Merchant Admin |
|--------|----------------|----------|-------------|---------|-----|----------------|
| Deploy AI agent | ❌ | ❌ | ✅ approve | consult | execute | ❌ |
| Delete / Destroy AI | ❌ | ✅ | ✅ | ❌ | execute | ❌ |
| Suspend AI | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Approve skill publish | ❌ | ✅ | ✅ curator | consult | ❌ | ❌ |
| Approve prompt template | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve memory policy | ❌ | ✅ | ✅ | consult | ❌ | ❌ |
| Approve Cedar policy | ❌ | ✅ | consult | ❌ | ❌ | ❌ |
| Approve model route | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Global kill switch | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Tenant skill allowlist | ❌ | ❌ | consult | ❌ | ❌ | ✅ |

## 3. Approval workflows

Tied to 015-human-approval.md for runtime; this table is **organizational** authority.

## 4. Audit

Every governance action → \`guardian.governance.*\` audit event with approver JWT \`sub\`.

## 5. Constitution

Article 14: governance roles defined here are enforceable in guardian-policy Cedar bundles.

## 6. Break-glass

Security L3 may suspend globally with post-incident review within 4 hours.
`,

'039-api-contract-freeze.md': `${HEADER('039 — Guardian API Contract Freeze', 'FROZEN — Phase 0.5')}

## 1. Versioning

- **API version:** \`v1\` (path prefix \`/guardian/v1/\`)
- **Contract version:** \`guardian_contract_version: 1\`
- **Breaking changes:** new major path only (\`/guardian/v2/\`); v1 frozen 24 months minimum
- **SDK:** \`@aqond/guardian-sdk@1.x\` matches contract v1

## 2. Global headers (all requests)

| Header | Required | Description |
|--------|----------|-------------|
| \`Authorization\` | Yes* | Bearer user JWT or service token |
| \`X-Trace-Id\` | Yes | UUID v4; generated if absent by SDK |
| \`X-Correlation-Id\` | Yes | Business correlation (order, session) |
| \`X-Tenant-Id\` | If multi-tenant | Tenant scope |
| \`X-Agent-Id\` | Phase 1.1+ | e.g. \`jarvis-prod-01\` (observe: optional) |
| \`X-Guardian-Mode\` | Internal | \`observe\` \| \`shadow\` \| \`enforce\` |

*Phase 1.1 observe: missing auth logs warning; **does not block**.

## 3. Global response envelope

\`\`\`json
{
  "ok": true,
  "guardian_contract_version": 1,
  "trace_id": "uuid",
  "correlation_id": "uuid",
  "mode": "observe",
  "decision": "allow",
  "latency_ms": 4,
  "data": { }
}
\`\`\`

## 4. Error model (frozen codes)

| HTTP | code | Meaning | Observe behavior |
|------|------|---------|------------------|
| 400 | \`guardian.invalid_request\` | Schema violation | N/A |
| 401 | \`guardian.unauthenticated\` | No valid identity | Log only in 1.1 |
| 403 | \`guardian.denied\` | Policy deny | **Not used in 1.1** |
| 403 | \`guardian.hitl_required\` | Approval needed | Phase 1.3+ |
| 429 | \`guardian.rate_limited\` | Quota | Phase 1.3+ |
| 500 | \`guardian.internal\` | AGK error | Fail per 042 |
| 503 | \`guardian.unavailable\` | Dependency down | Fail per 042 |

## 5. Endpoints — Phase 1.1 (Observe)

### POST /guardian/v1/observe

Record AI request observation. **Never blocks upstream.**

**Request:**
\`\`\`json
{
  "surface": "jarvis",
  "route": "/api/ai/jarvis",
  "user_id": "uuid|null",
  "agent_id": "jarvis-prod-01|null",
  "tenant_id": "t-xxx",
  "request_meta": {
    "method": "POST",
    "message_length": 42,
    "flags": { "jarvis_voice": true }
  },
  "occurred_at": "ISO"
}
\`\`\`

**Response:** envelope + \`{ "recorded": true, "audit_id": "uuid" }\`

### POST /guardian/v1/observe/complete

After Jarvis response (async from BFF).

\`\`\`json
{
  "trace_id": "uuid",
  "response_meta": {
    "mode": "ai-core|local",
    "action": "search",
    "latency_ms": 1200
  }
}
\`\`\`

### GET /guardian/v1/health

\`\`\`json
{ "ok": true, "status": "healthy", "mode": "observe", "dependencies": { "audit": "up" } }
\`\`\`

### GET /guardian/v1/identity/{ai_id}

Registry skeleton read (Phase 1.1).

### POST /guardian/v1/identity/register

Skeleton register — audit only; no cert issuance in 1.1.

## 6. Endpoints — Phase 1.2+ (specified, not implemented in 1.1)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /guardian/v1/enforce | Full policy path |
| POST | /guardian/v1/delegate | Mint delegation token |
| POST | /guardian/v1/acp/deliver | Inter-agent message |
| POST | /guardian/v1/kill | Hypervisor kill |
| POST | /guardian/v1/approve | HITL decision |

## 7. SDK surface (frozen)

\`\`\`typescript
// Phase 1.1 only
observeStart(ctx: ObserveContext): { traceId, correlationId, agentId }
observeComplete(ctx: ObserveCompleteContext): Promise<void>
// Phase 1.2+
// enforce(ctx): Promise<EnforceResult>  — NOT in 1.1
\`\`\`

**SDK hard timeout:** 15 ms (observe). On timeout → **fail open** (Phase 1.1 only); Jarvis continues unchanged.

## 7.1 Fail behavior by phase (frozen — see 042)

| Phase | SDK timeout / AGK down | Rationale |
|-------|------------------------|-----------|
| **1.1 Observe** | **Fail open** — skip tap, log \`guardian.telemetry_gap\` | No policy yet; zero user impact |
| **1.2 Soft** | **Fail open** for L0/low-risk; alert for L1+ shadow hits | Collect signal; no user deny |
| **1.3 Hard** | **Fail closed** for financial, PII, permission (L2+) | Constitution Art. 3, 4 |

> **Warning:** Fail-open from 1.1 must **not** be copied to 1.3 without phase flag check.

## 8. OpenAPI

Canonical OpenAPI 3.1 artifact: \`aqond-v2/guardian/contracts/openapi/guardian-v1.yaml\` (to be generated in Phase 1.1 from this freeze).
`,

'040-state-machines.md': `${HEADER('040 — AGK State Machines', 'FROZEN — Phase 0.5')}

## 1. AI Agent lifecycle FSM

Canonical — aligns with 036-ai-lifecycle.md.

\`\`\`mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Create: governance_approve
  Create --> Register: ai_id_assigned
  Register --> CertPending: submit_ca
  CertPending --> CertIssued: ca_ok
  CertPending --> Register: ca_fail_retry
  CertIssued --> PermissionBound: capabilities_set
  PermissionBound --> Deployed: hypervisor_admit
  Deployed --> Active: health_ok
  Active --> RotatingKeys: schedule
  RotatingKeys --> Active: rotation_ok
  Active --> Suspended: incident|policy
  Suspended --> Active: reinstate
  Active --> Destroying: decommission
  Suspended --> Destroying
  Destroying --> Destroyed: crl_revoked
  Destroyed --> [*]
\`\`\`

**Forbidden transitions:** Active → Deployed (no downgrade without Destroy path).

## 2. Skill lifecycle FSM

\`\`\`mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted: publisher_upload
  Submitted --> Scanning: auto_scan
  Scanning --> Review: scan_pass
  Scanning --> Rejected: scan_fail
  Review --> Staged: security_approve
  Review --> Rejected: security_deny
  Staged --> Published: curator_publish
  Published --> Deprecated: new_version
  Published --> Revoked: incident
  Deprecated --> Revoked
  Revoked --> [*]
\`\`\`

**Runtime rule:** Only \`Published\` skills executable in prod (Phase 4+).

## 3. Policy lifecycle FSM

\`\`\`mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Staged: security_approve
  Review --> Draft: changes_requested
  Staged --> Active: promote
  Active --> Shadow: soft_enforce_mode
  Shadow --> Active: promote_enforce
  Shadow --> Active: rollback
  Active --> Deprecated: superseded
  Deprecated --> [*]
\`\`\`

Phase 1.2 uses **Shadow** only for prompt firewall policies.

## 4. Human approval (HITL) FSM

\`\`\`mermaid
stateDiagram-v2
  [*] --> NotRequired: risk_low
  [*] --> Pending: risk_high|L2_action
  Pending --> Approved: user_step_up
  Pending --> Denied: user_reject|timeout
  Pending --> Expired: ttl_exceeded
  Approved --> Consumed: single_use_token_spent
  Consumed --> [*]
  Denied --> [*]
  Expired --> [*]
\`\`\`

**TTL default:** 300 seconds. **Not used in Phase 1.1.**

## 5. Guardian request FSM (per HTTP request)

\`\`\`mermaid
stateDiagram-v2
  [*] --> Received
  Received --> Observed: mode_observe
  Received --> RiskScoring: mode_shadow
  Received --> PolicyEval: mode_enforce
  Observed --> Forwarded: always_allow
  RiskScoring --> Forwarded: log_score
  PolicyEval --> Forwarded: allow
  PolicyEval --> Denied: deny
  Forwarded --> Audited: async_audit
  Denied --> Audited
  Audited --> [*]
\`\`\`

**Phase 1.1:** all requests → Observed → Forwarded → Audited.
`,

'041-performance-budget.md': `${HEADER('041 — Performance Budget', 'FROZEN — Phase 0.5')}

## 1. Design principle

AGK must be **invisible** in Observe mode. Audit is **async**. Risk/policy paths have **hard timeouts**.

## 2. Latency budget — Observe mode (Phase 1.1)

| Stage | p50 target | p99 target | Max hard timeout |
|-------|------------|------------|------------------|
| SDK local (trace_id gen) | < 0.5 ms | < 1 ms | 2 ms |
| HTTP to guardian-api | < 2 ms | < 5 ms | 10 ms |
| guardian-api handler | < 1 ms | < 3 ms | 5 ms |
| **Total AGK overhead** | **< 3 ms** | **< 10 ms** | **15 ms** |
| Jarvis brain (unchanged) | — | — | 90 s (existing) |

**SLO:** 99.9% of Observe calls complete within 10 ms added latency.

**Breach behavior (Phase 1.1 only):** SDK **drops** observe call after 15 ms; Jarvis request **continues unaffected** — **fail open**.

> Phase 1.2+: see \`042-failure-matrix.md\` — fail-open is **not** universal in production.

## 3. Async audit path

| Component | Sync? | Target |
|-----------|-------|--------|
| observe/complete accept | Sync ACK | < 5 ms |
| Kafka/audit persist | **Async** | < 500 ms lag p99 |
| SIEM export | Async | minutes |

User response **never waits** for audit durability.

## 4. Risk engine (Phase 1.2+ shadow)

| Metric | Target |
|--------|--------|
| Inference timeout | 50 ms hard |
| On timeout | score=null, log \`risk.timeout\`, **allow** in shadow |
| Phase 1.3 enforce | timeout → **deny** for L2+ actions only |

## 5. Policy engine (OPA/Cedar) — Phase 1.3+

| Metric | Target |
|--------|--------|
| Eval timeout | 25 ms |
| On timeout | **fail-closed** L2+; allow L0 with audit flag |

## 6. Resource limits — guardian-api

| Resource | Limit |
|----------|-------|
| CPU | 500m request, 2 core limit per pod |
| Memory | 512Mi request |
| Max RPS per cell | 50k observe/s (horizontal scale) |

## 7. Verification (Phase 1.1 exit)

- Load test: 1k RPS Jarvis with AGK tap; p99 overhead ≤ 10 ms
- Compare Sprint 35 regression latency baseline ± 5%
`,

'042-failure-matrix.md': `${HEADER('042 — Failure Matrix', 'FROZEN — Phase 0.5 (amended Phase 0.6)')}

## 1. Philosophy — fail behavior by phase (CANONICAL)

This section is the **authoritative** rule. Do not apply Phase 1.1 fail-open to Phase 1.3.

| Phase | When AGK / dependency unavailable | Financial · PII · permissions |
|-------|-----------------------------------|------------------------------|
| **1.1 Observe** | **Fail open** — identical to pre-AGK behavior | N/A (no enforcement) |
| **1.2 Soft Enforcement** | **Fail open** for L0 and low-risk paths only | Shadow log + alert; **no deny** |
| **1.3 Hard Enforcement** | **Fail closed** for L1+ control paths | **Fail closed** — deny or HITL required |

### Work class reference

| Class | Examples | 1.1 | 1.2 | 1.3 |
|-------|----------|-----|-----|-----|
| L0 | FAQ, browse, voice profile read | Fail open | Fail open | Degrade OK |
| L1 | Memory write, persona update | Fail open | Fail open + alert | Fail closed |
| L2+ | Wallet, checkout, PII export, admin RBAC | N/A | Alert only (shadow) | **Fail closed** |

## 2. Dependency failure matrix

| Dependency | Symptom | Phase 1.1 Observe | Phase 1.2 Shadow | Phase 1.3 Enforce |
|------------|---------|-------------------|--------------------|--------------------|
| **guardian-api down** | 503 | Skip tap; log local | Skip tap; alert | **Block L2+**; allow L0 with flag |
| **OPA/Cedar down** | policy unavailable | N/A | Shadow log only | **Fail closed** L1+ |
| **Casbin* down** | RBAC unavailable | N/A | N/A | Fail closed admin paths |
| **Vault down** | no secrets | N/A | N/A | **Fail closed** for signing; RO tools OK |
| **Event bus down** | Kafka unavailable | Buffer audit locally 5m; drop if full | Same + alert | Critical events sync to PG fallback |
| **AI Firewall down** | risk timeout | N/A | Allow + \`risk.degraded\` | L2+ **deny**; L0 allow |
| **Postgres audit** | write fail | stdout fallback | stdout + alert | dual-write required before enforce |
| **Identity CA** | cert verify fail | N/A | N/A | **Deny** agent requests |

*Casbin: if used for human RBAC alongside Cedar; optional component.

## 3. Fail-closed definition

Request **denied** with \`503 guardian.unavailable\` OR \`403 guardian.denied\` — never silent allow for L2+.

## 4. Fail-open definition

| Phase | Definition |
|-------|------------|
| **1.1** | Request proceeds **identically** to pre-AGK. Gap logged as \`guardian.telemetry_gap\`. |
| **1.2** | L0/low-risk: same as 1.1. L1+: proceed but emit \`guardian.degraded_shadow\` alert. |
| **1.3** | Fail-open **forbidden** for L2+ financial, PII, permissions. |

## 5. Circuit breaker

SDK circuit opens after 5 consecutive failures / 10 s → stop calling guardian-api for 60 s.

## 6. Chaos testing (Phase 1.1 exit)

| Test | Expected |
|------|----------|
| Kill guardian-api pod | Jarvis 100% success; local log gap |
| Kafka partition unavailable | Observe ACK still < 5 ms |
| 10x latency injection | SDK timeout at 15 ms; Jarvis unaffected |
`,

'043-compatibility-matrix.md': `${HEADER('043 — Backward Compatibility Matrix', 'FROZEN — Phase 0.5')}

## 1. Guarantee (Phase 1.1 Observe)

**Zero behavior change.** Response bytes, status codes, and timing (within +10 ms p99) must match pre-AGK baseline.

## 2. Jarvis Sprint 31–35

| Endpoint / feature | Sprint | Observe impact | Schema change | Flag behavior |
|--------------------|--------|----------------|---------------|---------------|
| POST /api/ai/jarvis | core | tap only | **None** | unchanged |
| language_profile | 31 | audit field | None | JARVIS_LANG_INTEL |
| jarvis_memory / memory_summary | 32 | audit field | None | JARVIS_MEMORY |
| jarvis_persona | 33 | audit field | None | JARVIS_PERSONA |
| jarvis-brief / proactive | 34 | separate tap later | None | JARVIS_PROACTIVE |
| voice_profile | 35 | audit field | None | JARVIS_VOICE |
| POST /v1/jarvis/concierge | ai-core | no direct tap 1.1 | None | — |
| localJarvis fallback | — | audit mode=local | None | — |
| session_patch shape | — | unchanged | None | — |

## 3. Hermes

| Endpoint | Observe impact |
|----------|----------------|
| POST /api/v1/hermes (Kong) | Phase 1.2 tap planned |
| POST /api/ai/merchant-assistant | Phase 1.2 tap |
| GET /api/ai/rider-voice | Phase 1.2 tap |

Phase 1.1: **Jarvis only** — Hermes unchanged.

## 4. Platform modules

| Module | Risk in Observe | Mitigation |
|--------|-----------------|------------|
| Marketplace checkout | None — no AGK hook | — |
| Food order flow | None | — |
| Wallet / Pay | None — no AI path in 1.1 | — |
| Admin console | None | — |
| Experience / FTX | None | — |

## 5. Regression suite (must stay green)

\`\`\`
POST /api/ai/jarvis (TH, EN, food context)
GET /api/jarvis/language-profile
GET /api/jarvis/memory
GET /api/jarvis/persona
GET /api/jarvis/voice-profile
GET /api/experience/jarvis-brief
experience-ftx-rollout-regression.mjs
\`\`\`

## 6. Rollback

Remove SDK \`observe()\` calls → identical to Sprint 35 HEAD. No migrations required.
`,

'044-constitution-compliance.md': `${HEADER('044 — Constitution Compliance Map', 'FROZEN — Phase 0.5')}

## Document ↔ Article compliance

| Doc | Articles satisfied | Notes |
|-----|-------------------|-------|
| 000-overview | 14 | Architecture-first |
| 002-principles | 3, 9 | Fail closed principle |
| 003-zero-trust | 2, 3 | Continuous verification |
| 004-threat-model | 11 | Memory as attack surface |
| 005-trust-boundaries | 5, 12 | Knowledge vs Data plane |
| 008-permission-matrix | 2, 4 | Permission model |
| 009-capability-matrix | 2, 4, 5 | No DB, financial rules |
| 012-memory-isolation | 1, 11 | No AI owns data |
| 013-ai-skills | 7 | Signed skills |
| 032-ai-identity | 6 | Unique AI identity |
| 035-constitution | ALL | Supreme law |
| 036-ai-lifecycle | 6, 9 | Lifecycle |
| 037-acp | 8 | Inter-agent protocol |
| 038-ai-governance | 2, 9, 14 | Separation of duties |
| 039-api-contract | 10 | Audit mandatory |
| 040-state-machines | 2, 7 | Clear permission states |
| 041-performance | 3 | Fail closed timeouts |
| 042-failure-matrix | 3, 9 | Phase-scoped fail open/closed |
| 043-compatibility | 14 | No breaking change |
| 047-emergency-playbook | 9, 23 | Incident response |
| 048-kill-switch-matrix | 9, 17 | Hypervisor isolation |
| 049-feature-flag-strategy | 14 | Phased rollout |
| 050-rollback-strategy | 14 | Safe revert |
| 051-production-acceptance | 3, 10 | Phase transition gates |
| Phase 1.1 scope | 10, 14 | Observe only |

## Phase 1.1 explicit Constitution alignment

| Article | Phase 1.1 implementation |
|---------|-------------------------|
| Art. 2 Permission | Logged, not enforced |
| Art. 3 Default deny | **Deferred** to 1.3 |
| Art. 10 Audit | **Implemented** — primary goal |
| Art. 14 Arch before code | Phase 0.5 freeze |

## Gaps (known, scheduled)

| Article | Gap | Phase |
|---------|-----|-------|
| Art. 4 Financial HITL | Not wired | 1.3 |
| Art. 5 No DB | Jarvis still indirect | 2 |
| Art. 7 Signed skills | Not enforced | 4 |
| Art. 8 ACP | Not implemented | 2 |

**Compliance score Phase 0.5:** Design complete; runtime compliance begins Phase 1.1 (audit only).
`,

'045-architecture-review-report.md': `${HEADER('045 — Architecture Review Report', 'Phase 0.5')}

## 1. Review metadata

| Field | Value |
|-------|-------|
| Review type | Kernel Specification Freeze |
| Scope | Docs 000–051 |
| Reviewer role | Chief Security Architect (Cursor) |
| Constitution | 035-ai-constitution.md RATIFIED |
| Sprint 35 | FROZEN — compatibility required |
| Phase 0.5 | APPROVED — Kernel Specification Freeze |
| Phase 0.6 | Operational Readiness (047–051) |

## 2. Executive summary

AQOND Guardian Kernel architecture is **ready for Phase 0.5 sign-off** and subsequent **Phase 1.1 Observe-only implementation**.

The Four Planes model (Data, Control, Execution, Knowledge) provides a durable mental model for 10+ year evolution. Phase 0.5 freezes API contracts, state machines, performance budgets, and failure behavior — matching enterprise platform practice before core implementation.

## 3. Strengths

1. **Clear control vs execution separation** — Guardian is not conflated with AI
2. **Constitution as supreme law** — actionable articles with citation template
3. **AI identity model** — eliminates \`jarvis = jarvis\` anti-pattern
4. **Phased rollout** — Observe → Shadow → Enforce reduces regression risk
6. **Phased rollout** — Observe → Shadow → Enforce reduces regression risk
7. **Sprint 35 preservation** — explicit compatibility matrix
8. **Mission Statement** — decision criterion for all future design
9. **Operational readiness** — emergency playbook, kill switches, rollback before code
10. **Phase-scoped fail policy** — fail-open in 1.1 does not carry to 1.3

## 4. Risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Observe overhead > 10 ms | Medium | SDK timeout + async; 041 budgets |
| Identity spoofing until 1.3 | High | Documented; Phase 1.3 JWT binding |
| Dual event buses | Medium | 018 convergence plan |
| ai-core fail-open API key | High | 042 fail-closed in 1.3; env validation |
| Scope creep into enforce | Medium | 046 gate; forbidden list in 1.1 |

## 5. Readiness scores

| Area | Score | Comment |
|------|-------|---------|
| Architecture completeness | 99/100 | Living system — never 100 |
| Security design | 98/100 | Runtime proof pending |
| Sprint 35 compatibility | 100/100 | Observe guarantees |
| API contract clarity | 97/100 | OpenAPI artifact in 1.1 |
| Operability | 98/100 | 047–051 complete; dashboards in 1.1 |

**Overall readiness: 99.5/100** — Phase 0.5 approved; Phase 0.6 docs complete.

## 6. Recommendation

**APPROVE Phase 0.5** (signed) **and Phase 0.6 Operational Readiness.**

Upon sign-off of \`051-production-acceptance-criteria.md\` Phase 0.6 gate:

→ Begin **Phase 1.1 Observe Only** per 031-roadmap.md

→ **Do not** implement enforcement, blocking, or policy deny

→ **Iron rules:** no Jarvis/Hermes behavior change; Sprint 35 green; correlation_id + trace_id + AI_ID on every request

→ Exit criteria: 7-day soak + Sprint 35 regression green + p99 overhead ≤ 10 ms + 051 criteria before 1.2

## 7. Sign-off block

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Platform Owner | | | |
| Security Lead | | | |
| AI Platform Lead | | | |
`,

'046-phase-05-freeze-gate.md': `${HEADER('046 — Phase 0.5 Freeze Gate Checklist', 'APPROVED')}

## Phase 0.5 — Kernel Specification Freeze

### A. Documentation — COMPLETE

- [x] 000–038 Architecture corpus
- [x] 039 API Contract Freeze
- [x] 040 State Machines (Agent, Skill, Policy, HITL)
- [x] 041 Performance Budget (p99 ≤ 10 ms observe)
- [x] 042 Failure Matrix (phase-scoped fail open/closed)
- [x] 043 Compatibility Matrix (Sprint 31–35)
- [x] 044 Constitution Compliance Map
- [x] 045 Architecture Review Report
- [x] Mission Statement in 000-overview.md

### B. Frozen artifacts — APPROVED

- [x] Owner review 039 error codes
- [x] Owner review 040 FSM transitions
- [x] Owner review 042 fail-closed table (amended in 0.6)
- [x] Security sign-off 043 compatibility
- [x] Platform sign-off 041 latency SLO

### C. Phase 0.5 sign-off

\`\`\`
PHASE 0.5 APPROVED — 2026-06-30
\`\`\`

**Next gate:** Phase 0.6 Operational Readiness (\`047\`–\`051\`). Phase 1.1 code blocked until \`051\` gate signed.

### D. Phase 1.1 iron rules (carried forward)

1. No Jarvis or Hermes behavior change
2. No block or deny
3. Sprint 35 regression 100%
4. correlation_id + trace_id + AI_ID on every request
`,

'047-emergency-playbook.md': `${HEADER('047 — AGK Emergency Playbook', 'FROZEN — Phase 0.6')}

## 1. Purpose

Runbooks for incidents **before and during** AGK in the request path. Every event has: **detect → contain → communicate → recover → postmortem**.

**On-call:** Platform SRE + Security Lead. Pager: P1 = financial/PII exposure; P2 = AGK down; P3 = telemetry gap.

## 2. Guardian API down

| Step | Action | Owner |
|------|--------|-------|
| 1 | Confirm \`GET /guardian/v1/health\` failing across cells | SRE |
| 2 | Check K8s pods, DB connection, recent deploy | SRE |
| 3 | **Phase 1.1:** SDK circuit opens → Jarvis continues (fail open) | Auto |
| 4 | Set \`AGK_OBSERVE=off\` if latency/error budget breached | SRE |
| 5 | Page Security if mode=shadow/enforce | Security |
| 6 | Postmortem within 48 h | Platform |

**Do not** restart Jarvis brain to fix Guardian.

## 3. OPA / Cedar policy engine down

| Phase | Action |
|-------|--------|
| 1.1 | N/A — policy not in path |
| 1.2 | Shadow eval skipped; alert \`policy.degraded\`; **no user deny** |
| 1.3 | **Fail closed** L1+; L0 read-only with audit flag; page P1 |

Rollback: \`AGK_POLICY=off\` + revert to observe (see 050).

## 4. Vault down

| Phase | Action |
|-------|--------|
| 1.1 | N/A |
| 1.2 | N/A (no signing in shadow) |
| 1.3 | **Fail closed** for delegation mint, skill verify, secret broker; RO cached certs OK < TTL |

Never paste secrets into prompts. Use break-glass procedure in 021-secrets.md (dual control).

## 5. Event bus (Kafka) down

| Step | Action |
|------|--------|
| 1 | Audit ingest buffers locally (5 min ring); stdout fallback |
| 2 | Alert \`audit.backlog\` if buffer > 80% |
| 3 | If buffer full: drop non-critical events; **never** drop L2+ financial events — sync PG fallback |
| 4 | Restore bus; replay from buffer |

Phase 1.1: user responses unaffected (audit async).

## 6. Audit pipeline down

| Severity | Condition |
|----------|-----------|
| P2 | Kafka down but local buffer OK |
| P1 | Postgres + Kafka both down in enforce mode |

| Phase | Action |
|-------|--------|
| 1.1 | Log to stdout; continue fail open |
| 1.2 | Alert; continue with gap markers |
| 1.3 | **Pause** L2+ enforce until audit path healthy (fail closed) |

**Emergency only:** \`AGK_AUDIT_SYNC_FALLBACK=pg\` — dual-write to Postgres.

## 7. AI Agent compromised (e.g. prompt injection, cert theft)

| Step | Action | Time target |
|------|--------|-------------|
| 1 | Hypervisor **kill** agent instance (\`POST /guardian/v1/kill\` or flag) | < 60 s |
| 2 | Revoke cert / add to CRL | < 5 min |
| 3 | Suspend AI_ID in registry | < 5 min |
| 4 | Preserve audit trail by trace_id | immediate |
| 5 | Notify affected tenants | < 30 min |
| 6 | Forensics per 023-incident-response.md | 24 h |

Jarvis fallback: route to \`localJarvis\` only if owner approves; log \`security.degraded_mode\`.

## 8. Malicious skill detected

| Step | Action |
|------|--------|
| 1 | Revoke skill version in marketplace registry |
| 2 | Hypervisor unload skill from all agents |
| 3 | Block skill_id in policy bundle (1.3+) |
| 4 | Scan audit for skill invocations last 7 days |
| 5 | Publisher suspension per 038-ai-governance.md |

Phase 1.1: skill enforcement N/A — document and prepare revoke list for 1.3.

## 9. Communication template

\`\`\`
[INCIDENT] AGK — <component> — <severity>
Impact: <user-facing | internal only>
Phase: <1.1 observe | 1.2 shadow | 1.3 enforce>
Fail mode: <open | closed>
Action taken: <flag | kill | rollback>
ETA recovery: <time>
\`\`\`

## 10. Escalation

| Severity | Response time | Who |
|----------|---------------|-----|
| P1 | 15 min | Security Lead + Platform Owner |
| P2 | 30 min | SRE on-call |
| P3 | Next business day | AI Platform |
`,

'048-kill-switch-matrix.md': `${HEADER('048 — Kill Switch Matrix', 'FROZEN — Phase 0.6')}

## 1. Principle

Every component must be **isolatable** without cascading platform failure. See 017-ai-hypervisor.md.

## 2. Component matrix

| Component | Kill switch | Isolated shutdown | User / platform impact |
|-----------|-------------|-------------------|------------------------|
| **Jarvis** | \`JARVIS_ENABLED=false\` | ✅ Yes | Users lose AI concierge; Marketplace/Food/Wallet **unaffected** |
| **Hermes** | \`HERMES_ENABLED=false\` | ✅ Yes | Automation stops; manual flows OK |
| **Single skill** | \`SKILL_<id>_DISABLED=true\` | ✅ Yes | That skill only; agent continues |
| **Single AI agent** | Hypervisor kill / suspend AI_ID | ✅ Yes | One instance; scale-out peers OK |
| **Prompt firewall** | \`AGK_FIREWALL=off\` | ✅ Yes | No injection scan; rest of AGK OK |
| **Policy engine** | \`AGK_POLICY=off\` | ✅ Yes | Revert to observe/shadow; **dangerous in 1.3** |
| **Risk engine** | \`AGK_RISK=off\` | ✅ Yes | No risk scores; enforce uses policy only |
| **HITL queue** | \`AGK_HITL=off\` | ⚠️ Partial | Pending approvals stall; L2+ should fail closed |
| **Audit async** | \`AGK_AUDIT=off\` | ⚠️ **Avoid** | Telemetry gap; compliance risk — **emergency only** |
| **Observe tap** | \`AGK_OBSERVE=off\` | ✅ Yes | Zero AGK overhead; Jarvis identical to pre-AGK |
| **Guardian API** | ❌ No hard off | Use **degraded mode** | Must fall back to observe bypass per phase (042) |
| **Event bus** | ❌ No hard off | Pause producers | Buffer locally; never silent drop L2+ |

## 3. Guardian API — degraded modes (not a kill)

| Mode | Env | Behavior |
|------|-----|----------|
| Observe bypass | \`AGK_OBSERVE=off\` | SDK no-op; recommended rollback step 1 |
| Read-only | \`AGK_READ_ONLY=true\` | Health + audit ingest only |
| Maintenance | \`AGK_MAINTENANCE=true\` | 503 on enforce; observe fail open |

## 4. Per-tenant kill

\`\`\`
AGK_TENANT_<tenant_id>_MODE=off|observe|shadow|enforce
\`\`\`

Use for canary rollback without global impact.

## 5. Dependency on kill order (rollback)

1. \`AGK_POLICY=off\`
2. \`AGK_FIREWALL=off\`
3. \`AGK_OBSERVE=off\`
4. Remove SDK from BFF (050)

Never disable Audit before Observe in Phase 1.3 enforce.

## 6. Verification (Phase 1.1 pre-prod drill)

- [ ] Jarvis kill → checkout still works
- [ ] AGK_OBSERVE=off → Sprint 35 regression green
- [ ] Single agent kill → peer handles traffic
`,

'049-feature-flag-strategy.md': `${HEADER('049 — Feature Flag Strategy', 'FROZEN — Phase 0.6')}

## 1. Rule

**Every enforcement capability** ships behind a flag. No enforcement in production without explicit flag + phase gate.

## 2. Canonical flags

| Flag | Phase | Default (prod) | Purpose |
|------|-------|----------------|---------|
| \`AGK_OBSERVE\` | 1.1 | \`on\` (after 1.1 deploy) | Audit tap + telemetry |
| \`AGK_FIREWALL\` | 1.2 | \`off\` | Prompt injection scan (shadow → alert) |
| \`AGK_POLICY\` | 1.3 | \`off\` | OPA/Cedar deny path |
| \`AGK_HITL\` | 1.3 | \`off\` | Human approval queue |
| \`AGK_HYPERVISOR\` | 2+ | \`off\` | Agent kill, quota, scheduler |

Legacy Jarvis flags (\`JARVIS_*\`, \`AIVOS_JARVIS_*\`) remain **independent** — AGK flags do not replace them.

## 3. Mode resolution

\`\`\`
effective_mode = min(global_mode, tenant_mode, canary_mode)
\`\`\`

| global_mode | Meaning |
|-------------|---------|
| \`off\` | SDK no-op |
| \`observe\` | Tap only |
| \`shadow\` | Evaluate + log would-decide |
| \`enforce\` | Deny/HITL active per 042 |

## 4. Per-tenant rollout

\`\`\`json
{
  "tenant_id": "t-acme",
  "agk": {
    "observe": true,
    "firewall": "shadow",
    "policy": "off"
  }
}
\`\`\`

Stored in tenant config service; cached 60 s in SDK.

## 5. Canary deployment

| Stage | Traffic % | Flags |
|-------|-----------|-------|
| Dev | 100% | all enabled for testing |
| Staging | 100% | observe + shadow |
| Prod canary | 1–5% tenants | observe only (1.1) |
| Prod wave | 25 → 50 → 100% | per 051 criteria |

## 6. Fail behavior tied to flags

| Phase | Flag | AGK down |
|-------|------|----------|
| 1.1 | AGK_OBSERVE | Fail open (042) |
| 1.2 | AGK_FIREWALL | Fail open L0; alert L1+ |
| 1.3 | AGK_POLICY | Fail closed L2+ |

## 7. CI guards

- Phase 1.1 branch: \`AGK_POLICY\`, \`AGK_HITL\` must not default \`on\`
- Lint: SDK cannot call \`enforce()\` when \`AGK_OBSERVE\` only
`,

'050-rollback-strategy.md': `${HEADER('050 — Rollback Strategy', 'FROZEN — Phase 0.6')}

## 1. Objective

Revert AGK changes in **< 5 minutes** with **zero Jarvis/Hermes behavior change** and Sprint 35 green.

## 2. Rollback triggers

| Trigger | Action |
|---------|--------|
| Sprint 35 regression fail | Immediate rollback |
| Error rate +0.5% vs baseline | Rollback or AGK_OBSERVE=off |
| p99 latency +10 ms vs 041 budget | AGK_OBSERVE=off first |
| Audit coverage < 99% | Fix forward in 1.1; rollback if unfixable in 30 min |
| Unexpected deny/block | **P1** — full rollback |

## 3. Rollback sequence (ordered)

| Step | Action | Time |
|------|--------|------|
| 1 | Set \`AGK_POLICY=off\`, \`AGK_FIREWALL=off\`, \`AGK_HITL=off\` | 30 s |
| 2 | Set \`AGK_OBSERVE=off\` | 30 s |
| 3 | Deploy BFF **without** \`@aqond/guardian-sdk\` calls (or SDK no-op version) | 2 min |
| 4 | Scale guardian-api to 0 (optional) | 1 min |
| 5 | Restore Kong/routing if changed | 1 min |
| 6 | Run Sprint 35 regression suite | 3 min |

**Total target:** < 5 min to step 3 complete.

## 4. SDK rollback

| Artifact | Rollback |
|----------|----------|
| \`@aqond/guardian-sdk\` | Pin previous version or replace with \`guardian-sdk-noop\` |
| BFF jarvis/route.ts | Remove observeStart/Complete calls (git revert) |
| Env | Remove \`GUARDIAN_API_URL\` |

No database migration rollback required for Phase 1.1.

## 5. Routing restoration

Phase 1.1 must **not** change Kong routes. If added:

\`\`\`
# Remove only if added in 1.1
# /guardian/v1/* → guardian-api
\`\`\`

Jarvis path \`POST /api/ai/jarvis\` unchanged throughout.

## 6. Communication

Notify #platform-incidents with template from 047. Document in postmortem within 48 h.

## 7. Roll forward criteria

Re-enable only after: root cause fixed, regression green, owner approval per 051.
`,

'051-production-acceptance-criteria.md': `${HEADER('051 — Production Acceptance Criteria', 'FROZEN — Phase 0.6')}

## Part A — Phase 0.6 Operational Readiness Gate (before Phase 1.1 code)

Sign-off that operations are ready **before** AGK enters the request path.

### A.1 Documentation

- [x] 047 Emergency Playbook — all 7 incident types
- [x] 048 Kill Switch Matrix
- [x] 049 Feature Flag Strategy
- [x] 050 Rollback Strategy (< 5 min)
- [x] 042 Fail open/closed by phase (canonical)

### A.2 Operational readiness

- [ ] On-call rotation briefed on 047
- [ ] Kill switch drill documented (048)
- [ ] Feature flags in config service (049)
- [ ] Rollback runbook tested in staging (050)
- [ ] Iron rules communicated to engineering (4 rules)

### A.3 Phase 0.6 sign-off

When A.1–A.2 complete:

\`\`\`
PHASE 0.6 APPROVED → START PHASE 1.1 OBSERVE ONLY
\`\`\`

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Platform Owner | | | |
| Security Lead | | | |
| SRE Lead | | | |

---

## Part B — Observe → Soft Enforcement (Phase 1.1 → 1.2)

Do **not** proceed to 1.2 until **all** criteria met for **7 consecutive days** in production or prod-like soak.

| # | Criterion | Target | Measurement |
|---|-----------|--------|-------------|
| 1 | Sprint 35 regression | **100% pass** | CI + manual suite (043) |
| 2 | Error rate delta | **≤ 0%** vs pre-AGK baseline | APM |
| 3 | Latency overhead | p99 **≤ 10 ms** AGK add (041) | Trace |
| 4 | Audit coverage | **100%** Jarvis requests have audit record | Audit DB |
| 5 | AI_ID coverage | **100%** agent-attributed requests | Registry |
| 6 | Trace coverage | **100%** requests have correlation_id + trace_id | Log sample |
| 7 | Telemetry gap rate | **< 0.1%** \`guardian.telemetry_gap\` | Metrics |
| 8 | Fail-open verified | Chaos: AGK down → Jarvis 100% success | Game day |
| 9 | No denials | **0** \`guardian.denied\` in observe | Audit query |
| 10 | Owner approval | Sign-off on 045 + this table | Governance |

---

## Part C — Soft → Hard Enforcement (Phase 1.2 → 1.3)

Additional gates (future):

| # | Criterion | Target |
|---|-----------|--------|
| 1 | Shadow firewall accuracy | FP < 1% on sample |
| 2 | Policy bundle tested | 100% L2+ paths have deny rule |
| 3 | Fail-closed game day | L2+ blocks when OPA down |
| 4 | HITL SLA | < 5 min p95 approval latency |
| 5 | Audit durability | RPO 0 for L2+ events |

---

## Part D — Phase 1.1 iron rules (reference)

1. No Jarvis or Hermes behavior change
2. No block or deny
3. Sprint 35 regression 100%
4. correlation_id + trace_id + AI_ID on every request
`,

'053-kernel-readiness-gate.md': `${HEADER('053 — Kernel Readiness Gate', 'FROZEN — Phase 3.5')}

## Why Phase 4 is blocked

AGK is a **kernel**, not a feature. Smoke tests prove correctness at a point in time; they do not prove survival under failure, memory pressure, sustained load, or adversarial input.

**Marketplace can fail in isolation. AGK failure cascades to Jarvis, Hermes, Wallet, Payment, Rider, Talent, Admin — everything.**

Linux, Windows, and Android kernels ship through Alpha → Beta → RC → Stress → Soak → Chaos before production. AGK follows the same bar.

## Gate criteria (all required)

| # | Pillar | Target | Harness |
|---|--------|--------|---------|
| 1 | **Soak** | 7 consecutive days, 0 probe failures | \`soak-run.mjs\` + \`soak-report.mjs\` |
| 2 | **Chaos** | Random fault every 30 min; Jarvis recovers; recovery time logged | \`readiness/chaos-run.mjs\` |
| 3 | **Memleak** | 72h runtime; heap growth ≤ 15% | \`readiness/memleak-probe.mjs\` + \`memleak-report.mjs\` |
| 4 | **Long context** | 100,000 continuous requests; scheduler admit < 1% false deny | \`readiness/long-context.mjs\` |
| 5 | **Attack sim** | Injection, spoof, replay, burst — all defended | \`readiness/attack-sim.mjs\` |
| 6 | **Regression** | Sprint 35 **8/8** throughout soak window | CI + soak probe |

Aggregate report: \`readiness/readiness-report.mjs\`

## Chaos targets

| Target | Phase 3.5 local | Production |
|--------|-----------------|------------|
| Hypervisor global/agent kill | ✅ live | ✅ |
| Scheduler burst | ✅ live | ✅ |
| Firewall under load | ✅ live | ✅ |
| OPA | stubbed | game day |
| Redis | stubbed | game day |
| Vault | stubbed | game day |
| Event Bus | stubbed | game day |

## CTO sign-off

\`\`\`
PHASE 3.5 APPROVED → START PHASE 4 AI SERVICE MESH
\`\`\`

| Role | Name | Date |
|------|------|------|
| CTO | | |
| SRE Lead | | |
| Security Lead | | |
`,

'054-ai-service-mesh.md': `${HEADER('054 — AI Service Mesh (Phase 4)', 'DRAFT — blocked by 053')}

## Executive summary

AQOND is no longer "Marketplace with AI." It is an **AI-native platform** where AI agents are **population** and AGK is **government** — policy, identity, audit, and kill authority over all workers.

Phase 4 is **not** "Marketplace." It is **AI Service Mesh** — every platform service registers with AGK before it may call or be called by any AI.

\`\`\`
                    AGK (Control Plane)
                         │
    ─────────────────────────────────────────────
    marketplace-v2   wallet-v3   food-v5   crm-v1
    booking-v2       chat-v1     payment   rider
    talent           analytics   recommend …
    ─────────────────────────────────────────────
\`\`\`

## Dual identity model

| ID | Scope | Example |
|----|-------|---------|
| **AI_ID** | Execution plane — untrusted worker | \`jarvis-prod-01\`, \`hermes-worker-01\` |
| **SERVICE_ID** | Data / product plane — trusted service | \`marketplace-v2\`, \`wallet-v3\`, \`food-v5\` |

AGK answers: **who (AI_ID) called whom (SERVICE_ID or AI_ID) with what capability, under which policy.**

## Mesh primitives (Phase 4 scope)

| Primitive | Purpose |
|-----------|---------|
| **Service Registry** | \`POST /guardian/v1/services/register\` |
| **Health Check** | heartbeat + dependency status |
| **Capability Registry** | declared APIs/skills per service |
| **Discovery** | resolve SERVICE_ID → endpoint + version |
| **Capability Negotiation** | AI requests capability; AGK grants scoped token |
| **Version / Compatibility** | semver matrix (043 extended) |

## Marketplace position

Marketplace becomes **one registered service** (\`marketplace-v2\`) — not the phase name. Skill signing and marketplace operations remain under doc 033, executed **through** the mesh.

## Iron rules (unchanged)

1. No Jarvis JSON schema change for L0 paths
2. Sprint 35 regression 100%
3. Every call: correlation_id + trace_id + AI_ID (+ SERVICE_ID when applicable)
4. No service bypasses AGK registration in production
`,

'055-production-confidence-program.md': `${HEADER('055 — Production Confidence Program', 'FROZEN — Phase 3.6')}

## Why Phase 3.5 is not enough

Soak, chaos, memleak, long-context, and attack simulation are **synthetic**. Phase 3.6 proves survival under **real human traffic**.

**Phase 4 remains blocked until 053 + 055 pass.**

## Canary AI rollout

| Window | AGK path | Legacy |
|--------|----------|--------|
| Hour 0 | 10% | 90% |
| +24h | 25% | 75% |
| +48h | 50% | 50% |
| +72h | 75% | 25% |
| +96h | 100% | 0% |

\`AGK_CANARY_PERCENT\` · header \`X-Guardian-Lane\`

## Shadow evaluation

Legacy path is authoritative. Parallel AGK shadow compares every request; mismatches logged immediately.

\`AGK_SHADOW_COMPARE=on\` · \`POST /guardian/v1/confidence/shadow-compare\`

## Guardian Confidence Score

\`GET /guardian/v1/metrics/confidence\` — daily 0–100 composite.

Hard enforcement when \`overall ≥ AGK_CONFIDENCE_GATE\` (default 99): \`AGK_POLICY=confidence\`

## MTTR / MTBF · Black Box

\`GET /guardian/v1/metrics/reliability\` · \`GET /guardian/v1/blackbox/dump\`

## Vision — AI Citizens

AGK as **Digital Government**: AI_ID passport, certificate, permissions, audit history, lifecycle.

> AGK succeeds when capable AI works safely with humans — no one exceeds granted permissions.
`,

'056-governance-validation.md': `${HEADER('056 — Governance Validation', 'FROZEN — Phase 3.7')}

## Why Phase 3.6 is not enough

Phase 3.6 proves the kernel survives **real traffic**. Phase 3.7 proves **humans and operators** use it correctly — and that governance cannot be bypassed.

**Phase 4 blocked until 053 + 055 + 056 pass.**

## Five drills

| # | Drill | Pass criteria | Harness |
|---|-------|---------------|---------|
| 1 | **Insider simulation** | Admin bad actions → detect + audit + approval required | \`governance/insider-sim\` |
| 2 | **Tenant isolation** | Tenant A cannot read Tenant B (even admin) | \`governance/tenant-check\` |
| 3 | **Certificate rotation** | 100 certs rotated; Jarvis zero disruption | \`governance/cert-rotate\` |
| 4 | **DR failover** | Region A down → B; AI_ID unchanged | \`governance/dr-failover\` |
| 5 | **HITL audit** | 100 L2 samples → 100% human approval | \`governance/hitl-audit\` |

Aggregate: \`readiness/governance-validate.mjs\`

## Identity hierarchy (canonical)

\`\`\`
TENANT_ID  →  SERVICE_ID  →  AI_ID

restaurant-0001  →  food-v5  →  hermes-worker-04
\`\`\`

Resolve: \`GET /guardian/v1/identity/resolve/:ai_id\`

AGK answers instantly: *which tenant owns this AI and service?*

## POLICY_ID on every decision

\`\`\`
ALLOW  policy_id=P-1001  baseline.allow.l0
DENY   policy_id=P-448   policy.admin_forbidden.deny
DENY   policy_id=P-3001  tenant.isolation.deny
\`\`\`

Catalog: \`GET /guardian/v1/policies\`

Benefits: audit, explainability, compliance, policy change without code change.

## Long-term roadmap (vision)

| Phase | Name |
|-------|------|
| 0 | Architecture |
| 1 | Guardian Kernel |
| 2 | AI Runtime |
| 3 | Hypervisor |
| 4 | AI Service Mesh |
| 5 | AI Federation |
| 6 | Global AI OS |
| 7 | **Digital Economy Layer** |

Phase 7: external developers, AI + services on one standard — Marketplace, Payment, Food, Talent as **platform citizens**.

## Platform vs Product

Marketplace is a **product**. AGK + AI_ID + Service Mesh + Governance is a **platform** — infrastructure for AI and services to collaborate safely.
`,

'057-identity-hierarchy.md': `${HEADER('057 — Identity Hierarchy (TENANT → SERVICE → AI)', 'FROZEN — Phase 3.7')}

## Three-layer identity

| Layer | ID | Example | Trust |
|-------|-----|---------|-------|
| **Tenant** | \`TENANT_ID\` | \`restaurant-0001\` | Org boundary |
| **Service** | \`SERVICE_ID\` | \`wallet-v3\`, \`food-v5\` | Product plane |
| **AI** | \`AI_ID\` | \`hermes-worker-04\` | Execution plane (untrusted) |

## Authorization question

> AI ตัวนี้อยู่ใน Service ไหน และ Service นี้เป็นของ Tenant ไหน?

\`resolveAiHierarchy(ai_id)\` → \`{ tenant_id, service_id, ai_id }\`

## Tenant isolation rule

**Even platform admin** cannot cross tenant boundary without explicit \`platform_scope\` audit event.

Policy: **P-3001** \`tenant.isolation.deny\`

## Registration

\`POST /guardian/v1/services/register\` — requires valid \`tenant_id\`.

Bindings stored in \`service-registry.json\`.
`,

'058-intent-layer.md': `${HEADER('058 — Intent Layer', 'FROZEN — Phase 3.8')}

## The missing layer

Humans do not think in APIs. They think in **Intent**.

> "หาร้านอาหารญี่ปุ่นใกล้ออฟฟิศ"

Behind one intent, many services collaborate: Location, Marketplace, Food, Wallet, Promotions — but the user has **one intention**.

## AGK authorizes Intent, not API

\`\`\`
User Intent: Place Food Order
        ↓
AGK decomposes → scoped capabilities
        ↓
read.restaurant · read.menu · compute.eta · create.order · pay.checkout (HITL)
\`\`\`

AI does not need to know the whole system — only capabilities **required for this intent**.

## API

| Endpoint | Purpose |
|----------|---------|
| \`GET /guardian/v1/intents\` | Frozen intent catalog |
| \`POST /guardian/v1/intent/authorize\` | Grant intent-bound capabilities |

Env: \`AGK_INTENT=on\`

## Identity stack (complete)

\`\`\`
TENANT_ID → SERVICE_ID → AI_ID → INTENT → POLICY_ID → MISSION_ID
\`\`\`

## The question shift

Not *"What can AI do?"* but **"What should AI be permitted to do?"**
`,

'059-mission-session.md': `${HEADER('059 — Mission Session (MISSION_ID)', 'FROZEN — Phase 3.8')}

## Not login session

**Mission Session** binds one human goal across the entire platform.

> "ช่วยจัดทริปเชียงใหม่ให้หน่อย" → \`mission-839203\`

Every AI, Service, Audit, Policy, Trace attaches to **one mission**.

## Replay question

For any mission, AGK answers:

- Who started?
- Which AI did what?
- Which services were called?
- Which policies applied?
- When did human approve?

## API

| Endpoint | Purpose |
|----------|---------|
| \`POST /guardian/v1/mission/create\` | Open mission |
| \`GET /guardian/v1/mission/:id/timeline\` | Full audit replay |

Env: \`AGK_MISSION=on\`

Header: \`X-Mission-Id\` (future Jarvis wire)
`,

'060-autonomous-collaboration.md': `${HEADER('060 — Phase 8: Autonomous Collaboration', 'VISION')}

## Not AGI — coordinated specialists

Multiple AIs solve one problem. **No god AI.**

| AI | Role |
|----|------|
| Jarvis | Plan |
| Hermes | Orchestrate |
| Finance AI | Budget check |
| Legal AI | Terms |
| Risk AI | Risk score |

All under AGK. **No agent exceeds granted permissions.**

## Why this scales

No central AI must know everything. Intent + Mission + Service Mesh + Federation enable **decentralized intelligence** with **centralized governance**.

## Roadmap

| Phase | Name |
|-------|------|
| 7 | Digital Economy Layer |
| 8 | **Autonomous Collaboration** |
`,

};

Object.entries(files).forEach(([name, body]) => w(name, body));

console.log('\\nAQOND Guardian Kernel architecture documents generated in docs/aqond-os/architecture/guardian/');

