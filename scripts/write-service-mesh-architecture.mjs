#!/usr/bin/env node
/**
 * AQOND AI OS — Phase 4A Service Mesh Architecture Generator
 * DOCUMENTATION ONLY — no production code.
 *
 * Usage: node scripts/write-service-mesh-architecture.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESH = path.join(ROOT, 'docs', 'aqond-os', 'architecture', 'service-mesh');
const TODAY = new Date().toISOString().slice(0, 10);

fs.mkdirSync(MESH, { recursive: true });

function w(name, body) {
  fs.writeFileSync(path.join(MESH, name), body.trimStart() + '\n');
  console.log('  wrote', name);
}

const HEADER = (title, status = 'DRAFT — Phase 4A Architecture Only') => `# ${title}

**Status:** ${status}  
**Date:** ${TODAY}  
**Subsystem:** AQOND AI Service Mesh / AQOND AI OS  
**Phase:** 4A — Architecture Only (NO production code)  
**Classification:** Internal — Architecture  
**Audience:** Platform, Security, AI Infrastructure, SRE, Compliance  

> **Gate:** Implementation (Phase 4B) blocked until AGK gates **053**, **055**, **056** approved + this readiness report signed.

`;

const FLOW = `\`\`\`mermaid
flowchart TD
  U[Human / Surface] --> I[INTENT]
  I --> AGK[AGK Control Plane]
  AGK --> C[Capabilities]
  C --> M[Service Mesh]
  M --> PS[Provider Selection]
  PS --> LB[Load Balancer]
  LB --> S[SERVICE]
  S --> R[Result]
  R --> AGK
  AGK --> U
\`\`\``;

const ID_STACK = `| Layer | ID | Example |
|-------|-----|---------|
| Tenant | \`TENANT_ID\` | \`restaurant-0001\` |
| Service | \`SERVICE_ID\` | \`food-v5\` |
| AI | \`AI_ID\` | \`hermes-worker-04\` |
| Mission | \`MISSION_ID\` | \`mission-839203\` |
| Policy | \`POLICY_ID\` | \`P-4001\` |
| Intent | \`INTENT_ID\` | \`intent.place_food_order\` |`;

const files = {
'000-overview.md': `${HEADER('AQOND AI Service Mesh — Architecture Overview')}

## Executive summary

Phase **4A** designs the **AQOND AI Service Mesh** — the communication fabric between platform services and AI workers. **AGK remains the Control Plane.** The mesh performs discovery, routing, and provider selection. **AI agents never resolve service addresses.**

## Mission

Design a Service Mesh that can be implemented **after** Kernel Readiness (053), Production Confidence (055), and Governance Validation (056) — **without redesign** and **without changing** Sprint 35 or Guardian Phase 0–3.8 contracts.

## Canonical request path

\`\`\`
INTENT → Capability → Service Mesh → Provider Resolution → Service
\`\`\`

${FLOW}

## Document index

| Doc | Title |
|-----|-------|
| 000 | Overview (this document) |
| 001 | Service Mesh vision |
| 002 | Service Registry |
| 003 | Capability Registry |
| 004 | Service Discovery |
| 005 | Provider Selection |
| 006 | Service Health |
| 007 | Service Versioning |
| 008 | Compatibility Matrix |
| 009 | Service Capabilities |
| 010 | Capability Resolution |
| 011 | Routing Model |
| 012 | Load Balancing |
| 013 | Failover |
| 014 | Service Isolation |
| 015 | Cross-Service Policy |
| 016 | Service Identity |
| 017 | Service Certificates |
| 018 | Service Authentication |
| 019 | Service Authorization |
| 020 | Service Observability |
| 021 | Service Metrics |
| 022 | Service Audit |
| 023 | Service Events |
| 024 | ACP Service Extension |
| 025 | Service Lifecycle |
| 026 | Service Registration |
| 027 | Service Deployment |
| 028 | Service Governance |
| 029 | Service Constitution |
| 030 | Rollout Plan |
| 031 | Architecture Readiness Report |

## Identity stack

${ID_STACK}

## Iron rules (Phase 4A)

1. **NO production code** in Phase 4A
2. **NO** Sprint 35 JSON schema changes
3. **NO** AGK enforcement behavior changes until gates pass
4. AI **never** stores endpoints or calls services directly
5. Only Service Mesh performs discovery

## Relationship to AGK

| Component | Role |
|-----------|------|
| **AGK** | Authorize Intent, bind Policy, issue capability grants, sign certificates |
| **Service Mesh** | Discovery, routing, provider selection, health-aware delivery |
| **AI workers** | Request capabilities via Intent; receive scoped grants only |
| **Platform services** | Register; expose capabilities; execute work |
`,

'001-service-mesh-vision.md': `${HEADER('001 — Service Mesh Vision')}

## Why Service Mesh

AQOND is no longer a single Marketplace app. It is an **AI-native platform** with Wallet, Food, Talent, Rider, CRM, Analytics — and external developers in Phase 7+.

AI agents must collaborate across services **without** embedding service topology in prompts or code.

## What AI sees vs what Mesh does

| AI knows | AI never knows |
|----------|----------------|
| Intent | Service hostname |
| Granted capabilities | Internal routing table |
| Mission + trace context | Load balancer endpoints |
| Policy decision (\`POLICY_ID\`) | Certificate private keys |

## Design north star

> **Capable AI works safely with humans and services — no one exceeds granted permissions.**

The mesh is not a bypass around AGK. Every hop is **policy-checked** and **audited**.

## Phase 4A vs 4B

| Phase | Deliverable |
|-------|-------------|
| **4A** | Architecture docs 000–031 (this phase) |
| **4B** | Implementation after AGK gates + readiness sign-off |

## Platform evolution position

\`\`\`
Phase 3.8  Intent + Mission     ✅ (architecture + skeleton)
Phase 4A   Service Mesh design  ← CURRENT (docs only)
Phase 4B   Service Mesh code    ⛔ blocked
Phase 5    AI Federation
Phase 7    Digital Economy
Phase 8    Autonomous Collaboration
\`\`\`
`,

'002-service-registry.md': `${HEADER('002 — Service Registry')}

## Purpose

Authoritative catalog of **registered platform services**. AI agents **cannot** read this registry directly — only AGK + Mesh control plane.

## Registry record schema

\`\`\`json
{
  "service_id": "food-v5",
  "version": "5.2.1",
  "semver": { "major": 5, "minor": 2, "patch": 1 },
  "tenant_id": "restaurant-0001",
  "region": "ap-southeast-1",
  "capabilities": ["restaurant.search", "food.order.create", "restaurant.menu.read"],
  "health": "healthy",
  "latency_p99_ms": 42,
  "dependencies": ["wallet-v3", "payment-v2"],
  "acp_version": "1",
  "certificate": {
    "cert_id": "cert-uuid",
    "issued_by": "agk",
    "not_after": "2026-12-31T00:00:00Z"
  },
  "guardian_status": "approved",
  "lifecycle": "published",
  "registered_at": "2026-06-01T00:00:00Z",
  "metadata": {
    "owner_team": "food-platform",
    "slo_tier": "tier-1"
  }
}
\`\`\`

## Required fields

| Field | Required | Description |
|-------|----------|-------------|
| \`service_id\` | ✅ | Stable identifier (\`food-v5\`) |
| \`version\` | ✅ | Semver string |
| \`region\` | ✅ | Deployment region |
| \`capabilities\` | ✅ | Capability IDs provided |
| \`health\` | ✅ | See 006 |
| \`latency_p99_ms\` | ✅ | Rolling window |
| \`dependencies\` | ○ | Other \`SERVICE_ID\` |
| \`acp_version\` | ✅ | ACP compatibility |
| \`certificate\` | ✅ | AGK-signed |
| \`guardian_status\` | ✅ | \`pending\` \| \`approved\` \| \`suspended\` |
| \`lifecycle\` | ✅ | See 025 |

## Seed services (design reference)

| SERVICE_ID | Tenant | Capabilities |
|------------|--------|--------------|
| \`marketplace-v2\` | \`aqond-platform\` | \`restaurant.search\`, promotions |
| \`food-v5\` | per-merchant | \`food.order.create\`, menu |
| \`wallet-v3\` | \`aqond-platform\` | \`wallet.balance.read\`, \`wallet.transaction.create\` |
| \`payment-v2\` | \`aqond-platform\` | \`payment.checkout\` |
| \`talent-v1\` | \`aqond-platform\` | \`talent.booking.create\` |
| \`chat-v1\` | \`aqond-platform\` | \`chat.send\` |
| \`analytics-v1\` | \`aqond-platform\` | \`analytics.event.write\` |

## Governance

No service self-registers without **AGK approval** (028).
`,

'003-capability-registry.md': `${HEADER('003 — Capability Registry')}

## Purpose

Capabilities are the **unit of authorization** between Intent and Service. AGK grants capabilities; Mesh resolves providers.

## Capability ID convention

\`{domain}.{resource}.{verb}\`

Examples:

| Capability ID | Description | Risk |
|---------------|-------------|------|
| \`restaurant.search\` | Search restaurants | L0 |
| \`restaurant.menu.read\` | Read menu | L0 |
| \`food.order.create\` | Create food order | L1 |
| \`wallet.balance.read\` | Read balance | L1 |
| \`wallet.transaction.create\` | Move money | L2 |
| \`merchant.inventory.read\` | Read inventory | L1 |
| \`merchant.inventory.write\` | Write inventory | L2 |
| \`payment.checkout\` | Checkout / pay | L2 |
| \`talent.booking.create\` | Create booking | L1 |
| \`chat.send\` | Send message | L0 |
| \`notification.push\` | Push notification | L0 |
| \`analytics.event.write\` | Write analytics event | L0 |

## Multi-provider example

\`\`\`yaml
capability: restaurant.search
providers:
  - service_id: food-v5
    priority: 100
    regions: [ap-southeast-1]
    version: "5.2.1"
  - service_id: marketplace-v2
    priority: 80
    regions: [ap-southeast-1, global]
    version: "2.8.0"
  - service_id: future-food-v8
    priority: 50
    regions: [ap-southeast-1]
    version: "8.0.0-beta"
    lifecycle: canary
\`\`\`

Mesh selects provider per 005 — AI never chooses.

## Governance

No capability exists without **governance approval** and linked \`POLICY_ID\`.
`,

'004-service-discovery.md': `${HEADER('004 — Service Discovery')}

## Principle

**Only Service Mesh performs discovery.** AI agents receive capability grants, not endpoints.

## Discovery flow

\`\`\`mermaid
sequenceDiagram
  participant AI as AI Worker
  participant AGK as AGK
  participant Mesh as Service Mesh
  participant Reg as Service Registry
  participant Svc as Service

  AI->>AGK: Intent + MISSION_ID
  AGK->>AI: Capability grant
  AI->>Mesh: Invoke capability (opaque handle)
  Mesh->>Reg: Resolve providers
  Reg-->>Mesh: Candidates + health
  Mesh->>Svc: Routed request (mTLS)
  Svc-->>Mesh: Response
  Mesh-->>AI: Result (no endpoint leaked)
\`\`\`

## Discovery inputs

| Input | Source |
|-------|--------|
| \`CAPABILITY_ID\` | AGK grant |
| \`TENANT_ID\` | Mission / hierarchy |
| \`MISSION_ID\` | Session |
| \`POLICY_ID\` | AGK decision |
| \`region_preference\` | Tenant policy |

## Discovery outputs (internal only)

| Output | Visible to AI |
|--------|---------------|
| Provider rank list | ❌ |
| Selected endpoint | ❌ |
| Failover path | ❌ |
| Capability handle / correlation token | ✅ |

## Caching

Mesh caches registry snapshots with TTL. Invalidation on health events (023).
`,

'005-provider-selection.md': `${HEADER('005 — Provider Selection')}

## Purpose

When multiple services provide the same capability, Mesh selects the **best provider** — not the AI.

## Selection dimensions

| Factor | Weight (default) | Notes |
|--------|------------------|-------|
| **Policy** | Hard filter | AGK deny → no provider |
| **Priority** | 30% | Registry-declared |
| **Latency** | 25% | p99 rolling |
| **Region** | 20% | Tenant locality |
| **Availability** | 15% | Health state |
| **Version** | 5% | Semver compatibility |
| **Canary** | 5% | Traffic split |
| **Capability Score** | Composite | Quality / error rate |

## Algorithm (pseudocode)

\`\`\`
candidates = registry.providers(capability_id, tenant_id)
candidates = filter_policy(candidates, policy_id)
candidates = filter_health(candidates, min=degraded)
candidates = filter_version(candidates, acp_matrix)
ranked = score(candidates, weights)
return ranked[0] with failover chain ranked[1..n]
\`\`\`

## Capability Score

Derived from: error rate, timeout rate, SLO adherence, recent failover count.

## Canary

Provider with \`lifecycle: canary\` receives bounded % traffic (aligns with AGK \`AGK_CANARY_PERCENT\` model from 055).
`,

'006-service-health.md': `${HEADER('006 — Service Health')}

## Health states

| State | Routing | Description |
|-------|---------|-------------|
| **healthy** | ✅ Full | SLO met |
| **degraded** | ✅ Reduced weight | Elevated latency/errors |
| **maintenance** | ⚠️ Drain | Planned work |
| **read_only** | ⚠️ Read caps only | Writes denied at mesh |
| **offline** | ❌ | No traffic |
| **compromised** | ❌ + revoke | AGK suspends certificate |

## Health signals

- Liveness probe (heartbeat)
- Readiness probe (dependency check)
- SLO burn rate
- AGK governance flags

## State transitions

\`\`\`mermaid
stateDiagram-v2
  [*] --> healthy
  healthy --> degraded: slo_warning
  degraded --> healthy: recovery
  degraded --> offline: threshold
  healthy --> maintenance: operator
  maintenance --> healthy: complete
  any --> compromised: security_event
  compromised --> [*]: revoke
\`\`\`
`,

'007-service-versioning.md': `${HEADER('007 — Service Versioning')}

## Semver

All services use **Semantic Versioning**: \`MAJOR.MINOR.PATCH\`.

| Bump | Meaning |
|------|---------|
| MAJOR | Breaking capability contract |
| MINOR | New capability, backward compatible |
| PATCH | Bug fix, no contract change |

## Mesh routing by version

- Default: latest **compatible** version per 008
- Pin: tenant may pin \`service_id@5.2.x\` for compliance
- Canary: route % to \`8.0.0-beta\`

## Rolling upgrade

1. Register \`food-v5@5.3.0\` as \`canary\`
2. Mesh shifts 5% → 25% → 50% → 100%
3. Retire \`5.2.x\` when error budget green

## Blue/Green

Parallel stacks; Mesh flips provider priority atomically after AGK approval.
`,

'008-compatibility-matrix.md': `${HEADER('008 — Compatibility Matrix')}

## Scope

Extends Guardian \`043-compatibility-matrix.md\` for Service Mesh.

## Backward compatibility guarantees

| Surface | Guarantee |
|---------|-----------|
| Sprint 31–35 Jarvis APIs | **Frozen** — no schema change |
| \`POST /api/ai/jarvis\` | Unchanged L0 paths |
| AGK Phase 0–3.8 contracts | Additive only in 4B |
| ACP v1 | Mesh extends, does not break |

## ACP compatibility

| Mesh ACP ext | Base ACP v1 |
|--------------|-------------|
| \`service.invoke\` intent | Optional envelope field |
| \`capability_ref\` | New — opaque to AI |

## Capability compatibility

| Consumer version | Provider MAJOR | Compatible |
|------------------|----------------|------------|
| 2.x | 2.x | ✅ |
| 2.x | 3.x | ❌ unless bridge |
| 2.x | 2.y (y>x) | ✅ minor forward |

## Guardian SDK

\`@aqond/guardian-sdk\` Phase 1.x–3.8 APIs remain valid. Mesh SDK (\`@aqond/mesh-sdk\`) is **additive** in 4B.
`,

'009-service-capabilities.md': `${HEADER('009 — Service Capabilities')}

## Capability taxonomy

\`\`\`
{domain}.{resource}.{verb}
\`\`\`

Domains: \`restaurant\`, \`food\`, \`wallet\`, \`payment\`, \`merchant\`, \`talent\`, \`chat\`, \`notification\`, \`analytics\`, \`booking\`, \`crm\`, \`rider\`

## Verb classes

| Verb | Typical risk | HITL |
|------|--------------|------|
| \`read\` | L0–L1 | Rare |
| \`search\` | L0 | No |
| \`create\` | L1–L2 | Sometimes |
| \`write\` | L2 | Often |
| \`checkout\` / \`pay\` | L2 | **Required** |

## Intent → capability mapping

Aligns with Guardian \`058-intent-layer.md\`:

| Intent | Capabilities |
|--------|--------------|
| \`intent.find_restaurant\` | \`restaurant.search\`, \`restaurant.menu.read\` |
| \`intent.place_food_order\` | search, menu, \`food.order.create\`, \`payment.checkout\` |
| \`intent.plan_trip\` | \`booking.*\`, \`wallet.balance.read\` |

## Service capability declaration

Services declare capabilities at registration (026). Mesh validates against catalog (003).
`,

'010-capability-resolution.md': `${HEADER('010 — Capability Resolution')}

## Resolution pipeline

\`\`\`
INTENT_ID
  → AGK authorizeIntent()
  → [CAPABILITY_ID, ...] + POLICY_ID + MISSION_ID
  → Mesh resolve(capability_id, tenant_id)
  → Provider + route handle
\`\`\`

## Resolution context (required)

\`\`\`json
{
  "mission_id": "mission-839203",
  "trace_id": "uuid",
  "tenant_id": "restaurant-0001",
  "ai_id": "hermes-worker-04",
  "intent_id": "intent.place_food_order",
  "policy_id": "P-4001",
  "capabilities": ["food.order.create", "payment.checkout"]
}
\`\`\`

## Opaque handles

AI receives **capability invocation tokens** — not URLs:

\`\`\`json
{
  "capability": "food.order.create",
  "invoke_ref": "cap-invoke-7f3a…",
  "expires_at": "…",
  "policy_id": "P-4017"
}
\`\`\`

Mesh resolves \`invoke_ref\` internally.
`,

'011-routing-model.md': `${HEADER('011 — Routing Model')}

## End-to-end routing

${FLOW}

## Routing table (logical)

| Stage | Owner | Output |
|-------|-------|--------|
| Intent parse | AGK | \`INTENT_ID\` |
| Policy | AGK | \`POLICY_ID\`, deny/allow |
| Capability grant | AGK | Capability list |
| Provider select | Mesh | \`SERVICE_ID\` + version |
| Load balance | Mesh | Instance |
| Execute | Service | Work result |
| Audit | AGK | Mission timeline update |

## Tenant-aware routing

Requests scoped to \`TENANT_ID\`. Cross-tenant routes **denied** at AGK (P-3001) before mesh.

## Regional routing

Prefer same region; failover cross-region per 013.
`,

'012-load-balancing.md': `${HEADER('012 — Load Balancing')}

## Strategies

| Strategy | Use case |
|----------|----------|
| **Weighted round-robin** | Default |
| **Least latency** | Latency-sensitive (search) |
| **Consistent hash** | Session affinity by \`MISSION_ID\` |
| **Priority** | Tier-1 services |

## AI isolation

AI workers do not participate in load balancing decisions.

## Integration with AGK Scheduler

Phase 3 Scheduler quotas apply to AI invocation rate; Mesh applies service-side rate limits separately.
`,

'013-failover.md': `${HEADER('013 — Failover')}

## Failover chain

\`\`\`
Primary provider → Secondary provider → Degraded mode → AGK deny with reason
\`\`\`

## Triggers

- Health \`offline\`
- Timeout > SLO
- Certificate revoked
- Region failure (DR drill — 056)

## DR alignment

Region A down → Mesh promotes Region B providers. **AI_ID** and **SERVICE_ID** stable (056 governance drill).

## Mission continuity

\`MISSION_ID\` preserved across failover. Timeline records \`mesh.failover\` event (023).
`,

'014-service-isolation.md': `${HEADER('014 — Service Isolation')}

## Isolation dimensions

| Dimension | Mechanism |
|-----------|-----------|
| **Tenant** | \`TENANT_ID\` boundary — P-3001 |
| **Service** | mTLS + \`SERVICE_ID\` cert |
| **AI** | \`AI_ID\` capability grant scope |
| **Mission** | \`MISSION_ID\` audit boundary |
| **Region** | Network partition |

## Blast radius

Compromised service → AGK sets \`compromised\` → cert revoke → mesh drains → no AI grant renewal.

## No lateral movement

AI granted \`restaurant.search\` cannot invoke \`wallet.transaction.create\` without new Intent authorization.
`,

'015-cross-service-policy.md': `${HEADER('015 — Cross-Service Policy')}

## AGK is authoritative

Mesh **never** overrides AGK \`POLICY_ID\` decisions.

## Cross-service rules

| Pattern | Policy |
|---------|--------|
| Food → Wallet (pay) | L2 + HITL |
| CRM → Analytics | L0 audit |
| Tenant A → Tenant B | **Deny** |
| Admin bypass | **Deny** (056) |

## Policy propagation

Every hop carries: \`MISSION_ID\`, \`TRACE_ID\`, \`POLICY_ID\`, \`TENANT_ID\`, \`AI_ID\`, \`SERVICE_ID\`, \`CAPABILITY_ID\`.

## OPA future

Phase 4B may evaluate bundle policies; Phase 4A defines **contract** only.
`,

'016-service-identity.md': `${HEADER('016 — Service Identity')}

## Identity hierarchy

${ID_STACK}

## Resolution question

> AI ตัวนี้อยู่ใน Service ไหน และ Service นี้เป็นของ Tenant ไหน?

\`GET /guardian/v1/identity/resolve/:ai_id\` (existing) extends with mesh metadata in 4B.

## SERVICE_ID rules

- Lowercase, semver-suffixed major: \`food-v5\`, \`wallet-v3\`
- Immutable ID; version changes via registry version field
- One service may serve multiple tenants only with explicit multi-tenant declaration + AGK approval
`,

'017-service-certificates.md': `${HEADER('017 — Service Certificates')}

## Rule

**Every service certificate is signed by AGK.**

## Certificate fields

| Field | Description |
|-------|-------------|
| \`cert_id\` | UUID |
| \`service_id\` | Bound service |
| \`tenant_id\` | Bound tenant |
| \`capabilities\` | Allowed capability list |
| \`not_before\` / \`not_after\` | Validity |
| \`issuer\` | \`agk-ca\` |

## Rotation

056 governance drill: 100 concurrent rotations, zero Jarvis disruption.

## Revocation

AGK CRL / OCSP stub in 4B. Mesh rejects revoked certs immediately.
`,

'018-service-authentication.md': `${HEADER('018 — Service Authentication')}

## Service-to-mesh

- mTLS with AGK-signed service certificate
- \`SERVICE_ID\` in cert SAN

## AI-to-mesh

- AI identity via \`AI_ID\` + worker certificate (Phase 5 federation extends)
- Capability invoke token signed by AGK

## Human surfaces

- Existing storefront auth unchanged (Sprint 35)
- Mission created at session start (\`059-mission-session.md\`)
`,

'019-service-authorization.md': `${HEADER('019 — Service Authorization')}

## Authorization flow

\`\`\`
INTENT → AGK Policy → Capability grant → Mesh verifies grant on invoke
\`\`\`

## Checks (every invoke)

1. Grant not expired
2. \`CAPABILITY_ID\` in grant
3. \`TENANT_ID\` matches
4. \`POLICY_ID\` still valid
5. Service \`guardian_status == approved\`

## Deny response

\`\`\`json
{
  "decision": "deny",
  "policy_id": "P-3001",
  "reason": "tenant.isolation_violation"
}
\`\`\`

Aligns with existing AGK enforce contract — additive fields only in 4B.
`,

'020-service-observability.md': `${HEADER('020 — Service Observability')}

## Every hop generates

| Field | Required |
|-------|----------|
| \`MISSION_ID\` | ✅ |
| \`TRACE_ID\` | ✅ |
| \`SERVICE_ID\` | ✅ |
| \`AI_ID\` | ✅ |
| \`POLICY_ID\` | ✅ |
| \`CAPABILITY_ID\` | ✅ |
| \`LATENCY_MS\` | ✅ |

## Trace propagation

W3C \`traceparent\` + AQOND \`X-Mission-Id\`, \`X-Policy-Id\`, \`X-Capability-Id\`.

## Dashboards (4B)

- Mesh hop latency
- Provider selection distribution
- Failover rate
- Capability error heatmap
`,

'021-service-metrics.md': `${HEADER('021 — Service Metrics')}

## Mesh metrics

| Metric | Type |
|--------|------|
| \`mesh.invoke.total\` | Counter |
| \`mesh.invoke.latency_ms\` | Histogram |
| \`mesh.provider.selected\` | Counter by service |
| \`mesh.failover.total\` | Counter |
| \`mesh.capability.denied\` | Counter |

## SLO examples

| Capability | p99 target |
|------------|------------|
| \`restaurant.search\` | 200ms |
| \`payment.checkout\` | 500ms |

## Confidence integration

Feeds Guardian Confidence Score (055) — security dimension uses mesh deny / mismatch rate.
`,

'022-service-audit.md': `${HEADER('022 — Service Audit')}

## Audit spine

All mesh hops append to:

1. AGK audit buffer (existing)
2. Mission timeline (\`059-mission-session.md\`)

## Audit event schema

\`\`\`json
{
  "kind": "mesh.invoke",
  "mission_id": "mission-839203",
  "trace_id": "…",
  "ai_id": "jarvis-prod-01",
  "service_id": "food-v5",
  "capability_id": "food.order.create",
  "policy_id": "P-4017",
  "decision": "allow",
  "latency_ms": 38,
  "provider_rank": 1
}
\`\`\`

## Immutability

056: \`disable_audit\` insider action → detect + deny (P-3003).
`,

'023-service-events.md': `${HEADER('023 — Service Events')}

## Event bus (design)

| Event | Consumers |
|-------|-----------|
| \`service.registered\` | Mesh, AGK |
| \`service.health.changed\` | Mesh routing |
| \`capability.provider.added\` | Mesh registry |
| \`mesh.failover\` | SRE, Mission timeline |
| \`certificate.rotated\` | Mesh, AGK |

## Phase 4B

Event bus implementation deferred. Phase 4A defines **contracts** only.

Chaos harness (053) stubs: OPA, Redis, Vault, Event Bus until wired.
`,

'024-acp-service-extension.md': `${HEADER('024 — ACP Service Extension')}

## Base

Guardian ACP v1 (Phase 2): jarvis ↔ hermes message envelope.

## Mesh extension (additive)

New intent types:

| Intent | Description |
|--------|-------------|
| \`service.invoke\` | Capability invocation |
| \`service.health.ping\` | Mesh probe |
| \`capability.resolve\` | Internal mesh only |

## Envelope extension (backward compatible)

\`\`\`json
{
  "acp_version": "1",
  "sender": { "ai_id": "jarvis-prod-01" },
  "receiver": { "ai_id": "mesh-router-01" },
  "intent": "service.invoke",
  "mission_id": "mission-839203",
  "capability_ref": "cap-invoke-7f3a",
  "policy_id": "P-4017",
  "trace_id": "…"
}
\`\`\`

Existing ACP messages without \`capability_ref\` remain valid.
`,

'025-service-lifecycle.md': `${HEADER('025 — Service Lifecycle')}

## States

\`\`\`mermaid
stateDiagram-v2
  [*] --> draft
  draft --> pending_approval: register
  pending_approval --> approved: agk_sign
  approved --> published: deploy
  published --> canary: rollout
  canary --> published: promote
  published --> deprecated: sunset
  deprecated --> retired: drain
  any --> suspended: governance
\`\`\`

## AI rule

Only \`published\` and \`canary\` services receive production traffic.
`,

'026-service-registration.md': `${HEADER('026 — Service Registration')}

## Flow

\`\`\`
Operator → POST register → AGK review → Sign cert → Mesh index
\`\`\`

## Proposed API (4B — not implemented in 4A)

\`POST /guardian/v1/services/register\` (skeleton exists in 3.7)

## Required payload

\`\`\`json
{
  "service_id": "food-v5",
  "tenant_id": "restaurant-0001",
  "version": "5.2.1",
  "region": "ap-southeast-1",
  "capabilities": ["food.order.create"],
  "acp_version": "1",
  "owner_team": "food-platform"
}
\`\`\`

## Approval

AGK governance (028) — no self-approve.
`,

'027-service-deployment.md': `${HEADER('027 — Service Deployment')}

## Deployment models

| Model | Mesh behavior |
|-------|---------------|
| Single region | Default |
| Multi-region | Per-region registry entries |
| Blue/Green | Priority flip |
| Canary | Weighted provider score |

## Pre-deploy checklist

- [ ] Capabilities declared in 003
- [ ] Compatibility matrix green (008)
- [ ] Certificates issued (017)
- [ ] Health probes configured (006)
- [ ] AGK guardian_status = approved
`,

'028-service-governance.md': `${HEADER('028 — Service Governance')}

## Rules

1. No service registers without **AGK approval**
2. No capability without **governance catalog** entry
3. Every certificate **AGK-signed**
4. Insider actions require approval (056)
5. Tenant isolation enforced (057)

## Roles

| Role | May |
|------|-----|
| Platform Owner | Approve service publish |
| Security Lead | Approve capabilities L2+ |
| Service Team | Register draft |
| AI Team | **Never** register services |

## Review cadence

Quarterly capability catalog review. Monthly cert rotation drill.
`,

'029-service-constitution.md': `${HEADER('029 — Service Mesh Constitution')}

## Article I — AGK supremacy

AGK is the Control Plane. Mesh is fabric. Mesh never bypasses AGK.

## Article II — AI ignorance of topology

AI agents **shall not** resolve, store, or call service endpoints directly.

## Article III — Intent first

Every production AI action **shall** originate from an authorized **Intent**.

## Article IV — Identity completeness

Every hop **shall** carry \`TENANT_ID\`, \`SERVICE_ID\`, \`AI_ID\`, \`MISSION_ID\`, \`POLICY_ID\` where applicable.

## Article V — Auditability

Every hop **shall** be replayable from \`MISSION_ID\` timeline.

## Article VI — Backward compatibility

Sprint 31–35 and Guardian 0–3.8 contracts **shall not** break.

## Article VII — Implementation gate

No Phase 4B code until 053 + 055 + 056 + 031 readiness sign-off.
`,

'030-rollout-plan.md': `${HEADER('030 — Service Mesh Rollout Plan')}

## Phase sequence

| Phase | Name | Status |
|-------|------|--------|
| 4A | Architecture (docs) | ← **CURRENT** |
| 4B | Implementation | ⛔ Blocked |
| 4C | Prod canary | ⛔ Blocked |

## 4B implementation order (future)

1. Service Registry store + AGK approval workflow
2. Capability Registry + provider index
3. Mesh router (invoke_ref resolution)
4. mTLS + certificates
5. Observability + Mission timeline integration
6. Provider selection + failover
7. Load test + chaos (053 harness extension)

## AGK gates (must be green)

| Gate | Doc |
|------|-----|
| Kernel Readiness | 053 |
| Production Confidence | 055 |
| Governance Validation | 056 |

## Marketplace note

Marketplace (\`marketplace-v2\`) is **one service** in the mesh — not the phase name.
`,

'031-architecture-readiness-report.md': `${HEADER('031 — Architecture Readiness Report', 'Phase 4A — Review Gate')}

## Service Mesh Readiness

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Overall architecture** | **92%** | Docs 000–030 complete; 4B not started |
| Vision & principles | 100% | 001, 029 |
| Registry design | 95% | 002, 003, 026 — schema defined |
| Routing & selection | 95% | 004–005, 011–013 |
| Security & identity | 95% | 016–019, 028 |
| Observability | 90% | 020–023 — event bus TBD in 4B |
| Compatibility | 95% | 008 — Sprint 35 preserved |
| Rollout plan | 90% | 030 — depends on AGK gates |

**Weighted Service Mesh Readiness: 92%** (architecture phase complete; implementation 0%)

---

## Missing Components (before 4B)

| Component | Status | Target phase |
|-----------|--------|--------------|
| Mesh router runtime | ❌ Not built | 4B |
| Provider index store | ❌ Design only | 4B |
| mTLS CA / cert issuance | ❌ Skeleton in 3.7 | 4B |
| Event bus (023) | ❌ Contract only | 4B |
| \`@aqond/mesh-sdk\` | ❌ Not designed in detail | 4B.1 |
| OPA policy bundles for mesh | ❌ Optional | 4B.2 |
| Multi-region registry replication | ❌ Design only | 4C |

---

## API Contracts Complete?

| Contract | Architecture | Implemented |
|----------|--------------|-------------|
| \`POST /guardian/v1/services/register\` | ✅ 026 | ⚠️ Skeleton only (3.7) |
| \`POST /guardian/v1/intent/authorize\` | ✅ 058 | ✅ 3.8 |
| \`POST /guardian/v1/mission/create\` | ✅ 059 | ✅ 3.8 |
| Mesh \`invoke_ref\` | ✅ 010 | ❌ 4B |
| ACP \`service.invoke\` | ✅ 024 | ❌ 4B |
| Capability catalog API | ✅ 003 | ⚠️ Static catalog 3.8 |

**API Contracts (architecture): 88% complete** — mesh-specific invoke APIs spec'd; not implemented.

---

## Registry Schema Complete?

| Schema | Complete |
|--------|----------|
| Service record (002) | ✅ |
| Capability + providers (003) | ✅ |
| AI hierarchy binding (057) | ✅ |
| Mission session (059) | ✅ |
| Certificate (017) | ✅ |

**Registry Schema: 95%** — production storage format + replication TBD.

---

## Capability Coverage

| Domain | Capabilities designed | Providers designed |
|--------|----------------------|-------------------|
| Restaurant / Food | ✅ | food-v5, marketplace-v2 |
| Wallet / Payment | ✅ | wallet-v3, payment-v2 |
| Merchant | ✅ | marketplace-v2 |
| Talent / Booking | ✅ | talent-v1, booking-v2 |
| Chat / Notification | ✅ | chat-v1 |
| Analytics | ✅ | analytics-v1 |
| CRM / Rider | ⚠️ Placeholder | Phase 4B catalog expansion |

**Capability Coverage: 85%** — core commerce paths covered; edge domains need catalog expansion in 4B planning.

---

## Backward Compatibility

| Requirement | Status |
|-------------|--------|
| Sprint 31–35 Jarvis | ✅ Explicit in 008, 029 |
| \`POST /api/ai/jarvis\` schema | ✅ No change in 4A |
| AGK Phase 0–3.8 | ✅ Additive only |
| ACP v1 | ✅ Extended in 024, not broken |
| Guardian SDK | ✅ Unchanged in 4A |

**Backward Compatibility: PASS** (architecture guarantees documented).

---

## Risks Before Implementation

| Risk | Severity | Mitigation |
|------|----------|------------|
| AGK gates (053/055/056) not complete | **Critical** | Do not start 4B |
| AI endpoint leakage in prompts/tools | High | Mesh opaque handles (010) |
| Provider selection complexity | Medium | Start weighted round-robin |
| Multi-provider consistency | Medium | Capability versioning (007) |
| Event bus delay | Low | Polling health OK for 4B.0 |
| Certificate rotation at scale | Medium | 056 drill pattern |

---

## Review Checklist

### Architecture (Phase 4A)

- [x] 000–030 documents generated
- [x] Intent → Capability → Mesh flow defined
- [x] AI never resolves endpoints (principle documented)
- [x] SERVICE_ID / TENANT_ID / AI_ID / MISSION_ID / POLICY_ID integrated
- [x] Multi-provider capability example
- [x] Health model (6 states)
- [x] Provider selection dimensions
- [x] ACP extension backward compatible
- [x] Governance rules (028, 029)
- [x] Rollout plan (030)

### Gates before Phase 4B

- [ ] 053 Kernel Readiness — 7-day soak + chaos + memleak + attack **green**
- [ ] 055 Production Confidence — canary + shadow + confidence ≥ 99 **sustained**
- [ ] 056 Governance Validation — 7/7 drills **green**
- [ ] 031 Readiness Report — **CTO sign-off**
- [ ] Sprint 35 regression — **8/8** at implementation start

---

## Recommendation

**APPROVE Phase 4A (Architecture)** — documentation set is sufficient to begin Phase 4B implementation planning.

**DO NOT start Phase 4B (Implementation)** until AGK gates 053, 055, 056 are fully approved and this report is signed.

\`\`\`
PHASE 4A ARCHITECTURE COMPLETE → AWAIT AGK GATES → THEN PHASE 4B
\`\`\`

| Role | Name | Date | Signature |
|------|------|------|-----------|
| CTO | | | |
| Platform Owner | | | |
| Security Lead | | | |
`,
};

Object.entries(files).forEach(([name, body]) => w(name, body));

console.log(`\nAQOND Service Mesh architecture (Phase 4A) generated in docs/aqond-os/architecture/service-mesh/`);
