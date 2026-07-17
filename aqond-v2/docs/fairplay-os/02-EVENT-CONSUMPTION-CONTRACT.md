# FairPlay OS — Event Consumption Contract

**Version:** 1.0 (draft)  
**Upstream:** Food Delivery OS Event Backbone

---

## Transport

| Environment | Source |
|-------------|--------|
| Production | `commerce.order_lifecycle_events` via outbox projector / CDC |
| Development | JSON `aqond-order-events.json` + outbox (parity testing only) |

Consumer must support **replay from offset** for backfill.

---

## Subscribed lifecycle events (minimum v1)

From `lib/server/lifecycleEventTypes.ts`:

### Fulfillment (participant behaviour)

| Event | FairPlay use |
|-------|--------------|
| `order.created` | Session start, fraud baseline |
| `merchant.accepted` | Merchant SLA clock |
| `merchant.packing_proof` | Compliance signal |
| `merchant.ready` | Handoff readiness |
| `dispatch.rider_accepted` | Rider commitment |
| `rider.qr_verified` | Pickup integrity |
| `rider.pickup_photo` | Evidence chain |
| `rider.picked_up` / `rider.en_route` / `rider.arrived` | Trajectory policy |
| `order.delivered` | Completion trigger |
| `order.customer_confirmed` | Strong completion signal |
| `order.review_submitted` | Quality signal |
| `order.tip_paid` | Discretionary reward input |

### Claims (governance)

| Event | FairPlay use |
|-------|--------------|
| `claim.opened` | Incident record |
| `claim.settled` / `claim.closed` | Liability outcome |
| `claim.redispatched` / `claim.replaced` | Remediation cost |
| `order.refunded` | Financial outcome |

### Excluded from automatic trust mutation (review required)

- `order.cancelled` — policy-specific handling
- `passenger.trip_completed` — non-food domain

---

## Payload requirements

Each consumed event must carry (from backbone):

```json
{
  "id": "evt-…",
  "order_id": "ord-…",
  "event_type": "order.customer_confirmed",
  "source": "storefront",
  "actor": "customer:…",
  "merchant_id": "…",
  "rider_id": "…",
  "payload": {},
  "at": "ISO-8601"
}
```

FairPlay stores **reference + hash** of payload; does not duplicate proof blobs (URLs remain in Track OS).

---

## Idempotency key

```
fairplay:{event.id}
```

Duplicate delivery → no-op with 200/ack.

---

## Enrichment (read-only)

Optional joins:

- `GET /api/admin/food/orders/:id/track` — Track OS projection (admin auth)
- Claim record by `claim_id` in event payload

Never write back to Track OS or Claim OS tables.

---

## Failure handling

| Condition | Action |
|-----------|--------|
| Unknown event type | Log + skip (metric) |
| Schema violation | DLQ + alert |
| Policy evaluation error | DLQ + no partial trust write |
| Upstream replay | Re-entrant idempotent merge |

---

## Governance outputs

FairPlay appends to **its own** event stream / tables:

- `fairplay.trust.delta`
- `fairplay.mission.progress`
- `fairplay.audit.decision`

Downstream wallet/payout subscribes to governance stream — not to raw Food OS events directly (decoupling).
