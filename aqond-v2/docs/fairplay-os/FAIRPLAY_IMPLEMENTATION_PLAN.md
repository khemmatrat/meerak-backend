# FAIRPLAY_IMPLEMENTATION_PLAN.md

**Status:** ⛔ **DRAFT — BLOCKED**  
**Blocked by:** Food OS Release Gate G1, G2, G4, G5, G7 not PASS  
**No implementation until:** Production Readiness Report verdict = PASS

---

## Repository layout (proposed)

```
aqond-v2/
  services/fairplay-svc/          # Go or Node — event consumer + policy engine
    cmd/worker/                   # Outbox/lifecycle consumer
    cmd/api/                      # Read APIs + admin BFF
    internal/
      consumer/                   # Offset, idempotency, DLQ
      policy/                     # Versioned rule evaluation
      projection/                 # Trust profile read model
      audit/                      # Governance event append
  infra/postgres/migrations/
    050_fairplay_policy_versions.sql
    051_fairplay_participant_trust.sql
    052_fairplay_governance_events.sql
    053_fairplay_consumer_offsets.sql
  docs/fairplay-os/               # Planning (this pack)
  apps/nexus-admin-core/
    components/FairPlayAuditView.tsx   # Read-only admin (FP3+)
```

**Explicitly NOT in:** `apps/storefront` operational paths, customer/merchant/rider mobile UI.

---

## Bounded contexts

| Context | Owns |
|---------|------|
| Policy Registry | Rule documents, version lifecycle |
| Event Consumer | Ingest, offset, idempotency |
| Trust Engine | Scores, tiers, restrictions (read model) |
| Mission Engine | Progress rules (no UI v1) |
| Reward Eligibility | Emits eligibility events (no wallet) |
| Audit | Append-only governance log |

---

## Service ownership

| Team | Owns |
|------|------|
| Platform / FairPlay | fairplay-svc, migrations 050+ |
| Food OS (frozen) | storefront, Track OS, Claim OS |
| Ops | Event backbone, outbox worker |
| Admin UX | Nexus read-only dashboards |

---

## Database (additive only)

See migrations above. No FK to mutable order columns — `order_id TEXT` references only.

---

## Events

**In:** [EVENT_CATALOG_v1.md](../food-os-baseline/EVENT_CATALOG_v1.md) subset  
**Out:** `fairplay.policy.evaluated`, `fairplay.trust.updated`, `fairplay.mission.completed`, `fairplay.reward.eligible`, `fairplay.restriction.applied`

---

## APIs (read-heavy)

| Method | Path | Phase |
|--------|------|-------|
| GET | `/v1/fairplay/participants/:id/profile` | FP3 |
| GET | `/v1/fairplay/policies` | FP2 |
| GET | `/v1/fairplay/audit` | FP3 |
| POST | `/v1/fairplay/admin/overrides` | FP4 (dual-control) |

---

## Workers

| Worker | Schedule | Function |
|--------|----------|----------|
| fairplay-consumer | Continuous / 5s poll | Read lifecycle events or outbox fan-out |
| fairplay-replay | On-demand | Rebuild projection from offset 0 |

---

## Projections

| Projection | Source events |
|------------|---------------|
| Participant trust profile | completion, claim, review |
| Mission progress | configurable per policy |
| Audit timeline | all governance decisions |

---

## Admin UI

- **FP3:** Read-only audit + trust profile lookup in Nexus Admin
- **No** customer/merchant/rider widgets in v1

---

## Milestones

| Milestone | Deliverable | Exit gate |
|-----------|-------------|-----------|
| FP0 | Architecture sign-off + threat model | Stop gate PASS |
| FP1 | Consumer skeleton + offset table | Replay idempotent test |
| FP2 | Policy registry + 1 sample policy | Shadow evaluation |
| FP3 | Trust read API + admin audit view | No Food OS diff |
| FP4 | Mission + eligibility events | No wallet integration |
| FP5 | Wallet handoff | Separate payment ADR |

---

## Exit gates (each milestone)

- No changes to Food OS workflow files
- All tests green on Food OS `test:release-gate`
- FairPlay unit + integration tests for consumer
- No TODO/FIXME in production paths
- ADR updated if boundary changes

---

## Unblock checklist

- [ ] Food OS Release Gate G1–G7 all PASS
- [ ] `10-PRODUCTION-READINESS-REPORT.md` verdict = PASS
- [ ] `06-THREAT-MODEL.md` published
- [ ] `07-ABUSE-MODEL.md` published
- [ ] Architecture Stop Gate signed (00-ARCHITECTURE-REVIEW-STOP-GATE.md)

**Until checklist complete: this plan is documentation only.**
