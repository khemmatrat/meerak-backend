# API_CONTRACT_FREEZE — Food Delivery OS v1.0.0

**Effective:** 2026-07-17  
**Breaking changes:** Require new version prefix (`/v2/...`) or explicit PO approval

---

## Customer

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/checkout/place` | Place food order → `order.created` |
| GET | `/api/food/[sku]` | Food item detail |
| GET | `/api/foodmerchant/[merchantId]` | Restaurant menu |
| POST | `/api/food/tracking/start` | Start tracking session |
| POST | `/api/food/tracking/ensure` | Ensure tracking record |
| GET | `/api/food/tracking/[orderId]` | Customer track payload |
| GET | `/api/food/tracking/[orderId]/stream` | SSE realtime updates |
| POST | `/api/food/tracking/[orderId]/confirm` | Customer confirm receipt |
| POST | `/api/food/tracking/[orderId]/review` | Submit review + tip |
| POST | `/api/food/tracking/[orderId]/chat` | Customer chat message |
| POST | `/api/food/tracking/[orderId]/report` | Open dispute (Claim) |
| GET | `/api/order-proofs/[orderId]` | Delivery proof gallery |
| GET | `/api/orders` | Order history |
| GET | `/api/orders/[id]/timeline` | Order timeline |

---

## Merchant

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/merchant/orders` | List orders |
| POST | `/api/orders/[id]/fulfillment` | Accept/prepare/ready/reject |
| GET | `/api/merchant/orders/[id]/packing-proof` | Get packing proof |
| POST | `/api/merchant/orders/[id]/packing-proof` | Upload packing proof |
| GET | `/api/merchant/orders/[id]/pickup-qr` | Pickup QR for rider |
| GET | `/api/merchant/orders/[id]/rider-chat` | Rider chat thread |
| GET | `/api/merchant/disputes` | List disputes |
| GET | `/api/merchant/disputes/[id]` | Dispute detail |
| PATCH | `/api/merchant/disputes/[id]` | Update dispute metadata |
| GET/POST | `/api/shop-chat/[shopId]` | Customer shop chat |

---

## Rider

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/rider/jobs` | Available/active jobs |
| GET | `/api/rider/jobs/[id]` | Job detail |
| POST | `/api/rider/jobs/[id]/accept` | Accept job |
| POST | `/api/rider/jobs/[id]/reject` | Reject offer |
| POST | `/api/rider/jobs/[id]/phase` | Advance delivery phase |
| POST | `/api/rider/jobs/[id]/location` | GPS telemetry |
| POST | `/api/rider/orders/[id]/verify-pickup` | QR verify pickup |
| POST | `/api/rider/orders/[id]/pickup-photo` | Pickup photo upload |
| POST | `/api/rider/telemetry` | Batch telemetry |
| POST | `/api/rider/status` | Online/offline status |
| GET | `/api/pickup-proofs/[orderId]` | Pickup proof read |

---

## Admin

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/food/orders` | Food order list |
| GET | `/api/admin/food/orders/[orderId]/track` | **Track OS projection** |
| GET | `/api/admin/food/orders/[orderId]/timeline` | Admin timeline |
| GET | `/api/admin/food/orders/[orderId]/events/stream` | Admin SSE |
| GET | `/api/admin/food/merchants` | Merchant ops |
| GET | `/api/admin/food/riders` | Rider ops |
| GET | `/api/admin/food/dashboard` | Ops dashboard |
| GET | `/api/admin/food/dispatch` | Dispatch overview |
| GET | `/api/admin/events/metrics` | Outbox/DLQ metrics |
| POST | `/api/admin/events/replay` | Outbox replay / DLQ recovery |

Auth: `x-admin-key` header or `admin_key` query param.

---

## Track OS (read-only BFF)

All Track OS admin widgets read **only** from:

```
GET /api/admin/food/orders/:orderId/track
```

Customer track reads from:

```
GET /api/food/tracking/:orderId
```

No business rules in UI — projection owns merge logic.

---

## Claim OS

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/disputes` | List claims |
| POST | `/api/disputes` | Open claim → `claim.opened` |
| POST | `/api/disputes/[id]/settle` | Settle + refund |
| POST | `/api/disputes/[id]/replace` | Replacement order |
| POST | `/api/disputes/[id]/redispatch` | New dispatch job |
| POST | `/api/disputes/[id]/escalate` | Escalate tier |
| POST | `/api/disputes/[id]/close` | Close case |

**Claim OS is settlement authority** — no other module may execute refund without these routes.

---

## Versioning rule

| Change type | Action |
|-------------|--------|
| Add optional JSON field | Allowed (same path) |
| Remove/rename field | **Forbidden** — new `/v2` route |
| Change HTTP status semantics | **Forbidden** without version bump |
| Change auth model | Requires ADR + version |
