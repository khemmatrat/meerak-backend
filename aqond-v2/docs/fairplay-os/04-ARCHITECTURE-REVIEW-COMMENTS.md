# FairPlay OS — Architecture Review Comments (Phase R2)

**Date:** 2026-07-17  
**Mode:** Review only — no production code  
**Prerequisite:** Food OS Release Gate — **NOT PASS** (see baseline report)

---

## Overall assessment

Planning pack (00–03) is **directionally correct** and aligned with ADR-001 through ADR-005. FairPlay can proceed to **document refinement** but **not FP0 code** until Food OS Release Gate PASS.

---

## Architecture — PASS with comments

| Topic | Verdict | Comment |
|-------|---------|---------|
| CQRS boundaries | ✅ | Clear separation; ensure FairPlay never imports `@/lib/server/merchantOrders` or similar |
| Event-only input | ✅ | Consumption contract matches EVENT_CATALOG_v1 |
| Governance event namespace | ✅ | `fairplay.*` prefix prevents collision |
| Policy versioning | ⚠️ | Define storage format (JSON schema registry) before FP1 |
| Service boundary | ⚠️ | Recommend dedicated `fairplay-svc` — not storefront routes |

---

## Event contracts — PASS with comments

| Topic | Verdict | Comment |
|-------|---------|---------|
| Subscribed events | ✅ | Minimum v1 set is sufficient for pilot policy |
| Idempotency `fairplay:{event.id}` | ✅ | Align with outbox key strategy |
| Offset strategy | ⚠️ | Specify: per-partition vs global offset table |
| Replay strategy | ⚠️ | Document rebuild SLA (e.g. 4h for 90 days events) |
| Event evolution | ✅ | EVENT_VERSIONING_POLICY covers forward compatibility |
| Unknown events | ⚠️ | Metric + skip OK; alert if rate > threshold |

---

## Governance model — PASS with comments

| Topic | Verdict | Comment |
|-------|---------|---------|
| Policy engine only | ✅ | No dispatch/claim mutation |
| Admin overrides | ⚠️ | Require dual-control for manual trust adjustment |
| Audit trail | ⚠️ | `fairplay.governance_events` must be append-only |
| Wallet handoff | ⚠️ | FP5 only — eligibility event ≠ payout command |

---

## Threat model — NEEDS WORK

| Threat | Mitigation (proposed) | Status |
|--------|----------------------|--------|
| Gaming reviews/tips | Rate limits + anomaly detection on `order.review_submitted` | Draft |
| Collusion merchant-rider | Cross-entity graph on shared orders | Draft |
| Claim fraud | Correlate `claim.opened` with proof URLs from Track OS | Draft |
| Replay attack on consumer | Idempotency + signed offset checkpoints | Draft |
| Policy injection | Admin RBAC + policy version signing | Missing |

**Action:** Produce `06-THREAT-MODEL.md` before FP1.

---

## Abuse model — NEEDS WORK

| Scenario | Response | Status |
|----------|----------|--------|
| Rider serial cancellations | Restrict eligibility, not dispatch | Draft |
| Customer false claims | Claim OS authority unchanged; FairPlay flags only | ✅ |
| Merchant delay abuse | SLA policy on `merchant.ready` latency | Draft |
| Sybil accounts | Identity layer out of scope — document dependency | Missing |

**Action:** Produce `07-ABUSE-MODEL.md` before FP1.

---

## Policy versioning — PASS with comments

- Use semver on policy documents: `rider_completion@1.0.0`
- Store `evaluated_with_policy_version` on every governance event
- Support shadow mode (evaluate but don't apply) for FP2

---

## Replay & offset — PASS with comments

Recommended:

```
fairplay.consumer_offsets (
  consumer_group TEXT,
  last_event_id TEXT,
  last_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

- On startup: replay from `last_at - 5min` overlap window
- Dedupe via `fairplay:{event.id}`

---

## Event evolution strategy — PASS

Follow [EVENT_VERSIONING_POLICY.md](../food-os-baseline/EVENT_VERSIONING_POLICY.md). FairPlay consumer must:

1. Ignore unknown `event_type` (metric)
2. Accept unknown payload fields
3. Fail DLQ on required field missing after schema validation

---

## Conflicts found

**None** requiring Architecture Conflict Report at this time.

---

## Recommendation

| Phase | Action |
|-------|--------|
| Now | Complete Food OS Release Gate G1,G2,G4,G5,G7 |
| R2 follow-up | Write threat + abuse model docs |
| R3 | Generate FAIRPLAY_IMPLEMENTATION_PLAN (DRAFT) — blocked on gate PASS |
| FP0 code | **Do not start** |
