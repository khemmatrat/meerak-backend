#!/usr/bin/env python3
"""Generate scripts/phase20_v13_addendum.md (sections 44-50)."""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "phase20_v13_addendum.md"

CONTENT = r"""
# 44. GROWTH API COMPATIBILITY POLICY

**Path:** `/api/aivos/growth/*`

**Purpose:** Guarantee that clients (Web, iOS, Android, SDK, partner integrations) built against Growth v1 never break when new capabilities ship. Growth HTTP surface follows the same **additive-only** contract as the rest of AIVOS.

**Violation = FAIL** for any Growth release that removes endpoints, renames fields in existing responses, or changes semantics of existing query parameters without a new major version path.

---

## 44.1 Core Rules

| Rule | Requirement |
|---|---|
| **API-1** | **Additive only** — new endpoints, optional response fields, and optional request fields are permitted; breaking changes are not. |
| **API-2** | **No response shape regression** — existing JSON keys, types, and enum values in published responses MUST remain stable. New fields MUST be optional with documented defaults. |
| **API-3** | **No endpoint removal** — deprecated endpoints enter a sunset period (minimum 2 minor releases) and return `Deprecation` + `Sunset` headers before removal in a **new major version path only**. |
| **API-4** | **Version when necessary** — breaking changes require a new path prefix: `/api/aivos/growth/v2/*`. v1 remains available until explicit EOL announcement (minimum 6 months). |
| **API-5** | **SDK parity** — `sdk.growth.*` method signatures follow the same additive-only rules as HTTP (§29.17). |
| **API-6** | **Error contract stable** — existing `error.code` values MUST NOT change meaning. New codes are additive. |

---

## 44.2 URL Layout

```
/api/aivos/growth/           ← v1 implicit (current)
/api/aivos/growth/v1/        ← v1 explicit (alias, recommended for external partners)
/api/aivos/growth/v2/        ← future major version only when API-4 triggered
```

**Current v1 routes (§6)** remain at `/api/aivos/growth/*` for backward compatibility. New external integrations SHOULD use `/api/aivos/growth/v1/*` alias routes registered to the same handlers.

---

## 44.3 Response Evolution Pattern

**Permitted (non-breaking):**

```json
{
  "ok": true,
  "data": {
    "missionId": "m-1",
    "status": "active",
    "priority": 80
  },
  "meta": { "version": "20.1.0" }
}
```

**v20.2 additive field (OK):**

```json
{
  "ok": true,
  "data": {
    "missionId": "m-1",
    "status": "active",
    "priority": 80,
    "estimatedMinutes": 15
  },
  "meta": { "version": "20.2.0" }
}
```

**Forbidden without /v2:**

- Renaming `missionId` → `id`
- Changing `status: "active"` to `status: 1`
- Removing `priority`
- Changing `ok: true` envelope to bare object

---

## 44.4 Deprecation Workflow

1. Mark endpoint `@deprecated` in OpenAPI + `sdk/growth/CHANGELOG.md`.
2. Add response headers: `Deprecation: true`, `Sunset: <RFC 7231 date>`, `Link: </api/aivos/growth/v2/...>; rel="successor-version"`.
3. Log `growth.api.deprecated` audit event per call (Governance).
4. Minimum **2 minor releases** at warning level before v1 route returns `410 Gone` with redirect body.
5. v1 alias handlers MAY remain as thin proxies to v2 for an additional release cycle.

---

## 44.5 Compatibility Test Gate

| Test | Assertion |
|---|---|
| GRW25 | Snapshot tests for all v1 response shapes; new fields allowed; removed/renamed fields FAIL |
| Contract diff | CI compares OpenAPI v1 spec against previous release — breaking diff blocks merge |

---

## 44.6 Client Guidance

| Client | Policy |
|---|---|
| Web / Mobile | Ignore unknown response fields; never depend on field order |
| SDK | Typed interfaces versioned `20.x.y`; patch = additive, minor = new methods, major = new namespace only with `/v2` |
| Skills | Use `sdk.growth.*` only — never hardcode HTTP paths |
| Partners | Pin to `/api/aivos/growth/v1/*`; subscribe to CHANGELOG |

---

# 45. DATA LIFECYCLE & RETENTION POLICY

**Purpose:** Define TTL, archival, and purge rules for Growth-owned storage (§37) to control cost, GDPR/privacy compliance, and operational predictability.

**Principle:** Retention applies to **Growth namespaces only**. Source-of-truth data in Workflow, Billing, Tenant, etc. follows those engines' policies — Growth never duplicates long-term archives of foreign data.

---

## 45.1 Retention Schedule

| Data Class | Storage Key Pattern | Retention | On Expiry | Compliance Notes |
|---|---|---|---|---|
| **Mission History** | `growth.mission::{tenantId}::*` | **365 days** from `completedAt` or `expiredAt` | Archive summary → cold store 90d → purge | Audit trail via Governance events retained 7y |
| **Feed Cache** | `growth.feed::{tenantId}::{userId}` | **7 days** | Hard delete | Materialized view only — rebuild from events |
| **Notifications** | `growth.notification.queue::{tenantId}` | **90 days** from `sentAt` | Purge | Read receipts purged with parent |
| **Journey** | `growth.journey::{tenantId}::{userId}` | **Tenant lifetime** | Purge on `tenant.purged` event | Export on tenant offboarding (§18) |
| **Recommendation Cache** | `growth.recommendation::{tenantId}::{userId}` | **7 days** from `createdAt` | Hard delete | Source recommendations not stored (§37 DM-4) |
| **Habit** | `growth.habit::{tenantId}::{userId}` | **User lifetime** | Purge on `user.deleted` / tenant purge | Streak history exportable via GDPR request |
| **Reward Ledger** | `growth.reward.ledger::{tenantId}` | **7 years** (financial adjacency) | Archive then purge | Append-only; never truncate active balances |
| **GrowthProfile** | `growth.profile::{tenantId}::{userId}` | **User lifetime** | Purge on user/tenant delete | Persona PII scrubbed on delete |
| **Morning/Evening Brief** | `growth.brief::{tenantId}::{userId}::{date}` | **90 days** | Purge | Regenerable from events |
| **GrowthLoopState** | `growth.loop::{tenantId}::{userId}` | **30 days** rolling | Overwrite on new cycle | Ephemeral session state |
| **KPI Rollups** | `growth.kpi::{tenantId}::*` | **3 years** daily; **7 years** monthly aggregates | Tiered archive | Anonymize user-level after 365d |
| **ChurnScore** | `growth.churn::{tenantId}::{userId}` | **180 days** | Purge | Snapshot only |
| **Event Idempotency Keys** | `growth.event.dedup::*` | **14 days** | Hard delete | Bridge housekeeping |

---

## 45.2 Lifecycle States

```
ACTIVE → AGING → ARCHIVED → PURGED
```

| State | Description | User Visible |
|---|---|---|
| **ACTIVE** | Within retention window | Yes |
| **AGING** | Past soft TTL; excluded from Feed/default queries | No (admin export only) |
| **ARCHIVED** | Cold storage; rehydrate on legal hold | No |
| **PURGED** | Cryptographic erase / key deletion | No |

---

## 45.3 Purge Triggers

| Event | Action |
|---|---|
| `tenant.purged` | Cascade purge all `growth.*::{tenantId}::*` per schedule above |
| `user.deleted` | Purge user-scoped keys; anonymize ledger references |
| `growth.retention.job` | Nightly cron — apply TTL per §45.1 |
| `governance.legal_hold` | Suspend purge for affected tenant until released |

**Growth MUST emit** `growth.data.purged` with `{ dataClass, count, tenantId }` — no PII in payload.

---

## 45.4 Storage & Compliance

| Concern | Policy |
|---|---|
| **GDPR right to erasure** | `user.deleted` triggers habit, profile, persona, notification purge within 72h |
| **Data minimization** | Feed and recommendation caches are short-TTL by design (DM-5) |
| **Cross-border** | Tenant data residency flag respected — purge jobs run in tenant region |
| **Audit** | Purge actions logged to Governance — not to Analytics raw stream |

---

## 45.5 Retention Job Architecture

```
growth/retention/
  retentionScheduler.js    # nightly cron
  retentionPolicies.js     # §45.1 table as code
  archiveStore.js          # cold tier adapter
```

**Feature flag:** `AIVOS_GROWTH_RETENTION_ENABLED` (default ON when Growth enabled).

---

# 46. GROWTH EXTENSION POLICY

**Purpose:** Lock AQOND's platform advantage — **one Growth Experience Layer** serves every vertical. New business domains extend through Skill → Workflow → Application → Growth; they MUST NOT fork or duplicate Growth.

**This is a platform invariant.** Violation = architecture FAIL.

---

## 46.1 The Extension Stack (Mandatory)

Every new AQOND vertical MUST integrate through this stack only:

```
Skill  →  Workflow  →  Application  →  Growth
  │           │              │              │
  │           │              │              └── Experience: Feed, Mission, Reward, NBA, Brief
  │           │              └── Installable product surface (Phase 17)
  │           └── Orchestrated execution (Phase 16)
  └── Atomic AI capability (Phase 14)
```

**Forbidden pattern:**

```
❌ AI Resume Growth
❌ AI Restaurant Growth
❌ AI Food Growth Engine
❌ Vertical-specific Feed/Mission/Reward fork
```

---

## 46.2 Certified Verticals (Examples)

All verticals below share **one** `runtime.growth` — differentiated by Application manifest + Skills + Workflow templates + Growth persona signals:

| Vertical | Application ID (example) | Skills (examples) | Growth Consumption |
|---|---|---|---|
| AI Resume | `app-resume-ai` | `resume.generate`, `resume.optimize` | Missions: "Update resume today" |
| AI Restaurant | `app-restaurant-ai` | `menu.generate`, `review.reply` | Feed: new reviews, mission: reply |
| AI Food | `app-food-ai` | `recipe.create`, `nutrition.analyze` | Habit: daily menu post |
| AI Marketplace | `app-marketplace-ai` | `listing.optimize`, `price.suggest` | NBA: upload products |
| AI Hotel | `app-hotel-ai` | `booking.reply`, `rate.optimize` | Brief: occupancy snapshot |
| AI Insurance | `app-insurance-ai` | `policy.explain`, `claim.draft` | Journey: onboarding stages |
| AI Lawyer | `app-lawyer-ai` | `contract.review`, `clause.suggest` | Mission: review pending docs |
| AI Health | `app-health-ai` | `intake.summarize`, `appointment.remind` | Notification: patient follow-up |
| AI Finance | `app-finance-ai` | `report.generate`, `tax.estimate` | KPI: RPU, LTV via events |
| AI Tutor | `app-tutor-ai` | `lesson.plan`, `quiz.generate` | Habit: daily study streak |
| AI Real Estate | `app-realestate-ai` | `listing.write`, `lead.qualify` | Feed: new leads |
| AI Beauty | `app-beauty-ai` | `content.create`, `booking.confirm` | Mission: post today's reel |

**Registration:** Each vertical registers via `runtime.applications.install()` — Growth discovers capabilities through `application.installed` event (§30), not hardcoded vertical lists.

---

## 46.3 Vertical Extension Checklist

| Step | Owner | Growth Touchpoint |
|---|---|---|
| 1. Define Skills | Skills team | None — Skills do not import Growth |
| 2. Compose Workflow | Workflow team | Emit `workflow.completed` |
| 3. Package Application | Application team | Emit `application.installed` |
| 4. Map to Growth | Growth team (config only) | Mission templates, feed rules, persona weights |
| 5. Personalize | Growth (automatic) | Personal AI learns from vertical events |

**No new Growth module per vertical.** Configuration lives in `growth/verticals/{appId}.json` (manifest overlays) — additive config files, not code forks.

---

## 46.4 Engine vs Experience Separation

AQOND architecture explicitly separates **Engines** (compute/optimize) from **Experience** (user-facing loop):

| Layer | Role | Examples | Growth Relationship |
|---|---|---|---|
| **Engine** | Analyze, optimize, automate, monetize | Learning, Optimization, Automation, Revenue, Analytics, Knowledge | Growth **consumes** via events + §32 adapters |
| **Experience** | Daily loop, habit, mission, feed, reward | **Growth only** | Owns user-facing state (§37) |
| **Execution** | Run work | Workflow, Orchestrator, Skills | Growth **delegates** execute (§38.3) |
| **Platform** | Install, bill, integrate | Application, Tenant, Billing, Integration, Marketplace | Growth **subscribes** to events |

```
Engines (headless)          Experience (face)
─────────────────          ──────────────────
Learning                   Growth Feed
Optimization        →      Growth Mission
Automation                 Growth Reward
Revenue                    Growth Brief / NBA
Knowledge                  Growth Journey / Habit
```

**Growth is NOT an Engine.** It must not implement video generation, ML training, payment processing, or workflow execution — only orchestrate the experience atop those capabilities.

---

## 46.5 Extension Anti-Patterns (Forbidden)

| Anti-Pattern | Why Forbidden | Correct Approach |
|---|---|---|
| `growth/resume/` module | Vertical fork | `growth/verticals/app-resume-ai.json` |
| Custom Feed per vertical | Fragmented UX | Feed ranking weights in persona config |
| Duplicate mission engine in Application | Ownership violation (§37) | Application emits events; Growth assigns missions |
| Skill imports `runtime.growth` | Layer breach (§29) | Skill → Workflow → event → Growth |
| New `/api/aivos/resume/growth/*` | API sprawl | `/api/aivos/growth/*` only |

---

# 47. PHASE 20 FORBIDDEN MODIFICATIONS

**Purpose:** Explicit lock on what Phase 20 implementation MUST NOT touch. Growth is a **consumer** of platform capabilities through DI and Events only.

**Any PR modifying the modules below for Growth purposes = REJECT.**

---

## 47.1 Absolute Prohibitions

| # | Module / Area | Rule |
|---|---|---|
| **F-1** | **Runtime Contract** | No changes to `runtime/index.js` attachment order semantics, existing runtime APIs, or Kernel-facing contracts. Only **additive** `runtime.growth` attachment permitted (§5). |
| **F-2** | **Billing** | No modifications to billing modules, credit logic, or `deps.growthEngine` interface. Growth reads `billing.paid` events only. |
| **F-3** | **Revenue** | No modifications to `createRevenueGrowthEngine()` or Revenue modules. Growth consumes Revenue via §32 adapter. |
| **F-4** | **Marketplace** | No modifications to marketplace catalog, install flow, or pricing. Growth reacts to `marketplace.*` events. |
| **F-5** | **Workflow** | No modifications to workflow engine, state machine, or run storage. Growth delegates execute via existing APIs. |
| **F-6** | **Skill** | No modifications to skill registry, execution, or sandbox. Skills MUST NOT gain Growth imports. |
| **F-7** | **Knowledge** | No modifications to knowledge graph, indexing, or retrieval. Growth consumes `knowledge.updated` events. |
| **F-8** | **Tenant** | No modifications to tenant provisioning, isolation, or billing linkage. Growth uses `runtime.tenants` read-only via DI. |
| **F-9** | **Integration** | No modifications to connectors, OAuth, or gateway. Growth uses integration events and optional `growth/integration/*` **wrappers** (Growth-owned only). |

---

## 47.2 Additional Prohibitions (Inherited from § ABSOLUTE ARCHITECTURE RULES)

| # | Area | Rule |
|---|---|---|
| **F-10** | Pipeline | No redesign |
| **F-11** | Orchestrator | No replacement — delegate only |
| **F-12** | Kernel | No imports |
| **F-13** | Existing Engine contracts | Analytics, Learning, Optimization, Automation, Governance, QA — adapters only |
| **F-14** | Existing tests (351) | Zero modifications |
| **F-15** | Phases 1–19 production modules | Bugfixes unrelated to Growth only — no Growth-driven refactors |

---

## 47.3 Permitted Growth Integration Points

Growth MAY only integrate through these **approved seams**:

| Seam | Direction | Example |
|---|---|---|
| `runtime.growth` | Attach after `integrations` | DI registration |
| `runtime.events` | Subscribe / publish | §30 event bridge |
| `sdk.growth.*` | Expose to clients | §29 |
| `/api/aivos/growth/*` | HTTP surface | §6, §44 |
| `growth/integration/*` | Thin wrappers | Marketplace event normalizers |
| `growth/recommendation/adapters/*` | Inbound only | §32 — no outbound changes to source engines |
| `AIVOS_GROWTH_ENABLED` | Feature flag | §11 |

---

## 47.4 PR Review Gate

Every Phase 20 PR MUST pass:

```
[ ] Diff touches only backend/lib/aivos/growth/**, sdk/growth/**, runtime/index.js (growth attach only), aivos/index.js (routes only), __tests__/aivosPhase20*
[ ] No files under billing/, revenue/, marketplace/, workflow/, skills/, knowledge/, tenant/, integration/ modified
[ ] No existing test file modified
[ ] Architecture validator script PASS
```

**CI job:** `growth-boundary-check` — fail on forbidden path diffs.

---

# 48. UPDATED DELIVERABLES INDEX (v1.3)

Phase 20 deliverables extended from 37 → **40**:

| # | Deliverable | Section | Status |
|---|---|---|---|
| 1–33 | Core + v1.1 contracts | §1–§33 | v1.0–v1.1 |
| 34–37 | Domain, UX, KPI, Sprint | §37–§40 | v1.2 |
| **38** | **API Compatibility Policy** | **§44** | **v1.3 NEW** |
| **39** | **Data Lifecycle & Retention** | **§45** | **v1.3 NEW** |
| **40** | **Growth Extension Policy** | **§46–§47** | **v1.3 NEW** |

**Implementation files added by v1.3:**

```
backend/lib/aivos/growth/retention/
backend/lib/aivos/growth/verticals/          # manifest overlays only
backend/lib/aivos/growth/api/versioning.js
scripts/growth-boundary-check.js             # CI forbidden-path gate
docs/growth/API_COMPATIBILITY.md
docs/growth/DATA_RETENTION.md
docs/growth/EXTENSION_POLICY.md
```

---

# 49. UPDATED TESTING STRATEGY (v1.3)

Extends §42. Three new contract tests.

## 49.1 GRW25–GRW27 (v1.3 contract tests)

| ID | Description | Contract | Assertions |
|---|---|---|---|
| **GRW25** | API Compatibility | §44 | v1 response snapshots; additive fields OK; breaking rename/remove FAIL; deprecation headers |
| **GRW26** | Data Retention | §45 | TTL enforcement per data class; purge on tenant/user delete; `growth.data.purged` emitted |
| **GRW27** | Extension Policy | §46–§47 | Vertical config-only extension; no forbidden path imports; boundary-check script PASS |

## 49.2 Target (v1.3)

| Suite | Count |
|---|---|
| Phases 1–19 regression | 351 |
| Phase 20 GRW01–GRW24 | 24 |
| Phase 20 GRW25–GRW27 (v1.3) | 3 |
| **Total** | **378/378 PASS** |

**Test file:** `backend/__tests__/aivosPhase20Growth.test.js` (GRW01–GRW27)

---

# 50. UPDATED ARCHITECTURE VALIDATION CHECKLIST (v1.3)

Extends §43. Items marked **(v1.3)** are new.

## 50.1 Architecture Validation (additions)

- [ ] **API additive-only enforced (§44) (v1.3)**
- [ ] **v1/v2 path strategy documented (§44.2) (v1.3)**
- [ ] **Deprecation workflow defined (§44.4) (v1.3)**
- [ ] **Retention schedule implemented (§45.1) (v1.3)**
- [ ] **Purge on tenant/user delete (§45.3) (v1.3)**
- [ ] **Single Growth layer for all verticals (§46) (v1.3)**
- [ ] **Skill → Workflow → Application → Growth stack (§46.1) (v1.3)**
- [ ] **Engine vs Experience separation documented (§46.4) (v1.3)**
- [ ] **Forbidden modifications F-1–F-15 enforced (§47) (v1.3)**
- [ ] **`growth-boundary-check` CI job (§47.4) (v1.3)**

## 50.2 Production Readiness (additions)

- [ ] GRW01–GRW27 PASS **(v1.3)**
- [ ] Regression >= **378/378** **(v1.3)**
- [ ] `docs/growth/API_COMPATIBILITY.md` delivered **(v1.3)**
- [ ] `docs/growth/DATA_RETENTION.md` delivered **(v1.3)**
- [ ] `docs/growth/EXTENSION_POLICY.md` delivered **(v1.3)**
- [ ] Sprint 20.5 RC includes retention job verification **(v1.3)**

---

**Phase 20 SPEC v1.3 — API Compatibility, Data Retention, Extension Policy, and Forbidden Modifications complete.**
""".strip()

OUT.write_text(CONTENT + "\n", encoding="utf-8")
print(f"Wrote {OUT} ({len(CONTENT)} bytes)")
