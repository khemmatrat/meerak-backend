# EVENT_CATALOG_v1

**Version:** 1.0.0  
**Namespace:** `AqondEventType` (30 types)  
**Authority:** `lib/server/lifecycleEventTypes.ts` + `aqondEventBus.ts`

> **FairPlay OS may consume ONLY events defined in this catalog.**  
> New event types require additive change per [EVENT_VERSIONING_POLICY.md](./EVENT_VERSIONING_POLICY.md).

---

## Common envelope

```typescript
{
  id: string;              // evt-{uuid16}
  order_id: string;
  event_type: AqondEventType;
  source: AqondEventSource;
  actor?: string;
  phase?: string;
  job_id?: string;
  merchant_id?: string;
  rider_id?: string;
  payload?: Record<string, unknown>;
  at: string;              // ISO-8601
}
```

**Sources:** `storefront` | `dispatch-svc` | `order-svc` | `payment-svc` | `admin` | `wallet-svc`

**Global idempotency key (outbox):** `{order_id}:{event_type}:{id}`

**Ordering guarantee:** Per `order_id`, total order by `at` ascending. Same-millisecond ties broken by append order in store.

**Replay behavior:** `appendAqondEvent` is append-only; replay reads log and re-projects. Outbox consumer is idempotent on `idempotency_key`.

---

## Order domain

### `order.created` (v1)

| Field | Value |
|-------|-------|
| Producer | `orderStore.ts`, `checkout/place/route.ts` |
| Payload | `{ items_summary?, buyer_id?, total_micro? }` |
| Ordering | First event for order |
| Idempotency | One create per order_id |
| Replay | Safe — duplicate create rejected upstream |
| Consumers | Track OS, Admin, FairPlay (session start) |

### `order.delivered` (v1)

| Producer | `localDispatch.ts`, `dispatchPhaseToEvent(rider_completed)` |
| Payload | `{ phase?, proof_url? }` |
| Consumers | Track OS, SSE, FairPlay (completion trigger) |

### `order.customer_confirmed` (v1)

| Producer | `foodConfirmReceipt.ts` |
| Payload | `{ method: 'manual' \| 'auto_timer' }` |
| Consumers | Track OS, review gate, FairPlay |

### `order.review_submitted` (v1)

| Producer | `riderTracking.ts` |
| Payload | `{ rating: number, comment?: string }` |
| Consumers | Track OS, FairPlay (quality signal) |

### `order.tip_paid` (v1)

| Producer | `riderTracking.ts` |
| Payload | `{ amount_micro: number }` |
| Consumers | Track OS, FairPlay |

### `order.refunded` (v1)

| Producer | `claimSettlement.ts` |
| Payload | `{ claim_id, amount_micro, mode }` |
| Consumers | Track OS, Claim OS audit, FairPlay |

### `order.cancelled` (v1)

| Producer | `merchantOrders.ts` (via fulfillment mapper) |
| Payload | `{ reason? }` |
| Consumers | Track OS; FairPlay — manual policy only |

---

## Merchant domain

### `merchant.accepted` (v1)

| Producer | `merchantOrders.ts` / `fulfillmentStatusToEvent('accepted')` |
| Payload | `{ merchant_id }` |

### `merchant.cooking_started` (v1)

| Producer | `fulfillmentStatusToEvent('preparing')` |
| Payload | `{}` |

### `merchant.packing_proof` (v1)

| Producer | `packingProof.ts` |
| Payload | `{ photo_url, storage }` |
| Gate | `FOOD_PACKING_GATE=true` |

### `merchant.ready` (v1)

| Producer | `merchantOrders.ts` |
| Payload | `{ dispatch_job_id? }` |
| Precondition | Packing proof when gate enabled |

---

## Dispatch domain

### `dispatch.search_started` (v1)

| Producer | `localDispatch.ts` |
| Payload | `{ zone? }` |
| Timeline | Hidden from customer (`isDispatchTimelineEvent`) |

### `dispatch.rider_offered` (v1)

| Producer | `localDispatch.ts` |
| Payload | `{ rider_id, offer_expires_at? }` |

### `dispatch.rider_rejected` (v1)

| Producer | `localDispatch.ts` |
| Payload | `{ rider_id, reason? }` |

### `dispatch.rider_timeout` (v1)

| Producer | Catalog / dispatch-svc (mapper) |
| Payload | `{ rider_id }` |
| Note | Emitter path via dispatch service in prod |

### `dispatch.rider_accepted` (v1)

| Producer | `localDispatch.ts` |
| Payload | `{ rider_id, job_id }` |

---

## Rider domain

### `rider.assigned` (v1)

| Producer | `dispatchPhaseToEvent('rider_assigned')` |
| Payload | `{ rider_id, job_id }` |

### `rider.qr_verified` (v1)

| Producer | `pickupVerification.ts` |
| Payload | `{ qr_nonce, device_id? }` |
| Gate | `FOOD_PICKUP_QR_REQUIRED=true` |

### `rider.pickup_photo` (v1)

| Producer | `pickupVerification.ts` |
| Payload | `{ photo_url }` |

### `rider.pickup_completed` (v1)

| Producer | `pickupVerification.ts` |
| Payload | `{ gps_lat?, gps_lng? }` |

### `rider.picked_up` (v1)

| Producer | `dispatchPhaseToEvent`, fulfillment `shipped` |
| Payload | `{ phase }` |

### `rider.en_route` (v1)

| Producer | `dispatchPhaseToEvent('en_route')` |
| Payload | `{}` |

### `rider.arrived` (v1)

| Producer | `dispatchPhaseToEvent('arrived'|'handoff'|'rider_calling')` |
| Payload | `{ phase }` |

---

## Claim domain

### `claim.opened` (v1)

| Producer | `merchantDisputes.ts` |
| Payload | `{ claim_id, category, title }` |
| Authority | **Claim OS owns case state** |

### `claim.settled` (v1)

| Producer | `claimSettlement.ts` |
| Payload | `{ claim_id, settlement_type, amount_micro? }` |

### `claim.redispatched` (v1)

| Producer | `claimRedispatch.ts` |
| Payload | `{ claim_id, new_job_id }` |

### `claim.replaced` (v1)

| Producer | `claimReplace.ts` |
| Payload | `{ claim_id, replacement_order_id }` |

### `claim.escalated` (v1)

| Producer | `claimSettlement.ts` |
| Payload | `{ claim_id, tier }` |

### `claim.closed` (v1)

| Producer | `claimSettlement.ts` |
| Payload | `{ claim_id, resolution }` |

---

## Passenger (non-food)

### `passenger.trip_completed` (v1)

| Producer | `localDispatch.ts` |
| Payload | `{ trip_id? }` |
| FairPlay | Excluded from food trust automation |

---

## Downstream consumer matrix

| Consumer | Subscribes | Read-only |
|----------|------------|-----------|
| Track OS projection | All order/merchant/rider/claim | ✅ |
| Admin SSE | Per-order stream | ✅ |
| Customer SSE | Per-order stream | ✅ |
| Outbox projector | All (via outbox) | ✅ |
| FairPlay OS (planned) | Subset per consumption contract | ✅ |
| dispatch-svc notify | Partial (debt) | N/A |

---

## Version field (future)

Events v1 have implicit `event_version: 1`. See [EVENT_VERSIONING_POLICY.md](./EVENT_VERSIONING_POLICY.md) for v2+ rules.
