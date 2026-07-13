# AQOND Feature Registry

**Last Updated:** 2026-06-30  
**Rule:** Check this before creating any new feature. Extend existing modules.

## Commerce

| Feature ID | Module | Status | Owner path |
|------------|--------|--------|------------|
| `food.order` | Food | 🟡 | `food-svc`, `localFood`, `/m/food/checkout` |
| `food.tracking` | Food | 🟡 | `food/tracking`, `TtRiderLiveMap` |
| `market.checkout` | Market | 🟡 | `/m/checkout`, `checkout/place` |
| `market.cart` | Market | 🟡 | BFF cart, `/m/cart` |
| `market.pdp` | Market | 🟡 | product detail, video PDP |

## Dispatch & Rider

| Feature ID | Status | Owner |
|------------|--------|-------|
| `dispatch.job` | 🟡 | `dispatch-svc`, `localDispatch` |
| `dispatch.timeline` | ✅ | `aqondEventBus` dispatch.* events |
| `rider.jobs` | 🟡 | `/m/rider/jobs` |
| `rider.active` | 🟡 | `/m/rider/active/[jobId]` |
| `rider.wallet` | 🟡 | `/m/rider/wallet`, `rider/earnings` |
| `rider.presence` | 🟡 | `riderPresence`, telemetry API |

## Merchant

| Feature ID | Status | Owner |
|------------|--------|-------|
| `merchant.orders` | 🟡 | `merchantOrders`, `/m/merchant` |
| `merchant.menu` | 🟡 | `merchant/menu` |
| `merchant.wallet` | 🟡 | `merchant/wallet` |
| `merchant.ad-video` | 🟡 | AIVOS merchant-ad |
| `merchant.food-os` | 🟡 | FoodMerchantOsView admin |

## Platform

| Feature ID | Status | Owner |
|------------|--------|-------|
| `platform.event-bus` | ✅ | `aqondEventBus.ts` |
| `platform.order-timeline` | ✅ | `orderTimeline.ts` |
| `platform.notifications` | 🟡 | FCM, `notifyEvents` |
| `platform.auth` | ✅ | backend auth, storefront `lib/auth` |

## Pay & Wallet

| Feature ID | Status | Owner |
|------------|--------|-------|
| `pay.checkout` | 🟡 | payment-svc, COD |
| `pay.wallet` | 🟡 | backend `/api/wallet`, wallet-svc |
| `pay.settlement` | ⬜ | planned P4 |
| `pay.escrow` | ⬜ | marketplace escrow-service |

## Growth

| Feature ID | Status | Owner |
|------------|--------|-------|
| `growth.affiliate` | 🟡 | `affiliateStats` |
| `growth.promo` | 🟡 | `couponClient`, promo validate |
| `growth.crm` | ⬜ | P5 |
| `growth.referral` | ⬜ | — |

## AI

| Feature ID | Status | Owner |
|------------|--------|-------|
| `ai.merchant-assistant` | 🟡 | `merchant-assistant` route |
| `ai.rider-voice` | 🟡 | `rider-voice` route |
| `ai.director` | 🟡 | merchant-ad director |
| `brain.ugc` | 🟡 | aqond-brain docs |

## DO NOT DUPLICATE

❌ `foodOrderService2` · ❌ parallel dispatch API · ❌ second event store  
✅ Extend `aqondEventBus`, `dispatchSvc`, `orderStore`
