# AQOND — Master Blueprint

**Last Updated:** 2026-06-29

Complete platform architecture reference for AQOND/meerak monorepo.

---

## Products

| Product | Path | Description |
|---------|------|-------------|
| Mobile Core | `mobile/` | Vite + React + Capacitor — jobs, wallet, feed, course marketplace |
| Storefront v2 | `aqond-v2/apps/storefront/` | Next.js 14 — marketplace, food, merchant ops, live commerce |
| Legacy Backend | `backend/` | Express monolith — auth, wallet, payments, courses, AIVOS |
| Nexus Admin | `nexus-admin-core/` | KYC, courses, content, ads summary |
| Ads Admin | `ads-admin-core/` | Campaign billing, fraud, optimization |
| AQOND Brain | `aqond-brain/` | Offline Python media/AI factory |
| Landing | `landing-aqond/` | Marketing site |
| Support MS | `support/` | Isolated support microservice |

---

## Modules (High Level)

### Backend Domains
- Auth / KYC / Onboarding (Compass)
- Job board + Advance jobs (procurement)
- Bookings / Bids
- Course marketplace + Studio + LMS
- Wallet + Payments (PaySo, Stripe)
- Video feed + Stories
- Growth engine + Subscriptions
- Ads platform (campaigns, ledger, outcomes)
- AIVOS (AI runtime, skills, workflows, merchant-ad)
- Marine, Insurance, PRB modules

### Storefront v2 Domains
- Home / Search / Product PDP
- Cart / Checkout / Orders
- Merchant back-office (shops, menu, ad-studio, wallet)
- Food nearby / cart / tracking
- Rider dispatch
- Live commerce + Studio playback
- Shop chat, notifications, AI Jarvis

### Go Microservices (`aqond-v2/services/`)
`bff-svc`, `food-svc`, `wallet-svc`, `feed-svc`, `payment-svc`, `merchant-ops-svc`, `cart-svc`, `dispatch-svc`, `order-svc`, `catalog-svc`, `coins-svc`

---

## Shared Services

### Payment
- `backend/lib/paymentManager.js`, `paymentHttpClient.js`
- Routes: `/api/payments/*`, `/api/payment-gateway/*`, webhooks
- v2: `payment-svc` (PaySo)

### Wallet
- Legacy: `/api/wallet/*` in `server.js`
- v2: `wallet-svc`, `coins-svc`
- Ledger: `payment_ledger_audit`, hybrid deposit (migration 158)

### Token
- Card tokenization: PaySo TEP via `/api/payments/card-token`
- LiveKit tokens: `aqond-v2/live/token-service`
- AIVOS merchant-ad clip tokens: `.data/aivos/merchant-ad/token-wallets.json`

### AI
- **AIVOS** (`backend/lib/aivos/`): runtime, marketplace, billing, governance, skills, workflows, merchant-ad
- **ai-core** (`aqond-v2/infra/ai-core`): storefront prompts
- **aqond-brain**: offline reels/hooks/Grok pipelines

### Feed
- Legacy: `/api/videos/feed`
- v2: `feed-svc`
- Storefront: `/api/feed/social`

---

## Integration Relationships

```mermaid
flowchart TB
  subgraph clients [Clients]
    Mobile[mobile Capacitor]
    Storefront[storefront Next.js]
    NexusAdmin[nexus-admin-core]
    AdsAdmin[ads-admin-core]
  end

  subgraph edge [Edge]
    Kong[Kong BFF :8000]
    NextAPI[storefront /api/*]
  end

  subgraph core [Core]
    Backend[backend server.js :3001]
    AIVOS[AIVOS merchant-ad]
    GoSvc[Go microservices]
  end

  subgraph data [Data]
    PG[(PostgreSQL meera_db)]
    PGv2[(aqond-v2 Postgres)]
    Redis[(Redis)]
    S3[(S3)]
    LocalData[.data JSON stores]
  end

  Mobile --> Backend
  Storefront --> NextAPI
  NextAPI --> Kong
  NextAPI --> LocalData
  Kong --> GoSvc
  NextAPI --> Backend
  Backend --> AIVOS
  Backend --> PG
  Backend --> Redis
  Backend --> S3
  AIVOS --> LocalData
  GoSvc --> PGv2
  NexusAdmin --> Backend
  AdsAdmin --> Backend
```

---

## Merchant Ad Video (Current Sprint Architecture)

```mermaid
sequenceDiagram
  participant M as Merchant UI
  participant SF as Storefront API
  participant BE as Backend AIVOS
  participant XAI as Grok XAI
  participant Cat as localCatalog

  M->>SF: POST /api/merchant/ad-video/generate
  SF->>BE: proxy with dev key
  BE->>XAI: per-shot image-to-video
  BE-->>SF: mad-* job progress
  M->>SF: POST product-draft
  SF-->>M: AI name/price/stock
  M->>SF: POST publish
  SF->>Cat: saveProduct + syncMarketplace
  SF-->>M: product on home feed
```

---

## Future Products

- Unified catalog-svc write path (replace local `.data` in production)
- Full merchant-ad token economics in Postgres
- Cross-product affiliate + growth engine integration
- aqond-brain online serving via AIVOS skills
- Multi-region Citus scaling (aqond-v2 infra)

---

## Entry Points

| Service | Command | Port |
|---------|---------|------|
| Backend | `cd backend && node server.js` | 3001 |
| Storefront | `cd aqond-v2/apps/storefront && npm run dev` | 3003 |
| Mobile | `cd mobile && npm run dev` | 3000 |
| Kong | `aqond-v2/infra` docker compose | 8000 |

See [MODULE_MAP.md](./MODULE_MAP.md) for per-module routes.
