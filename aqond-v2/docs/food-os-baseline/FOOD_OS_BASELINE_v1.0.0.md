# FOOD_OS_BASELINE_v1.0.0

**Immutable reference — do not edit after tag `food-os-v1.0.0-baseline`**

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Architecture hash | `00597b99fd64b0e2714c86597f52036bfa08c9f5f2ecb3d310db86feb1a95572` |
| Git commit | `7e8550ad5bb04f5fe77d5f42ecc6b019158ea0c6` |
| Tagged | `food-os-v1.0.0-baseline` |
| Frozen date | 2026-07-17 |

## Architecture hash components

```
sha256(
  commit:7e8550ad +
  aqondEventBus.ts:1ff2f15c +
  trackOsProjection.ts:3c29519e +
  lifecycleEventTypes.ts:fcc0d987 +
  eventOutbox.ts:7899250b +
  claimSettlement.ts:82322745 +
  merchantDisputes.ts:cbd4b074
)
```

---

## Module inventory

### Backend (storefront `lib/server`)

| Module | Role | Frozen |
|--------|------|--------|
| `aqondEventBus.ts` | Lifecycle event append + catalog | ✅ |
| `lifecycleEventTypes.ts` | Canonical 30 event types | ✅ |
| `eventOutbox.ts` | Outbox + DLQ (dev JSON) | ✅ |
| `eventProjector.ts` | Idempotent outbox processor | ✅ |
| `trackOsProjection.ts` | **Track OS SSOT read model** | ✅ |
| `orderTimeline.ts` | Timeline merge/dedupe | ✅ |
| `orderStore.ts` | Order persistence + `order.created` | ✅ |
| `merchantOrders.ts` | Fulfillment transitions | ✅ |
| `packingProof.ts` | Packing gate + proof | ✅ |
| `merchantOrderQr.ts` | Signed pickup QR | ✅ |
| `pickupVerification.ts` | QR + pickup photo gate | ✅ |
| `localDispatch.ts` | Dispatch phases + rider events | ✅ |
| `dispatchSvc.ts` / `dispatchHandoff.ts` | External dispatch bridge | ✅ |
| `foodConfirmReceipt.ts` | Customer confirm + auto-timer | ✅ |
| `riderTracking.ts` | Delivery tracking, review, tip | ✅ |
| `merchantDisputes.ts` | Claim case CRUD + `claim.opened` | ✅ |
| `claimSettlement.ts` | Settle, escalate, close, refund | ✅ |
| `claimReplace.ts` | Replace order flow | ✅ |
| `claimRedispatch.ts` | Re-dispatch flow | ✅ |
| `disputePolicy.ts` | Five claim categories | ✅ |
| `shopChatStore.ts` | Merchant/customer chat persistence | ✅ |

### Frontend (operational UI — frozen behaviour)

| Surface | Key paths |
|---------|-----------|
| Customer track | `app/m/food/track/[orderId]/` |
| Merchant orders | `app/m/merchant/orders/` |
| Rider active job | `app/m/rider/active/[jobId]/` |
| Admin Track OS | `nexus-admin-core/components/TrackOsDetailPanel.tsx` |

### Workers

| Worker | Path |
|--------|------|
| Lifecycle projector | `workers/lifecycleProjector.mjs` |

### AI Assist (suggestion only)

| Service | Path |
|---------|------|
| ai-core assist routes | `infra/ai-core/server.js` → `/v1/ai/assist/*` |

---

## API inventory (summary)

Full freeze: [API_CONTRACT_FREEZE.md](./API_CONTRACT_FREEZE.md)

| Domain | Route count (core) |
|--------|-------------------|
| Customer | 12 |
| Merchant | 10 |
| Rider | 18 |
| Admin | 14 |
| Track OS | 8 |
| Claim OS | 8 |

---

## Database inventory (Food OS scope)

Full freeze: [DATABASE_FREEZE.md](./DATABASE_FREEZE.md)

| Migration | Tables |
|-----------|--------|
| 045 | `commerce.order_packing_proofs` |
| 046 | `commerce.pickup_verifications`, `commerce.pickup_qr_nonces` |
| 047 | `commerce.order_lifecycle_events` |
| 048 | `commerce.event_outbox` |
| 049 | `commerce.event_dlq` |

Dev JSON stores (non-prod): `.data/dev/aqond-order-events.json`, `event-outbox.json`, `event-dlq.json`

---

## Event catalog

30 types — full spec: [EVENT_CATALOG_v1.md](./EVENT_CATALOG_v1.md)

---

## Feature flags

| Flag | Default (prod intent) | Purpose |
|------|----------------------|---------|
| `FOOD_PACKING_GATE` | `true` | Block ready without packing photo |
| `FOOD_PICKUP_QR_REQUIRED` | `true` | Require QR scan at pickup |
| `FOOD_CUSTOMER_CONFIRM` | `true` | Customer confirm before review/tip |
| `FOOD_AUTO_CONFIRM_MINUTES` | `15` | Auto-confirm timer |
| `FOOD_EVENT_BACKBONE` | `pg` | PG vs JSON event store |
| `NEXT_PUBLIC_FOOD_PICKUP_QR_REQUIRED` | `true` | Client pickup QR UI |

---

## Migration list (Food OS additive set)

```
045_order_packing_proofs.sql
046_pickup_verifications.sql
047_order_lifecycle_events.sql
048_event_outbox.sql
049_event_dlq.sql
```

Apply via: `pwsh aqond-v2/infra/scripts/apply-migrations.ps1`

---

## Known technical debt (waivable)

1. **Dual-write** — JSON event store active in dev; PG backbone flag skips JSON write in prod but TS outbox still file-backed in dev
2. **Track OS live map** — GPS trail list only; no animated map layer in admin
3. **Notify templates** — Not all lifecycle events have push templates in dispatch-svc
4. **Catalog-only emitters** — Some events via mappers only (`fulfillmentStatusToEvent`, `dispatchPhaseToEvent`)

---

## Production assumptions

- PostgreSQL `commerce` schema with migrations 001–049 applied
- `FOOD_EVENT_BACKBONE=pg` in production
- `AQOND_ADMIN_KEY` rotated from dev default
- MinIO for proof photo storage in prod
- Outbox worker cron: `npm run worker:lifecycle-projector` or admin replay
- Storefront port **3003**; ai-core **8100**
- Dispatch service URL configured (`DISPATCH_SVC_URL`) for production matching
- SSE supported by reverse proxy (no buffering on `/events/stream`)

---

## Test bundle (baseline verification)

```bash
cd aqond-v2/apps/storefront
npm run test:release-gate
```

---

## Change control

All post-baseline changes: [FOOD_OS_CHANGE_POLICY.md](./FOOD_OS_CHANGE_POLICY.md)  
Event evolution: [EVENT_VERSIONING_POLICY.md](./EVENT_VERSIONING_POLICY.md)
