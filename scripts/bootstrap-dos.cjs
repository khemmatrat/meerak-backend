#!/usr/bin/env node
/** Bootstrap AQOND Documentation Operating System files. Append-only for logs. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs');

function write(rel, content, { skipIfExists = false } = {}) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (skipIfExists && fs.existsSync(full)) {
    console.log('skip (exists):', rel);
    return;
  }
  fs.writeFileSync(full, content, 'utf8');
  console.log('wrote:', rel);
}

// --- README.md ---
write('README.md', `# AQOND Documentation Operating System (DOS)

**Last Updated:** 2026-06-29
**Current Development Phase:** Sprint — Merchant Ad Video + Storefront Commerce Integration
**Documentation Version:** 1.0.0

---

## Project Overview

AQOND (repository: \`meerak\`) is a multi-product commerce and services platform spanning:

- **Core mobile shell** (\`mobile/\`) — jobs, bookings, wallet, video feed
- **Storefront v2** (\`aqond-v2/apps/storefront/\`) — marketplace, food, merchant back-office, live commerce
- **Legacy backend** (\`backend/server.js\`) — monolith API, payments, wallet, courses, AIVOS
- **AIVOS** (\`backend/lib/aivos/\`) — AI runtime, workflows, merchant ad video, billing
- **Microservices** (\`aqond-v2/services/\`) — Go services behind Kong BFF
- **Admin** (\`nexus-admin-core/\`, \`ads-admin-core/\`)
- **AI media factory** (\`aqond-brain/\`) — offline Python pipelines

The DOS is the **permanent project memory**. AI agents and developers must read documentation before scanning code.

> Historical monorepo facts: see [AQOND-DOS.md](./AQOND-DOS.md) (preserved, do not delete).

---

## Current Sprint

**Focus:** Merchant Ad Video Studio — Grok video generation, product publish pipeline, home catalog visibility.

| Area | Status |
|------|--------|
| AIVOS merchant-ad backend (Grok per-shot) | Operational (dev) |
| Storefront Ad Studio UX | Background jobs, product form, publish |
| Product → Home catalog sync | Fixed affiliate overwrite bug |
| PDP video / mock Live rail | In progress |
| Production Grok path hardening | Pending ops restart verification |

---

## Documentation Navigation

| Document | Purpose |
|----------|---------|
| [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) | Full platform architecture |
| [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) | AI memory — module lookup |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | **Start here** — today's state |
| [ROADMAP.md](./ROADMAP.md) | Past, present, future work |
| [DECISIONS.md](./DECISIONS.md) | Architectural decision log |
| [API_CATALOG.md](./API_CATALOG.md) | API index |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Tables and storage |
| [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) | Module dependencies |
| [MODULE_MAP.md](./MODULE_MAP.md) | Per-module entry points |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Conventions |
| [REGRESSION_STATUS.md](./REGRESSION_STATUS.md) | Test / regression tracking |

### Engineering Logs

| Type | Location |
|------|----------|
| Daily | [engineering-log/daily/](./engineering-log/daily/) |
| Weekly | [engineering-log/weekly/](./engineering-log/weekly/) |
| Monthly | [engineering-log/monthly/](./engineering-log/monthly/) |

### Architecture Artifacts

| Location | Purpose |
|----------|---------|
| [architecture/](./architecture/) | Diagrams, deep dives |
| [reports/](./reports/) | Phase reports, audits |
| [images/](./images/) | Architecture screenshots |

---

## Latest Engineering Log

→ [engineering-log/daily/2026-06-29.md](./engineering-log/daily/2026-06-29.md)

---

## Start-of-Day Workflow (Required)

Read in order:

1. \`README.md\` (this file)
2. \`CURRENT_STATUS.md\`
3. \`MASTER_BLUEPRINT.md\` (skim relevant sections)
4. \`KNOWLEDGE_INDEX.md\` (locate task modules only)
5. \`DECISIONS.md\` (recent entries)
6. Latest daily engineering log

**Do not** full-repo scan until documentation is read.

---

## End-of-Day Workflow (Required)

1. Analyze today's changes
2. Update \`MASTER_BLUEPRINT.md\` if architecture changed
3. Update \`KNOWLEDGE_INDEX.md\` for new modules
4. Update \`CURRENT_STATUS.md\`
5. Update \`ROADMAP.md\` if milestones shifted
6. Append to \`DECISIONS.md\` for new decisions
7. Update \`API_CATALOG.md\` / \`DATABASE_SCHEMA.md\` if applicable
8. Update \`DEPENDENCY_GRAPH.md\` if relationships changed
9. Create **new** daily log (never overwrite)
10. Update \`REGRESSION_STATUS.md\`
11. Set tomorrow's recommended tasks in daily log

---

## AI Optimization Rules

- Use \`KNOWLEDGE_INDEX.md\` to find files — avoid whole-repo search
- Read only modules related to the current task
- Reuse existing services before creating new ones
- Never delete historical documentation — append only
- Documentation is source-of-truth for project status
`);

// --- CURRENT_STATUS.md ---
write('CURRENT_STATUS.md', `# AQOND — Current Status

**Last Updated:** 2026-06-29
**Current Sprint:** Merchant Ad Video + Storefront Product Integration

---

## Current Goal

Complete the merchant ad video → product → home storefront pipeline so merchants can:

1. Create AI ad clips (Grok video when configured)
2. AI-generate product copy (name, benefits, price, stock)
3. Publish products to catalog and home feed
4. Attach videos to PDP mock Video/Live rail

---

## Completed Percentage (Sprint Estimate)

| Workstream | % |
|------------|---|
| AIVOS merchant-ad backend | 85% |
| Storefront Ad Studio UI | 80% |
| Product catalog + home sync | 90% |
| PDP video integration | 40% |
| Production deployment hardening | 30% |
| **Overall sprint** | **~70%** |

---

## Modules Finished (Recent)

- AIVOS \`merchant-ad\` module (Phase 21): brief, generate, Grok bridge, token wallet, publish API
- Storefront: \`MerchantAdStudioClient\`, background job banner, progress ring
- Storefront: \`AdClipProductCard\` — AI product draft, save, publish
- \`loadHomeProducts()\` — local catalog + Kong merge, merchant-ad pinning
- \`affiliate.json\` overwrite fix in \`localCatalog.ts\`
- Dev proxy: \`AIVOS_MERCHANT_AD_DEV_KEY\`, backend runtime env fix

---

## Modules In Progress

| Module | Work Remaining |
|--------|----------------|
| PDP \`MobileProductClient\` | Swipe gallery + video autoplay polish |
| \`pdpStudioBridge\` | Catalog \`product_video_url\` + studio posts |
| Grok production path | Ensure \`mad-*\` jobs, not kenburns fallback |
| Merchant menu product cards | Image, SKU, add-video CTA |

---

## Modules Pending

- Full API catalog automation (CI scan)
- Database schema auto-sync from migrations
- E2E tests for publish → home visibility
- Kong/catalog-svc write path (vs local \`.data\` fallback)
- Multi-tenant merchant-ad quotas in production

---

## Current Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Kenburns fallback when backend proxy fails | High | \`.env.local\` dev key + backend restart |
| Local \`.data\` catalog not in production | High | Document catalog-svc integration path |
| \`affiliate.json\` stale links | Medium | Fixed: catalog wins over affiliate |
| Grok API cost / timeout | Medium | Per-shot timeout 4min, heartbeat progress |
| DOS drift from codebase | Medium | End-of-day workflow enforcement |

---

## Immediate Next Tasks

1. Verify Grok path end-to-end (\`mad-*\` jobs, not \`adv-*\` kenburns)
2. Complete PDP video slide autoplay on gallery swipe
3. Wire \`attachAdVideoToProduct\` for existing-product video button flow
4. Add regression test: publish product → appears in \`loadHomeProducts()\` fresh section
5. Update \`REGRESSION_STATUS.md\` after MAD test suite run

---

## Key Dev URLs

| Service | URL |
|---------|-----|
| Storefront | \`http://localhost:3003\` |
| Backend | \`http://localhost:3001\` |
| Ad Studio | \`http://localhost:3003/m/merchant/ad-studio\` |
| AIVOS health | \`GET /api/aivos/merchant-ad/health\` |
| Kong BFF | \`http://127.0.0.1:8000/api/v1/bff/v1/home\` |
`);

write('MASTER_BLUEPRINT.md', `# AQOND — Master Blueprint

**Last Updated:** 2026-06-29

Complete platform architecture reference for AQOND/meerak monorepo.

---

## Products

| Product | Path | Description |
|---------|------|-------------|
| Mobile Core | \`mobile/\` | Vite + React + Capacitor — jobs, wallet, feed, course marketplace |
| Storefront v2 | \`aqond-v2/apps/storefront/\` | Next.js 14 — marketplace, food, merchant ops, live commerce |
| Legacy Backend | \`backend/\` | Express monolith — auth, wallet, payments, courses, AIVOS |
| Nexus Admin | \`nexus-admin-core/\` | KYC, courses, content, ads summary |
| Ads Admin | \`ads-admin-core/\` | Campaign billing, fraud, optimization |
| AQOND Brain | \`aqond-brain/\` | Offline Python media/AI factory |
| Landing | \`landing-aqond/\` | Marketing site |
| Support MS | \`support/\` | Isolated support microservice |

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

### Go Microservices (\`aqond-v2/services/\`)
\`bff-svc\`, \`food-svc\`, \`wallet-svc\`, \`feed-svc\`, \`payment-svc\`, \`merchant-ops-svc\`, \`cart-svc\`, \`dispatch-svc\`, \`order-svc\`, \`catalog-svc\`, \`coins-svc\`

---

## Shared Services

### Payment
- \`backend/lib/paymentManager.js\`, \`paymentHttpClient.js\`
- Routes: \`/api/payments/*\`, \`/api/payment-gateway/*\`, webhooks
- v2: \`payment-svc\` (PaySo)

### Wallet
- Legacy: \`/api/wallet/*\` in \`server.js\`
- v2: \`wallet-svc\`, \`coins-svc\`
- Ledger: \`payment_ledger_audit\`, hybrid deposit (migration 158)

### Token
- Card tokenization: PaySo TEP via \`/api/payments/card-token\`
- LiveKit tokens: \`aqond-v2/live/token-service\`
- AIVOS merchant-ad clip tokens: \`.data/aivos/merchant-ad/token-wallets.json\`

### AI
- **AIVOS** (\`backend/lib/aivos/\`): runtime, marketplace, billing, governance, skills, workflows, merchant-ad
- **ai-core** (\`aqond-v2/infra/ai-core\`): storefront prompts
- **aqond-brain**: offline reels/hooks/Grok pipelines

### Feed
- Legacy: \`/api/videos/feed\`
- v2: \`feed-svc\`
- Storefront: \`/api/feed/social\`

---

## Integration Relationships

\`\`\`mermaid
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
\`\`\`

---

## Merchant Ad Video (Current Sprint Architecture)

\`\`\`mermaid
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
\`\`\`

---

## Future Products

- Unified catalog-svc write path (replace local \`.data\` in production)
- Full merchant-ad token economics in Postgres
- Cross-product affiliate + growth engine integration
- aqond-brain online serving via AIVOS skills
- Multi-region Citus scaling (aqond-v2 infra)

---

## Entry Points

| Service | Command | Port |
|---------|---------|------|
| Backend | \`cd backend && node server.js\` | 3001 |
| Storefront | \`cd aqond-v2/apps/storefront && npm run dev\` | 3003 |
| Mobile | \`cd mobile && npm run dev\` | 3000 |
| Kong | \`aqond-v2/infra\` docker compose | 8000 |

See [MODULE_MAP.md](./MODULE_MAP.md) for per-module routes.
`);

console.log('bootstrap-dos: core docs done');

write('KNOWLEDGE_INDEX.md', `# AQOND — Knowledge Index

**Last Updated:** 2026-06-29

AI memory index. Locate modules here before scanning code.

---

## Merchant Ad Video (AIVOS)

| Field | Value |
|-------|-------|
| **Location** | \`backend/lib/aivos/merchant-ad/\` |
| **Purpose** | AI ad clip wizard: brief → generate (Grok/ffmpeg) → publish → token wallet |
| **Dependencies** | AIVOS runtime, XAI API (Grok), ffmpeg, \`merchantAdStorage.js\` |
| **APIs** | \`/api/aivos/merchant-ad/*\` — see [API_CATALOG.md](./API_CATALOG.md) |
| **Database Tables** | JSON: \`.data/aivos/merchant-ad/jobs.json\`, \`token-wallets.json\` |
| **Owner Module** | AIVOS Phase 21 |

**Key files:** \`routes.js\`, \`videoEngine.js\`, \`grokVideoBridge.js\`, \`tokenEngine.js\`, \`config.js\`

---

## Merchant Ad Storefront

| Field | Value |
|-------|-------|
| **Location** | \`aqond-v2/apps/storefront/\` — \`components/mobile/MerchantAd*\`, \`lib/server/merchantAd*\` |
| **Purpose** | Ad Studio UI, BFF proxy to AIVOS, product draft/publish, background jobs |
| **Dependencies** | Backend AIVOS, \`merchantCatalog.ts\`, \`homeProducts.ts\` |
| **APIs** | \`/api/merchant/ad-video/*\` |
| **Database Tables** | \`.data/dev/catalog.json\`, \`merchant-ad-videos.json\`, \`listings/manifest.json\` |
| **Owner Module** | Storefront merchant |

**Key files:** \`MerchantAdStudioClient.tsx\`, \`AdClipProductCard.tsx\`, \`merchantAdPublish.ts\`, \`merchantAdProxy.ts\`

---

## Home Products / Catalog

| Field | Value |
|-------|-------|
| **Location** | \`aqond-v2/apps/storefront/lib/server/homeProducts.ts\`, \`localCatalog.ts\`, \`merchantCatalog.ts\` |
| **Purpose** | Merge Kong BFF + local catalog; pin merchant-ad products on home |
| **Dependencies** | \`marketplaceSync.ts\`, \`affiliate.json\` (studio) |
| **APIs** | \`/api/bff/v1/home\`, \`loadHomeProducts()\` |
| **Database Tables** | Local JSON catalog; production: catalog-svc |
| **Owner Module** | Storefront commerce |

---

## Wallet (Legacy)

| Field | Value |
|-------|-------|
| **Location** | \`backend/server.js\` (\`/api/wallet/*\`), migrations 158+ |
| **Purpose** | Deposits, topup, transactions, receipts, tax documents |
| **Dependencies** | PaySo, \`paymentManager.js\`, PostgreSQL |
| **APIs** | \`/api/wallet/summary\`, \`/deposit\`, \`/transactions\`, etc. |
| **Database Tables** | \`wallet_*\`, \`payment_ledger_audit\`, deposit webhook logs |
| **Owner Module** | Backend payments |

---

## Wallet (v2)

| Field | Value |
|-------|-------|
| **Location** | \`aqond-v2/services/wallet-svc/\`, \`coins-svc/\` |
| **Purpose** | Microservice wallet for v2 commerce |
| **Dependencies** | Kong, Postgres v2 migrations |
| **APIs** | Via BFF \`/api/bff/v1/wallet/*\` |
| **Owner Module** | aqond-v2 services |

---

## Payment

| Field | Value |
|-------|-------|
| **Location** | \`backend/lib/paymentManager.js\`, \`payment-svc/\` |
| **Purpose** | PaySo/Stripe intents, holds, webhooks, card tokenization |
| **APIs** | \`/api/payments/*\`, \`/api/payment-gateway/*\`, \`/api/webhooks/*\` |
| **Database Tables** | Payment intents, ledger audit, payout reconciliation |
| **Owner Module** | Backend + payment-svc |

---

## AIVOS Runtime

| Field | Value |
|-------|-------|
| **Location** | \`backend/lib/aivos/\` |
| **Purpose** | AI apps, skills, workflows, billing, governance, tenant sessions |
| **Dependencies** | \`AIVOS_RUNTIME_ENABLED=1\`, Postgres (semantic runtime migration 260) |
| **APIs** | \`/api/aivos/*\` |
| **Owner Module** | AIVOS |

Submodules: \`runtime/\`, \`marketplace/\`, \`billing/\`, \`governance/\`, \`skills/\`, \`workflows/\`, \`merchant-ad/\`

---

## Food

| Field | Value |
|-------|-------|
| **Location** | \`aqond-v2/services/food-svc/\`, storefront \`localFood.ts\` |
| **Purpose** | Nearby restaurants, menu, cart, order tracking |
| **APIs** | BFF \`v1/food/*\`, storefront \`/api/food/tracking/*\` |
| **Database Tables** | \`025_food_svc.sql\` + local food JSON |
| **Owner Module** | food-svc + storefront BFF |

---

## Course Marketplace

| Field | Value |
|-------|-------|
| **Location** | \`backend/lib/courseMarketplace/\`, \`nexus-admin-core/\` |
| **Purpose** | Udemy-style courses, studio, purchases, moderation |
| **APIs** | \`/api/courses/*\`, \`/api/course-marketplace/*\` |
| **Database Tables** | Migrations 235–246, 259 |
| **Owner Module** | Backend courses |

---

## Ads Platform

| Field | Value |
|-------|-------|
| **Location** | \`backend/lib/ads/\`, \`ads-admin-core/\` |
| **Purpose** | Campaigns, billing ledger, outcomes, optimization |
| **APIs** | \`/api/ads-admin/*\` |
| **Database Tables** | Migrations 247–256 (ads ledger, outbox, disputes) |
| **Owner Module** | Ads admin |

---

## Job Board

| Field | Value |
|-------|-------|
| **Location** | \`backend/server.js\`, \`mobile/\` job views |
| **Purpose** | Job posting, bids, advance procurement |
| **APIs** | \`/api/jobs/*\`, \`/api/advance-jobs/*\` |
| **Owner Module** | Backend + mobile |

---

## Admin (Nexus)

| Field | Value |
|-------|-------|
| **Location** | \`nexus-admin-core/\` |
| **Purpose** | KYC review, course admin, content, ads summary |
| **APIs** | \`/api/admin/*\` |
| **Owner Module** | Nexus admin UI |

---

## Live Commerce

| Field | Value |
|-------|-------|
| **Location** | \`aqond-v2/live/\`, storefront \`/api/live-commerce/*\` |
| **Purpose** | LiveKit streams, commerce overlay, studio playback |
| **Dependencies** | \`token-service\`, \`commerce-service\` |
| **Owner Module** | aqond-v2 live |

---

## Index Maintenance

When adding a module, append a new section. Never remove historical entries — mark **Status: deprecated** instead.
`);

write('ROADMAP.md', `# AQOND — Roadmap

**Last Updated:** 2026-06-29

---

## Completed

- Mobile core shell (jobs, wallet, feed, Capacitor Android)
- Legacy backend monolith (auth, wallet, payments, courses, KYC)
- Storefront v2 Next.js (\`/m/*\` routes, BFF, local catalog fallback)
- Go microservices scaffold (food, wallet, BFF, cart, dispatch, order)
- AIVOS Phases 1–20 (runtime, skills, workflows, billing)
- AIVOS merchant-ad Phases 21.0–21.1 (brief, generate, Grok, publish, tokens)
- Merchant Ad Studio UI + background jobs
- Product publish → catalog → home (affiliate overwrite fix)
- Course marketplace phases 3–18
- Ads platform ledger + optimization (migrations 247–256)
- Growth engine + Compass onboarding (257–258)

---

## Current (Q2–Q3 2026)

| Initiative | Target |
|------------|--------|
| Merchant Ad Video production hardening | Grok path, quotas, ops runbook |
| PDP video + mock Live rail | Gallery swipe autoplay |
| Catalog-svc production path | Replace \`.data\` JSON in prod |
| DOS synchronization | This documentation system |
| Regression automation | MAD suite + storefront E2E |

---

## Upcoming

- Merchant multi-shop ad quota dashboard
- Full Kong/catalog-svc write integration
- aqond-brain → AIVOS skill bridge (online media factory)
- Unified token economics (Postgres-backed merchant-ad wallets)
- Storefront checkout + merchant wallet fee polish
- Rider dispatch v2 hardening
- Course marketplace phase 19+ (gateway, moderation scale)

---

## Future Vision

- Single identity across mobile, storefront, admin
- AI-native commerce: Jarvis onboarding, ad studio, live selling
- Multi-region Postgres (Citus) for aqond-v2
- Outcome-based ads billing at platform scale
- Open merchant API + partner hash integrations
- Full PDPA/compliance automation across products
`);

write('DECISIONS.md', `# AQOND — Architectural Decisions

**Last Updated:** 2026-06-29

Never delete entries. Append new decisions with incrementing numbers.

---

## DOS-001 — Local catalog fallback for storefront dev

| Field | Value |
|-------|-------|
| **Date** | 2026-06-29 |
| **Problem** | Kong/catalog-svc not always running in local dev; home page empty |
| **Decision** | Storefront uses \`.data/dev/catalog.json\` via \`localCatalog.ts\` when Kong unavailable |
| **Reason** | Fast merchant-ad iteration without full infra stack |
| **Impact** | Dev/prod divergence; production must use catalog-svc |
| **Alternative Considered** | Require Docker compose for all dev sessions |
| **Status** | Accepted |

---

## DOS-002 — Catalog wins over affiliate.json

| Field | Value |
|-------|-------|
| **Date** | 2026-06-29 |
| **Problem** | Published merchant-ad products ranked last on home; \`source: merchant-ad\` stripped |
| **Decision** | \`localCatalog.ts\` skips affiliate overwrite when product already exists in catalog |
| **Reason** | Affiliate links are secondary; catalog is source of truth for merchant products |
| **Impact** | Home \`loadHomeProducts()\` correctly pins merchant-ad items |
| **Alternative Considered** | Merge affiliate metadata without replacing catalog row |
| **Status** | Accepted — verified by user |

---

## DOS-003 — Grok per-shot video with ffmpeg concat

| Field | Value |
|-------|-------|
| **Date** | 2026-06-28 |
| **Problem** | Single-shot Grok limits ad length; kenburns fallback low quality |
| **Decision** | \`videoEngine.js\` generates N Grok shots (max 4 default), concat via ffmpeg |
| **Reason** | Better quality clips; graceful per-shot timeout (4 min) |
| **Impact** | Higher XAI cost; requires \`XAI_API_KEY\` and ffmpeg on backend host |
| **Alternative Considered** | Kenburns-only fallback as default |
| **Status** | Accepted — kenburns behind \`MERCHANT_AD_ALLOW_KENBURNS_FALLBACK=1\` |

---

## DOS-004 — AIVOS dev key proxy from storefront

| Field | Value |
|-------|-------|
| **Date** | 2026-06-28 |
| **Problem** | Storefront could not auth to AIVOS merchant-ad; fell back to local kenburns (\`adv-*\`) |
| **Decision** | \`X-Aivos-Merchant-Ad-Key\` header + \`AIVOS_MERCHANT_AD_DEV_KEY\` in storefront \`.env.local\` |
| **Reason** | Route real jobs (\`mad-*\`) through backend in dev |
| **Impact** | Dev key must not ship to production without proper auth |
| **Alternative Considered** | Public unauthenticated AIVOS routes |
| **Status** | Accepted (dev only) |

---

## DOS-005 — Documentation Operating System as architecture

| Field | Value |
|-------|-------|
| **Date** | 2026-06-29 |
| **Problem** | AI sessions re-scan entire codebase; no persistent project memory |
| **Decision** | Maintain \`docs/\` DOS with start/end-of-day workflows; append-only logs |
| **Reason** | Reduce token usage; single source of truth for status |
| **Impact** | Every session must read/update docs; \`AQOND-DOS.md\` preserved as historical |
| **Alternative Considered** | Rely on PHASE*.md only (incomplete at repo root) |
| **Status** | Accepted — bootstrap in progress |
`);

write('API_CATALOG.md', `# AQOND — API Catalog

**Last Updated:** 2026-06-29

Indexed from codebase scan. For full legacy prefixes see [AQOND-DOS.md](./AQOND-DOS.md) §4.

---

## AIVOS Merchant Ad (\`/api/aivos/merchant-ad\`)

Auth: \`X-Aivos-Merchant-Ad-Key\` (dev) + AIVOS runtime enabled.

| Endpoint | Method | Auth | Owner | Notes |
|----------|--------|------|-------|-------|
| \`/health\` | GET | Dev key | merchant-ad | Runtime health |
| \`/quota\` | GET | Dev key | merchant-ad | Weekly clip limit |
| \`/jobs\` | GET | Dev key | merchant-ad | List jobs by merchant |
| \`/jobs/:jobId\` | GET | Dev key | merchant-ad | Job status + progress |
| \`/economics\` | GET | Dev key | merchant-ad | Token pricing |
| \`/tokens/topup\` | POST | Dev key | merchant-ad | Add clip tokens |
| \`/brief\` | POST | Dev key | merchant-ad | AI creative brief |
| \`/generate\` | POST | Dev key | merchant-ad | Start video job (\`mad-*\`) |
| \`/jobs/:jobId/publish\` | POST | Dev key | merchant-ad | Publish clip to feed |
| \`/files/:jobId/:file\` | GET | Dev key | merchant-ad | Rendered media |

**Shared services:** AIVOS runtime, XAI Grok, ffmpeg, S3/local storage

---

## Storefront Merchant Ad (\`/api/merchant/ad-video\`)

BFF layer; proxies to backend when configured.

| Endpoint | Method | Auth | Owner | Notes |
|----------|--------|------|-------|-------|
| \`/quota\` | GET | Session | storefront | Proxy quota |
| \`/brief\` | POST | Session | storefront | Proxy brief |
| \`/generate\` | POST | Session | storefront | Start job |
| \`/jobs\` | GET | Session | storefront | List jobs |
| \`/jobs/[id]\` | GET/PATCH | Session | storefront | Status; link product |
| \`/product-draft\` | POST | Session | storefront | AI product fields |
| \`/publish\` | POST | Session | storefront | Save product + publish video |
| \`/upload-image\` | POST | Session | storefront | Product image upload |
| \`/topup\` | POST | Session | storefront | Token topup proxy |
| \`/files/[jobId]/[file]\` | GET | Session | storefront | Media serve |

---

## Storefront BFF (\`/api/bff/v1\`)

| Endpoint | Method | Auth | Owner | Notes |
|----------|--------|------|-------|-------|
| \`/home\` | GET | Public | bff-svc / local | Home products |
| \`/food/nearby\` | GET | Public | food-svc | Nearby restaurants |
| \`/food/menu\` | GET | Public | food-svc | Menu items |
| \`/food/cart/*\` | * | Session | cart-svc | Food cart |
| \`[...path]\` | * | Varies | Kong proxy | Catch-all to Go services |

---

## Legacy Backend — Top Prefixes

| Prefix | Methods | Auth | Owner Module |
|--------|---------|------|--------------|
| \`/api/auth/*\` | POST | Public/session | Auth |
| \`/api/wallet/*\` | GET/POST | Session | Wallet |
| \`/api/payments/*\` | * | Session | Payment |
| \`/api/aivos/*\` | * | Feature flags | AIVOS |
| \`/api/jobs/*\` | * | Session | Jobs |
| \`/api/courses/*\` | * | Session | Courses |
| \`/api/admin/*\` | * | Admin | Admin |
| \`/api/ads-admin/*\` | * | Admin | Ads |
| \`/api/videos/*\` | * | Session | Feed |
| \`/api/growth/*\` | * | Session | Growth |

---

## Storefront Commerce

| Endpoint | Method | Owner |
|----------|--------|-------|
| \`/api/cart/items\` | GET/POST | cart |
| \`/api/checkout/place\` | POST | checkout |
| \`/api/orders\` | GET/POST | orders |
| \`/api/product/[id]/detail\` | GET | catalog |
| \`/api/merchant/products\` | GET/POST | merchant |
| \`/api/merchant/menu\` | GET/POST | merchant |
| \`/api/search\` | GET | search |
| \`/api/feed/social\` | GET | feed |

---

## Maintenance

Re-scan on end-of-day when APIs change:

\`\`\`bash
# Storefront routes
find aqond-v2/apps/storefront/app/api -name route.ts

# AIVOS merchant-ad
grep -r "app\\.(get|post)" backend/lib/aivos/merchant-ad/
\`\`\`
`);

write('DATABASE_SCHEMA.md', `# AQOND — Database Schema

**Last Updated:** 2026-06-29

---

## Storage Overview

| Store | Location | Purpose |
|-------|----------|---------|
| PostgreSQL (legacy) | \`meera_db\` | Primary backend — 260 migrations |
| PostgreSQL (v2) | aqond-v2 infra | Citus-oriented microservices |
| Redis | backend + v2 | Rate limits, sessions, pub/sub |
| S3 | \`backend/lib/s3-client.js\` | Uploads, media |
| JSON files | \`.data/\` | Dev catalog, AIVOS merchant-ad jobs |

---

## Merchant Ad (JSON — Dev)

### \`.data/aivos/merchant-ad/jobs.json\`
| Field | Purpose |
|-------|---------|
| \`id\` | Job ID (\`mad-*\`) |
| \`merchantId\` | Merchant scope |
| \`status\` | queued / processing / done / failed |
| \`progress\` | Heartbeat % |
| \`shots\` | Grok shot metadata |

**Owner:** AIVOS merchant-ad  
**Relationships:** Links to output files under \`output/\`

### \`.data/aivos/merchant-ad/token-wallets.json\`
| Field | Purpose |
|-------|---------|
| \`merchantId\` | Wallet key |
| \`balance\` | Clip generation tokens |

### \`.data/dev/catalog.json\` (Storefront)
| Field | Purpose |
|-------|---------|
| \`id\` | Product ID |
| \`merchant_id\` | Owner merchant |
| \`source\` | \`merchant-ad\` when from ad studio |
| \`product_video_url\` | PDP video |
| \`metadata.product_code\` | SKU display |

**Relationships:** \`marketplaceSync\` → \`listings/manifest.json\`, \`studio/affiliate.json\`

---

## PostgreSQL — Domain Groups (Legacy)

### Wallet & Payments
| Table / Migration | Purpose |
|-------------------|---------|
| \`payment_ledger_audit\` | Financial audit trail |
| \`158_hybrid_wallet_deposit\` | Wallet deposit flow |
| \`195_wallet_deposit_webhook_logs\` | PaySo webhook logs |
| \`196–198\` | Tax identity, fiscal documents |

### Courses
| Migration range | Purpose |
|-----------------|---------|
| \`235–246\` | Course marketplace phases |
| \`259_ai_video_platform\` | AI video platform tables |

### Ads
| Migration range | Purpose |
|-----------------|---------|
| \`247–256\` | Campaign ledger, outbox, outcomes, optimization |

### Identity / KYC
| Migration range | Purpose |
|-----------------|---------|
| \`204–205\`, \`223–225\` | KYC submissions, supplements |
| \`257_compass_onboarding\` | Compass flow |

### AI Runtime
| Migration | Purpose |
|-----------|---------|
| \`260_ai_runtime_semantic\` | AIVOS semantic runtime |

### Jobs
| Migration range | Purpose |
|-----------------|---------|
| \`091–098\`, \`231–234\` | Advance jobs, procurement |

---

## PostgreSQL — v2 (\`aqond-v2/infra/postgres/migrations\`)

| Migration | Purpose |
|-----------|---------|
| \`025_food_svc\` | Food service schema |
| \`034_merchant_wallet_fees\` | Merchant wallet fees |

---

## Indexes & FK Conventions

- Migrations numbered sequentially in \`backend/db/migrations/\`
- FK naming: \`*_id\` references parent table
- Audit tables: \`*_audit\`, \`*_ledger_events\`

---

## Migration History Command

\`\`\`bash
ls backend/db/migrations/*.sql | tail -20
ls aqond-v2/infra/postgres/migrations/
\`\`\`
`);

write('DEPENDENCY_GRAPH.md', `# AQOND — Dependency Graph

**Last Updated:** 2026-06-29

---

## Module Relationships

\`\`\`mermaid
flowchart LR
  subgraph storefront [Storefront]
    AdStudio[merchant ad-video API]
    HomeProd[homeProducts]
    Catalog[merchantCatalog]
    LocalCat[localCatalog]
  end

  subgraph backend [Backend]
    AIVOS[AIVOS runtime]
    MAD[merchant-ad]
    Wallet[wallet API]
    Pay[payments]
  end

  subgraph v2 [Go Services]
    BFF[bff-svc]
    Food[food-svc]
    WalSvc[wallet-svc]
  end

  AdStudio --> MAD
  AdStudio --> Catalog
  Catalog --> LocalCat
  HomeProd --> LocalCat
  HomeProd --> BFF
  MAD --> AIVOS
  Catalog --> BFF
  storefront --> Wallet
  BFF --> Food
  BFF --> WalSvc
\`\`\`

---

## Shared Services Dependencies

| Consumer | Shared Service | Coupling |
|----------|----------------|----------|
| merchant-ad | AIVOS runtime | Hard |
| merchant-ad | XAI Grok API | Optional (fallback kenburns) |
| storefront checkout | payment-svc / backend payments | Hard |
| mobile wallet | backend \`/api/wallet\` | Hard |
| storefront home | bff-svc OR localCatalog | Soft (dev fallback) |
| ads-admin | ads ledger tables | Hard |
| live commerce | token-service LiveKit | Hard |

---

## External Dependencies

| Package / Service | Used By |
|-------------------|---------|
| PostgreSQL | backend, v2 services, support |
| Redis | backend rate limit, dispatch |
| AWS S3 | backend uploads, storefront media |
| Firebase Auth | mobile, storefront |
| PaySo / Stripe | payments |
| XAI API | merchant-ad Grok |
| LiveKit | live commerce |
| ffmpeg | merchant-ad video concat |

---

## Circular Dependency Detection

| Check | Result |
|-------|--------|
| AIVOS ↔ merchant-ad | OK — merchant-ad is submodule |
| storefront ↔ backend | OK — HTTP only, no import cycle |
| localCatalog ↔ affiliate | **Was circular overwrite** — fixed DOS-002 |
| payment ↔ wallet | Soft — shared ledger, no code cycle |

**Critical path (merchant-ad sprint):**  
\`MerchantAdStudioClient\` → \`merchantAdProxy\` → \`backend merchant-ad\` → \`videoEngine\` → \`grokVideoBridge\` → publish → \`merchantCatalog\` → \`homeProducts\`

---

## Critical Paths

1. **Checkout:** cart → checkout/place → payment-svc → order-svc
2. **Wallet deposit:** wallet/deposit → PaySo webhook → ledger audit
3. **Merchant ad publish:** generate → publish → catalog → home BFF
4. **Food order:** food cart → checkout → dispatch-svc → rider jobs
`);

write('MODULE_MAP.md', `# AQOND — Module Map

**Last Updated:** 2026-06-29

---

## AIVOS Merchant Ad

| Field | Value |
|-------|-------|
| **Purpose** | AI merchant ad video generation and publish |
| **Entry Point** | \`backend/lib/aivos/merchant-ad/routes.js\` |
| **Routes** | \`/api/aivos/merchant-ad/*\` |
| **Services** | \`videoEngine.js\`, \`grokVideoBridge.js\`, \`tokenEngine.js\`, \`briefEngine.js\` |
| **Database** | \`.data/aivos/merchant-ad/*.json\` |
| **Shared Components** | AIVOS runtime, ffmpeg, XAI client |
| **Related APIs** | See [API_CATALOG.md](./API_CATALOG.md) |

---

## Storefront Merchant Ad Studio

| Field | Value |
|-------|-------|
| **Purpose** | Merchant UI for ad clips + product publish |
| **Entry Point** | \`app/m/merchant/ad-studio/page.tsx\` |
| **Routes** | \`/m/merchant/ad-studio\`, \`/api/merchant/ad-video/*\` |
| **Services** | \`merchantAdProxy.ts\`, \`merchantAdPublish.ts\`, \`merchantAdProductDraft.ts\` |
| **Database** | \`.data/dev/catalog.json\`, \`merchant-ad-videos.json\` |
| **Shared Components** | \`MerchantAdJobProvider\`, \`AdClipProductCard\`, \`AdVideoProgressRing\` |
| **Related APIs** | Storefront merchant ad-video routes |

---

## Home / Catalog

| Field | Value |
|-------|-------|
| **Purpose** | Home feed product loading and catalog persistence |
| **Entry Point** | \`lib/server/homeProducts.ts\` |
| **Routes** | \`/m/home\`, \`/api/bff/v1/home\` |
| **Services** | \`localCatalog.ts\`, \`merchantCatalog.ts\`, \`marketplaceSync.ts\` |
| **Database** | Local JSON + catalog-svc (prod) |
| **Related APIs** | BFF home, product detail |

---

## Backend Monolith

| Field | Value |
|-------|-------|
| **Purpose** | Primary API for mobile + admin + AIVOS |
| **Entry Point** | \`backend/server.js\` |
| **Routes** | \`/api/*\` — see API_CATALOG |
| **Services** | \`lib/*\` domain modules |
| **Database** | PostgreSQL \`meera_db\` |
| **Shared Components** | paymentManager, s3-client, redis client |

---

## Storefront BFF

| Field | Value |
|-------|-------|
| **Purpose** | Proxy to Kong/Go services + local handlers |
| **Entry Point** | \`app/api/bff/[...path]/route.ts\` |
| **Routes** | \`/api/bff/v1/*\` |
| **Services** | \`localFood.ts\`, \`localFoodCart.ts\`, \`homeProducts.ts\` |
| **Database** | v2 Postgres + local JSON |

---

## Wallet (Legacy)

| Field | Value |
|-------|-------|
| **Purpose** | User wallet deposits, transactions, receipts |
| **Entry Point** | \`backend/server.js\` wallet route block |
| **Routes** | \`/api/wallet/*\` |
| **Services** | paymentManager, ledger audit |
| **Database** | wallet tables, migration 158+ |

---

## Food Service

| Field | Value |
|-------|-------|
| **Purpose** | Restaurant discovery, menu, cart |
| **Entry Point** | \`aqond-v2/services/food-svc/main.go\` |
| **Routes** | Via Kong \`v1/food/*\` |
| **Database** | \`025_food_svc.sql\` |

---

## Course Marketplace

| Field | Value |
|-------|-------|
| **Purpose** | Online courses, studio, purchases |
| **Entry Point** | \`backend/lib/courseMarketplace/\` |
| **Routes** | \`/api/course-marketplace/*\` |
| **Database** | Migrations 235–246 |

---

## Ads Platform

| Field | Value |
|-------|-------|
| **Purpose** | Campaign management, billing, optimization |
| **Entry Point** | \`backend/lib/ads/\`, \`ads-admin-core/\` |
| **Routes** | \`/api/ads-admin/*\` |
| **Database** | Migrations 247–256 |

---

## Mobile Shell

| Field | Value |
|-------|-------|
| **Purpose** | Core app: jobs, wallet, feed, handoff to storefront |
| **Entry Point** | \`mobile/src/main.tsx\` |
| **Routes** | React Router pages |
| **Database** | Via backend API |
`);

write('CODING_STANDARDS.md', `# AQOND — Coding Standards

**Last Updated:** 2026-06-29  
Extracted from repository conventions.

---

## Folder Structure

| Area | Convention |
|------|------------|
| Legacy backend | \`backend/lib/<domain>/\`, \`backend/routes/\`, \`backend/db/migrations/\` |
| Storefront | Next.js App Router: \`app/\`, \`components/\`, \`lib/server/\` for server-only |
| Go services | \`aqond-v2/services/<name>-svc/main.go\` |
| AIVOS | \`backend/lib/aivos/<module>/\` — phases numbered, no breaking prior phases |
| Tests | \`backend/__tests__/\`, \`*.test.js\` adjacent to modules |
| Docs | \`docs/\` DOS + preserved historical \`.txt\` / \`.md\` |

---

## Naming

| Type | Convention | Example |
|------|------------|---------|
| API routes | kebab-case paths | \`/api/merchant/ad-video\` |
| Job IDs | prefix by module | \`mad-*\` (merchant-ad), \`adv-*\` (legacy local) |
| Env flags | \`AIVOS_*_ENABLED=1\` | \`AIVOS_MERCHANT_AD_GROK_VIDEO=1\` |
| Migrations | \`NNN_description.sql\` | \`260_ai_runtime_semantic.sql\` |
| React components | PascalCase | \`MerchantAdStudioClient.tsx\` |
| Server modules | camelCase files | \`merchantCatalog.ts\` |
| Go packages | short service name | \`food-svc\` |

---

## Error Handling

- Backend: Express \`try/catch\` with JSON \`{ error, message }\` responses
- Storefront API routes: \`NextResponse.json({ error }, { status })\`
- AIVOS: guard middleware on merchant-ad routes; 503 when runtime disabled
- Never swallow errors in payment/wallet paths — log + audit

---

## API Convention

- Legacy: \`/api/<domain>/<action>\`
- Storefront BFF: \`/api/bff/v1/<resource>\`
- Storefront domain APIs: \`/api/<domain>/...\` (merchant, cart, checkout)
- Auth: Firebase session / cookies for storefront; admin routes require admin role
- Dev-only headers documented in DECISIONS (e.g. \`X-Aivos-Merchant-Ad-Key\`)

---

## Database Convention

- Schema changes only via numbered SQL migrations
- Never edit applied migrations — add new file
- JSON \`.data\` stores for dev-only fallback (document in DOS)
- FK columns: \`<entity>_id\`
- Audit tables for financial events

---

## Architecture Rules

1. **AIVOS phases are additive** — Phase 21 (merchant-ad) must not break Phases 1–20
2. **Storefront server logic in \`lib/server/\`** — not in React components
3. **Prefer proxy to backend** over duplicating AIVOS logic in storefront
4. **Local catalog is dev fallback** — production targets catalog-svc
5. **Documentation append-only** — never delete historical DOS entries
6. **Reuse shared services** — paymentManager, s3-client, homeProducts before new modules

---

## Testing

- Backend: Node test files \`backend/__tests__/aivos*.test.js\`
- Merchant-ad suite: MAD01–MAD11
- Run backend tests after AIVOS changes with server env flags set
`);

write('REGRESSION_STATUS.md', `# AQOND — Regression Status

**Last Updated:** 2026-06-29  
**Latest Regression Date:** 2026-06-28 (MAD suite)  
**Regression Coverage:** ~40% (AIVOS merchant-ad focused; storefront E2E partial)

---

## Verified Modules

| Module | Last Verified | Test / Method |
|--------|---------------|---------------|
| AIVOS merchant-ad MAD01–11 | 2026-06-28 | \`backend/__tests__/aivosMerchantAd*.test.js\` |
| AIVOS runtime health | 2026-06-28 | Health endpoint with dev key |
| Home product order (merchant-ad) | 2026-06-29 | API manual — user confirmed |
| Catalog affiliate skip | 2026-06-29 | Code review + manual |
| Publish → merchant tab | 2026-06-29 | User verified |

---

## Broken Modules

| Module | Issue | Severity |
|--------|-------|----------|
| — | None open at bootstrap | — |

---

## Pending Verification

| Module | Test Needed |
|--------|-------------|
| Grok end-to-end (\`mad-*\`) | Full generate with XAI key after restart |
| PDP gallery video autoplay | Manual + optional Playwright |
| Existing product "เพิ่มวิดีโอ" flow | E2E ad-studio?product_id= |
| catalog-svc production path | Integration test vs local JSON |
| Kenburns fallback disabled default | Env flag regression |

---

## Regression Commands

\`\`\`bash
# Backend merchant-ad tests
cd backend
set AIVOS_RUNTIME_ENABLED=1
set AIVOS_MERCHANT_AD_ENABLED=1
node --test __tests__/aivosMerchantAd*.test.js

# Storefront dev
cd aqond-v2/apps/storefront
npm run dev
# Manual: publish product → check /m/home fresh section
\`\`\`

---

## History

| Date | Action |
|------|--------|
| 2026-06-29 | DOS bootstrap; regression doc created |
| 2026-06-28 | MAD01–11 pass (sprint 4 Grok) |
`);

write('engineering-log/daily/2026-06-29.md', `# Engineering Log — 2026-06-29

## Summary

Built and stabilized the **Merchant Ad Video → Product → Home** pipeline. Fixed critical bug where \`affiliate.json\` overwrote catalog products and stripped \`source: merchant-ad\`, causing published products to rank last on home page. Bootstrapped AQOND Documentation Operating System (DOS).

---

## Changes Made

### Storefront (\`aqond-v2/apps/storefront\`)

- **Ad Studio:** \`AdClipProductCard\` — AI product draft, save/publish, food gen styles
- **Home:** \`loadHomeProducts()\` + fresh merchant-ad section
- **Catalog:** \`merchantCatalog.ts\`, \`marketplaceSync.ts\`
- **Bug fix:** \`localCatalog.ts\` — skip affiliate overwrite when product in catalog
- **Merchant menu:** Product thumb, SKU, add-video link
- **PDP:** Gallery swipe + video autoplay (partial)

### Backend (\`backend/\`)

- AIVOS merchant-ad: Grok bridge, per-shot concat, heartbeat progress
- \`server.js\`: runtime env read fix
- Dev key auth for merchant-ad routes

### Documentation

- Created DOS structure under \`docs/\`
- Preserved historical \`AQOND-DOS.md\`
- Added \`scripts/bootstrap-dos.js\` for regeneration

---

## Decisions Recorded

DOS-001 through DOS-005 in \`DECISIONS.md\`

---

## Regression

| Suite | Result |
|-------|--------|
| MAD01–MAD11 | Pass (2026-06-28) |
| Home product visibility | Verified |
| Full E2E Grok | Pending |

---

## Tomorrow's Recommended Tasks

1. Run MAD test suite; update REGRESSION_STATUS
2. End-to-end Grok test (backend + storefront restarted)
3. PDP video from \`product_video_url\`
4. Document catalog-svc production path
5. Keep DOS synced at end of each session
`, { skipIfExists: true });

write('engineering-log/weekly/2026-W26.md', `# Weekly Engineering Log — 2026-W26

**Week of:** 2026-06-23 to 2026-06-29

---

## Highlights

- Merchant Ad Video sprint: Grok per-shot generation, storefront Ad Studio
- Product publish pipeline: AI draft → catalog → home feed
- Critical fix: affiliate.json no longer overwrites merchant-ad catalog entries
- AQOND DOS bootstrap — permanent project memory

---

## Modules Touched

- \`backend/lib/aivos/merchant-ad/\`
- \`aqond-v2/apps/storefront/\` (ad-studio, home, catalog)
- \`docs/\` (new DOS)

---

## Risks Carried Forward

- Production catalog-svc vs local \`.data\`
- Grok cost/timeout monitoring
- DOS drift without end-of-day discipline

---

## Next Week Focus

- PDP video integration complete
- Regression automation
- catalog-svc production documentation
`, { skipIfExists: true });

write('engineering-log/monthly/2026-06.md', `# Monthly Engineering Log — 2026-06

---

## June 2026 Summary

Major progress on **AIVOS Phase 21 (merchant-ad)** and **storefront commerce integration**.

### Shipped

- Merchant ad video wizard (brief, generate, publish)
- Grok image-to-video per-shot pipeline
- Storefront Ad Studio with background jobs
- Product AI draft and publish to catalog/home
- Home feed merchant-ad product pinning

### Infrastructure

- Dev proxy auth for AIVOS
- Local catalog fallback documented
- Documentation Operating System established

### Looking Ahead (July)

- Production hardening for merchant-ad
- catalog-svc write path
- Expanded regression coverage
`, { skipIfExists: true });

write('architecture/README.md', `# Architecture Artifacts

Store diagrams, deep-dive documents, and architecture decision visuals here.

## Current References

- [MASTER_BLUEPRINT.md](../MASTER_BLUEPRINT.md) — platform diagram (Mermaid)
- [DEPENDENCY_GRAPH.md](../DEPENDENCY_GRAPH.md) — module dependencies
- [AQOND-DOS.md](../AQOND-DOS.md) — historical monorepo facts (preserved)

## Planned Artifacts

- \`merchant-ad-flow.md\` — detailed sequence diagrams
- \`catalog-sync.md\` — local vs catalog-svc paths
- Images in \`../images/\`
`);

write('reports/README.md', `# Reports

Phase reports, audits, and production readiness assessments.

## Existing Reports (repo root docs/)

Historical \`.txt\` and \`.md\` files in \`docs/\` are preserved:

- \`PLATFORM_OVERVIEW.txt\`
- \`PRODUCTION_READINESS_FINAL.txt\`
- \`PAYMENT_SYSTEM_PRODUCTION_READINESS_ASSESSMENT.txt\`
- \`PHASE3_PROGRESS.txt\`
- \`WORKFLOW_FLOWCHART.md\`
- \`ROADMAP_SAFETY_AND_RATE_LIMIT.md\`

New structured reports should be added here without removing originals.
`);

console.log('bootstrap-dos: complete');


