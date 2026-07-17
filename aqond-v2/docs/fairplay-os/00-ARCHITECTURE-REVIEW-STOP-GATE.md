# AQOND FairPlay OS — Architecture Review Stop Gate

**Version:** 1.0 (planning)  
**Status:** ⛔ **NO CODE** until this document is signed  
**Prerequisite:** Food Delivery OS v1.0.0 Release Gate **PASS**

---

## Mission

Build the **Governance Layer** for AQOND.

FairPlay OS evaluates policy, trust, and incentive outcomes from **observed events** — it does not own order, dispatch, or claim workflow.

---

## Frozen upstream systems

| System | Role | FairPlay may |
|--------|------|--------------|
| **Food Delivery OS** | Operational workflow | **Read events only** |
| **Track OS** | Single Source of Truth (read model) | **Read projection / events** |
| **Claim OS** | Dispute resolution authority | **Read claim.* events** |
| **Event Backbone** | Durable lifecycle stream | **Subscribe / consume** |

FairPlay **must not** modify Food OS business workflow unless explicitly approved via change control.

---

## Hard constraints (conflict = STOP)

1. **No direct coupling** to Customer UI, Merchant UI, or Rider UI.
2. **No duplicate state** — no shadow order/claim/dispatch tables fed by UI callbacks.
3. **Policy engine only** — rules, scores, missions, rewards computed from events + approved inputs.
4. **Event consumption** — primary input is `commerce.order_lifecycle_events` / outbox fan-out.
5. **Track OS remains SSOT** for operational truth; FairPlay emits **governance events** (new catalog), not fulfillment transitions.
6. **Claim OS remains authority** for dispute outcomes; FairPlay may recommend, not override settle/replace/redispatch.

---

## Out of scope for v1.0 planning (explicit)

Implement only after separate milestone approval:

- Customer-facing reward UI
- Merchant incentive dashboards (unless read-only BFF)
- Rider priority queue injection into dispatch
- Insurance product integration
- Coin/card ledger (unless architecture adds new bounded context)

---

## Architecture deliverables (before code)

| # | Document | Purpose |
|---|----------|---------|
| 1 | [01-ARCHITECTURE-PRINCIPLES.md](./01-ARCHITECTURE-PRINCIPLES.md) | Bounded contexts, CQRS boundaries |
| 2 | [02-EVENT-CONSUMPTION-CONTRACT.md](./02-EVENT-CONSUMPTION-CONTRACT.md) | Subscribed events, idempotency, replay |
| 3 | [03-SCOPE-AND-BOUNDARIES.md](./03-SCOPE-AND-BOUNDARIES.md) | Modules, APIs, what FairPlay owns |
| 4 | Gap matrix (TBD) | Features × events × policies |
| 5 | Threat model (TBD) | Abuse, gaming, payout fraud |

---

## Sign-off (required to start implementation)

| Role | Approve architecture | Date |
|------|---------------------|------|
| Product Owner | ☐ | |
| Architect | ☐ | |
| Food OS Owner | ☐ | |

**Approved →** create sprint backlog and repository layout under `aqond-v2/services/fairplay-svc/` (or approved path).  
**Rejected →** revise planning docs only; still no Food OS workflow changes.
