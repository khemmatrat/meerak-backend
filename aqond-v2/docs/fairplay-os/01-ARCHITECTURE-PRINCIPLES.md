# FairPlay OS — Architecture Principles

**Version:** 1.0 (planning)

## 1. Governance, not operations

FairPlay OS sits **above** fulfillment. It answers:

- Did participants act fairly?
- What policy outcome applies (badge, restriction, reward eligibility)?
- What audit trail supports the decision?

It does **not** answer: "Should this order be dispatched?" — that remains dispatch + Food OS.

## 2. Event-sourced inputs

```
Food OS / Claim OS / Payment
        │
        ▼
  Event Backbone (PG + outbox)
        │
        ▼
  FairPlay Consumer (idempotent)
        │
        ▼
  Policy Engine → Governance Events → (optional) downstream notify
```

All FairPlay state changes must be derivable from consumed events + explicit admin policy versions.

## 3. CQRS separation

| Write side | Read side |
|------------|-----------|
| Policy definitions, manual overrides (admin) | Participant trust profile, mission progress, eligibility |
| Governance event append | Admin / API read models |

Operational UIs (customer track, merchant orders, rider active job) **never** write FairPlay state directly.

## 4. Idempotency and replay

- Consumer uses `(order_id, event_type, event_id)` or outbox `idempotency_key`.
- Replay-safe: rebuilding FairPlay projection from lifecycle log produces identical scores.
- DLQ for poison messages; no silent drops.

## 5. Versioned policies

Policies are versioned documents (e.g. `fairplay.policy.rider_completion@v3`).  
Scores reference **policy version at evaluation time** for audit.

## 6. New event namespace

FairPlay publishes **governance events** (examples — subject to review):

- `fairplay.policy.evaluated`
- `fairplay.trust.updated`
- `fairplay.mission.completed`
- `fairplay.reward.eligible`
- `fairplay.restriction.applied`

These must **not** replace or mutate Food OS lifecycle types in `lifecycleEventTypes.ts`.

## 7. Integration surfaces (allowed)

| Surface | Direction | Notes |
|---------|-----------|-------|
| Event Backbone | In | Primary |
| Track OS projection | In (read) | Enrichment only |
| Admin console | In (config) | Policy CRUD, overrides |
| Wallet / payout svc | Out | Only after eligibility event |
| ai-core | In (assist) | Classification suggestions |

## 8. Non-goals (v1)

- Real-time UI widgets in rider app for "trust score"
- Automatic dispatch priority manipulation
- Customer gamification layer
