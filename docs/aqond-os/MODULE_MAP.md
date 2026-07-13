# AQOND — Module Map

**Last Updated:** 2026-06-29

---

## AIVOS Merchant Ad

| Field | Value |
|-------|-------|
| **Purpose** | AI merchant ad video generation and publish |
| **Entry Point** | `backend/lib/aivos/merchant-ad/routes.js` |
| **Routes** | `/api/aivos/merchant-ad/*` |
| **Services** | `videoEngine.js`, `grokVideoBridge.js`, `tokenEngine.js`, `briefEngine.js` |
| **Database** | `.data/aivos/merchant-ad/*.json` |
| **Shared Components** | AIVOS runtime, ffmpeg, XAI client |
| **Related APIs** | See [API_CATALOG.md](./API_CATALOG.md) |

---

## Storefront Merchant Ad Studio

| Field | Value |
|-------|-------|
| **Purpose** | Merchant UI for ad clips + product publish |
| **Entry Point** | `app/m/merchant/ad-studio/page.tsx` |
| **Routes** | `/m/merchant/ad-studio`, `/api/merchant/ad-video/*` |
| **Services** | `merchantAdProxy.ts`, `merchantAdPublish.ts`, `merchantAdProductDraft.ts` |
| **Database** | `.data/dev/catalog.json`, `merchant-ad-videos.json` |
| **Shared Components** | `MerchantAdJobProvider`, `AdClipProductCard`, `AdVideoProgressRing` |
| **Related APIs** | Storefront merchant ad-video routes |

---

## Home / Catalog

| Field | Value |
|-------|-------|
| **Purpose** | Home feed product loading and catalog persistence |
| **Entry Point** | `lib/server/homeProducts.ts` |
| **Routes** | `/m/home`, `/api/bff/v1/home` |
| **Services** | `localCatalog.ts`, `merchantCatalog.ts`, `marketplaceSync.ts` |
| **Database** | Local JSON + catalog-svc (prod) |
| **Related APIs** | BFF home, product detail |

---

## Backend Monolith

| Field | Value |
|-------|-------|
| **Purpose** | Primary API for mobile + admin + AIVOS |
| **Entry Point** | `backend/server.js` |
| **Routes** | `/api/*` — see API_CATALOG |
| **Services** | `lib/*` domain modules |
| **Database** | PostgreSQL `meera_db` |
| **Shared Components** | paymentManager, s3-client, redis client |

---

## Storefront BFF

| Field | Value |
|-------|-------|
| **Purpose** | Proxy to Kong/Go services + local handlers |
| **Entry Point** | `app/api/bff/[...path]/route.ts` |
| **Routes** | `/api/bff/v1/*` |
| **Services** | `localFood.ts`, `localFoodCart.ts`, `homeProducts.ts` |
| **Database** | v2 Postgres + local JSON |

---

## Wallet (Legacy)

| Field | Value |
|-------|-------|
| **Purpose** | User wallet deposits, transactions, receipts |
| **Entry Point** | `backend/server.js` wallet route block |
| **Routes** | `/api/wallet/*` |
| **Services** | paymentManager, ledger audit |
| **Database** | wallet tables, migration 158+ |

---

## Food Service

| Field | Value |
|-------|-------|
| **Purpose** | Restaurant discovery, menu, cart |
| **Entry Point** | `aqond-v2/services/food-svc/main.go` |
| **Routes** | Via Kong `v1/food/*` |
| **Database** | `025_food_svc.sql` |

---

## Course Marketplace

| Field | Value |
|-------|-------|
| **Purpose** | Online courses, studio, purchases |
| **Entry Point** | `backend/lib/courseMarketplace/` |
| **Routes** | `/api/course-marketplace/*` |
| **Database** | Migrations 235–246 |

---

## Ads Platform

| Field | Value |
|-------|-------|
| **Purpose** | Campaign management, billing, optimization |
| **Entry Point** | `backend/lib/ads/`, `ads-admin-core/` |
| **Routes** | `/api/ads-admin/*` |
| **Database** | Migrations 247–256 |

---

## Mobile Shell

| Field | Value |
|-------|-------|
| **Purpose** | Core app: jobs, wallet, feed, handoff to storefront |
| **Entry Point** | `mobile/src/main.tsx` |
| **Routes** | React Router pages |
| **Database** | Via backend API |
