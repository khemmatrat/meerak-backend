# AQOND — API Catalog

**Last Updated:** 2026-06-29
**Scope:** AIVOS merchant-ad detail (deep reference) + legacy backend prefixes.
**For current Storefront BFF routes (orders, checkout, food, rider, merchant, admin):** see [API_REGISTRY.md](./API_REGISTRY.md) — this is the live source of truth, do not duplicate here.

Indexed from codebase scan. For full legacy prefixes see [AQOND-DOS.md](./AQOND-DOS.md) §4.

---

## AIVOS Merchant Ad (`/api/aivos/merchant-ad`)

Auth: `X-Aivos-Merchant-Ad-Key` (dev) + AIVOS runtime enabled.

| Endpoint               | Method | Auth    | Owner       | Notes                     |
| ---------------------- | ------ | ------- | ----------- | ------------------------- |
| `/health`              | GET    | Dev key | merchant-ad | Runtime health            |
| `/quota`               | GET    | Dev key | merchant-ad | Weekly clip limit         |
| `/jobs`                | GET    | Dev key | merchant-ad | List jobs by merchant     |
| `/jobs/:jobId`         | GET    | Dev key | merchant-ad | Job status + progress     |
| `/economics`           | GET    | Dev key | merchant-ad | Token pricing             |
| `/tokens/topup`        | POST   | Dev key | merchant-ad | Add clip tokens           |
| `/brief`               | POST   | Dev key | merchant-ad | AI creative brief         |
| `/generate`            | POST   | Dev key | merchant-ad | Start video job (`mad-*`) |
| `/jobs/:jobId/publish` | POST   | Dev key | merchant-ad | Publish clip to feed      |
| `/files/:jobId/:file`  | GET    | Dev key | merchant-ad | Rendered media            |

**Shared services:** AIVOS runtime, XAI Grok, ffmpeg, S3/local storage

_(referenced from API_REGISTRY.md Merchant table row `/api/merchant/ad-video/_` — this is the detailed breakdown of that row)\*

---

## Storefront Merchant Ad (`/api/merchant/ad-video`)

BFF layer; proxies to backend when configured.

| Endpoint                | Method    | Auth    | Owner      | Notes                        |
| ----------------------- | --------- | ------- | ---------- | ---------------------------- |
| `/quota`                | GET       | Session | storefront | Proxy quota                  |
| `/brief`                | POST      | Session | storefront | Proxy brief                  |
| `/generate`             | POST      | Session | storefront | Start job                    |
| `/jobs`                 | GET       | Session | storefront | List jobs                    |
| `/jobs/[id]`            | GET/PATCH | Session | storefront | Status; link product         |
| `/product-draft`        | POST      | Session | storefront | AI product fields            |
| `/publish`              | POST      | Session | storefront | Save product + publish video |
| `/upload-image`         | POST      | Session | storefront | Product image upload         |
| `/topup`                | POST      | Session | storefront | Token topup proxy            |
| `/files/[jobId]/[file]` | GET       | Session | storefront | Media serve                  |

---

## Legacy Backend — Top Prefixes

| Prefix             | Methods  | Auth           | Owner Module |
| ------------------ | -------- | -------------- | ------------ |
| `/api/auth/*`      | POST     | Public/session | Auth         |
| `/api/wallet/*`    | GET/POST | Session        | Wallet       |
| `/api/payments/*`  | \*       | Session        | Payment      |
| `/api/aivos/*`     | \*       | Feature flags  | AIVOS        |
| `/api/jobs/*`      | \*       | Session        | Jobs         |
| `/api/courses/*`   | \*       | Session        | Courses      |
| `/api/admin/*`     | \*       | Admin          | Admin        |
| `/api/ads-admin/*` | \*       | Admin          | Ads          |
| `/api/videos/*`    | \*       | Session        | Feed         |
| `/api/growth/*`    | \*       | Session        | Growth       |

---

## ~~Storefront BFF~~ / ~~Storefront Commerce~~ (ลบออก — ย้ายไป API_REGISTRY.md แล้ว)

> Section เหล่านี้ถูกลบเพราะซ้ำกับ "Orders & Checkout" ใน API_REGISTRY.md ทุก route (`/api/checkout/place`, `/api/orders`, `/api/product/[id]/detail`, `/api/merchant/products`, `/api/merchant/menu`, `/api/search`, `/api/feed/social`, `/api/bff/v1/*`) ให้เช็คที่ API_REGISTRY.md เท่านั้นจากนี้ไป

---

## Maintenance

Re-scan on end-of-day when APIs change:

```bash
# AIVOS merchant-ad
grep -r "app\.(get|post)" backend/lib/aivos/merchant-ad/
```

> หมายเหตุ: คำสั่ง scan สำหรับ Storefront routes (`find aqond-v2/apps/storefront/app/api -name route.ts`) ย้ายไปอยู่ใน API_REGISTRY.md แทน เพราะไฟล์นั้นคือ source of truth ของ route กลุ่มนี้แล้ว
