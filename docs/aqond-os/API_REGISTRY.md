# API Registry

**Last Updated:** 2026-06-30
**Rule:** Register every new endpoint here before implementation.
**Full catalog:** Also see [API_CATALOG.md](./API_CATALOG.md) — AIVOS merchant-ad deep detail + legacy monorepo routes only (do not look for storefront BFF routes there, they live here).

## Storefront BFF (`aqond-v2/apps/storefront/app/api/`)

### Orders & Checkout

| Route                            | Method | Auth          | Owner             | Request                     | Response                     |
| -------------------------------- | ------ | ------------- | ----------------- | --------------------------- | ---------------------------- |
| `/api/checkout/place`            | POST   | buyer session | order-svc + local | cart, buyer_id, merchant_id | order_id, payment_action     |
| `/api/orders`                    | GET    | buyer         | orderStore        | buyer_id                    | orders[]                     |
| `/api/orders/[orderId]/timeline` | GET    | public\*      | aqondEventBus     | orderId                     | events, steps, food_timeline |
| `/api/orders/[id]/fulfillment`   | POST   | merchant      | merchantOrders    | status                      | fulfillment                  |

### Food

| Route                                 | Method | Auth           | Owner                        |
| ------------------------------------- | ------ | -------------- | ---------------------------- |
| `/api/food/tracking/start`            | POST   | buyer          | riderTracking                |
| `/api/food/tracking/[orderId]`        | GET    | public         | dispatchSvc + timeline merge |
| `/api/food/tracking/[orderId]/chat`   | POST   | rider/customer | dispatch chat                |
| `/api/food/tracking/[orderId]/review` | POST   | buyer          | dispatch review              |

### Rider

| Route                           | Method | Auth            | Owner                  |
| ------------------------------- | ------ | --------------- | ---------------------- |
| `/api/rider/me`                 | GET    | user_id         | dispatch-svc           |
| `/api/rider/register`           | POST   | session         | dispatch + KYC         |
| `/api/rider/jobs`               | GET    | rider_id / open | dispatchSvc            |
| `/api/rider/jobs/[id]/accept`   | POST   | rider_id        | dispatchSvc            |
| `/api/rider/jobs/[id]/phase`    | POST   | rider_id        | dispatchSvc            |
| `/api/rider/jobs/[id]/location` | POST   | rider_id        | dispatchSvc + presence |
| `/api/rider/dashboard`          | GET    | rider_id        | riderDashboard (local) |
| `/api/rider/status`             | POST   | rider_id        | riderPresence          |
| `/api/rider/telemetry`          | POST   | rider_id        | riderPresence          |
| `/api/rider/earnings`           | GET    | rider_id        | dispatch-svc + local   |
| `/api/rider/withdraw`           | POST   | rider_id        | dispatch-svc           |

### Merchant

| Route                      | Method   | Owner module                                                                                   |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `/api/merchant/orders`     | GET      | merchantOrders                                                                                 |
| `/api/merchant/dashboard`  | GET      | merchant dashboard                                                                             |
| `/api/merchant/wallet`     | GET      | merchant wallet                                                                                |
| `/api/merchant/menu`       | GET/POST | merchant menu                                                                                  |
| `/api/merchant/ad-video/*` | \*       | AIVOS proxy — **see API_CATALOG.md → "Storefront Merchant Ad" for full 10-endpoint breakdown** |

### Admin (storefront aggregation)

| Route                                       | Method | Auth        | Owner             |
| ------------------------------------------- | ------ | ----------- | ----------------- |
| `/api/admin/food/dashboard`                 | GET    | x-admin-key | foodMerchantOs    |
| `/api/admin/food/orders`                    | GET    | x-admin-key | foodMerchantOs    |
| `/api/admin/food/orders/[orderId]/timeline` | GET    | x-admin-key | orderTimeline     |
| `/api/admin/food/dispatch`                  | GET    | x-admin-key | dispatch pipeline |
| `/api/admin/food/riders`                    | GET    | x-admin-key | foodMerchantOs    |
| `/api/admin/events`                         | GET    | x-admin-key | aqondEventBus     |

### BFF catch-all

| Route                | Owner                   |
| -------------------- | ----------------------- |
| `/api/bff/[...path]` | Kong → Go microservices |

### Storefront Commerce (ย้ายมารวมที่นี่จาก API_CATALOG.md เดิม — เดิมซ้ำกัน)

| Endpoint                   | Method   | Owner    |
| -------------------------- | -------- | -------- |
| `/api/cart/items`          | GET/POST | cart     |
| `/api/product/[id]/detail` | GET      | catalog  |
| `/api/merchant/products`   | GET/POST | merchant |
| `/api/search`              | GET      | search   |
| `/api/feed/social`         | GET      | feed     |

## Backend monolith (`backend/server.js` :3001)

| Prefix             | Owner              |
| ------------------ | ------------------ |
| `/api/wallet/*`    | Wallet / Pay       |
| `/api/admin/*`     | Nexus admin proxy  |
| `/api/aivos/*`     | AIVOS platform     |
| `/api/jobs/*`      | Services job board |
| `/api/merchants/*` | Legacy merchant    |

## Go microservices (`aqond-v2/services/`)

| Service          | Port (dev) | Key routes                                |
| ---------------- | ---------- | ----------------------------------------- |
| dispatch-svc     | Kong       | `/v1/dispatch/jobs`, `/v1/dispatch/track` |
| order-svc        | Kong       | `/v1/orders`, fulfillment                 |
| food-svc         | Kong       | `/v1/food/*`                              |
| wallet-svc       | Kong       | wallet ledger                             |
| payment-svc      | Kong       | checkout intents                          |
| merchant-ops-svc | Kong       | merchant ops                              |

## Duplicate prevention

Before adding `/api/rider/*` or `/v1/dispatch/*` variants — search this file and [FEATURE_REGISTRY.md](./FEATURE_REGISTRY.md).

## Maintenance

```bash
# Storefront routes
find aqond-v2/apps/storefront/app/api -name route.ts
```
