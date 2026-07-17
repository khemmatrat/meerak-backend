# FairPlay OS — Scope and Boundaries

**Version:** 1.0 (planning)

---

## Bounded context

**FairPlay OS** = policy evaluation + trust/mission/reward **eligibility** + audit.

It is **not**:

- Order management
- Dispatch matching
- Claim adjudication
- Customer tracking UI

---

## Planned modules (names provisional)

| Module | Owns | Does not own |
|--------|------|--------------|
| **Policy Registry** | Rule versions, thresholds | Executing refunds |
| **Event Consumer** | Ingest lifecycle stream | Emitting `merchant.ready` |
| **Trust Engine** | Scores, tiers, restrictions | Rider job assignment |
| **Mission Engine** | Progress, completion rules | Mission UI in rider app (v1) |
| **Reward Eligibility** | Payout triggers | Wallet ledger |
| **Audit & Appeals** | Decision log, override workflow | Claim OS settle API |
| **Admin BFF** | Read models for ops | Merchant order actions |

---

## API boundary (draft)

All APIs under `/v1/fairplay/*` (new service). Examples:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/fairplay/participants/:id/profile` | Read trust profile |
| GET | `/v1/fairplay/policies` | List policy versions |
| POST | `/v1/fairplay/admin/overrides` | Manual governance action (audited) |
| GET | `/v1/fairplay/audit` | Decision history |

**Forbidden:** endpoints that mutate Food OS order state, dispatch jobs, or claim resolution.

---

## UI boundary

| UI | FairPlay v1 |
|----|-------------|
| Customer app | ❌ No trust/score widgets |
| Merchant app | ❌ No incentive controls |
| Rider app | ❌ No priority queue UI |
| Nexus Admin | ✅ Read-only governance dashboards (later sprint) |

---

## Data stores (proposed)

| Store | Content |
|-------|---------|
| `fairplay.policy_versions` | JSON policy documents |
| `fairplay.participant_trust` | Materialized scores |
| `fairplay.mission_progress` | Per-participant mission state |
| `fairplay.governance_events` | Append-only decision log |
| `fairplay.consumer_offsets` | Replay checkpoints |

No foreign keys **into** `commerce.orders` mutable columns — link by `order_id` string only.

---

## Dependency graph

```
Food OS (frozen) ──events──▶ FairPlay Consumer
Track OS (read)  ──enrich──▶ FairPlay Engine
Claim OS (read)  ──enrich──▶ FairPlay Engine
FairPlay         ──events──▶ Wallet / Notify (future)
ai-core          ──assist──▶ FairPlay (suggestions only)
```

---

## Milestone proposal (planning only)

| Phase | Deliverable |
|-------|-------------|
| FP0 | Architecture sign-off (this pack) |
| FP1 | Event consumer + idempotent projection skeleton |
| FP2 | Policy registry + one sample policy (rider completion) |
| FP3 | Trust read API + admin audit view |
| FP4 | Mission + reward eligibility events (no payout) |
| FP5 | Wallet handoff integration |

**No phase starts until prior phase exit gate passes.**
