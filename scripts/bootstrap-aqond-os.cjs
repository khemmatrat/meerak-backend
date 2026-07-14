#!/usr/bin/env node
/** Bootstrap AQOND-OS — isolated AI documentation workspace under docs/aqond-os/ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs', 'aqond-os');
const TODAY = '2026-06-30';

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

function touchDir(rel) {
  const full = path.join(ROOT, rel, '.gitkeep');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, '', 'utf8');
    console.log('wrote:', rel + '/.gitkeep');
  }
}

// --- README.md ---
write('README.md', `# AQOND Documentation Operating System (AQOND-OS)

**Last Updated:** ${TODAY}
**Documentation Version:** 1.0.0
**Workspace:** \`docs/aqond-os/\` — **the ONLY official documentation workspace for AI during development**

---

## Objective

AQOND-OS is the permanent project memory for the AQOND/meerak monorepo. A new AI session must understand the entire project by reading **only this folder** before touching source code.

> **Do not** scan unrelated files under \`docs/\`. Historical monorepo facts live in [\`../AQOND-DOS.md\`](../AQOND-DOS.md) — reference via [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) only when needed.

---

## Project Overview

AQOND (repository: \`meerak\`) is a multi-product commerce and services platform:

| Product | Path | Doc |
|---------|------|-----|
| Services (mobile core) | \`mobile/\` | [products/services.md](./products/services.md) |
| Food | \`aqond-v2/services/food-svc/\` | [products/food.md](./products/food.md) |
| Market / Storefront | \`aqond-v2/apps/storefront/\` | [products/market.md](./products/market.md) |
| Brain (AI media) | \`aqond-brain/\` | [products/brain.md](./products/brain.md) |
| Pay (wallet/payments) | \`backend/\`, \`payment-svc/\` | [products/pay.md](./products/pay.md) |
| Admin | \`nexus-admin-core/\`, \`ads-admin-core/\` | [products/admin.md](./products/admin.md) |

Shared backend: \`backend/server.js\` (Express monolith, port **3001**).  
AIVOS AI platform: \`backend/lib/aivos/\`.  
v2 microservices: \`aqond-v2/services/\` (Go, Kong BFF).

---

## AI Reading Rules (Required — Start of Every Session)

### Before writing code (minimal resume set)

1. [SESSION.md](./SESSION.md) — **live working memory; resume from Resume Point**
2. [CURRENT_STATUS.md](./CURRENT_STATUS.md)
3. [NEXT_TASK.md](./NEXT_TASK.md)

If SESSION.md exists: **do NOT** restart project analysis or rediscover completed work.  
Only open additional files when SESSION.md or the Knowledge Index requires it.

### Full context (first session or architecture work)

4. [README.md](./README.md) (this file)
5. [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) (skim relevant sections)
6. [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) (locate task modules only)
7. [DECISIONS.md](./DECISIONS.md) (recent entries)
8. Latest file in [logs/daily/](./logs/daily/)

**Do NOT** scan unrelated markdown under \`docs/\` unless explicitly referenced by the Knowledge Index.

---

## Documentation Priority (Source of Truth)

| File | Role |
|------|------|
| SESSION.md | **Live working memory** — current session; overwritten during dev |
| README.md | Entry point, rules |
| CURRENT_STATUS.md | Today's state |
| MASTER_BLUEPRINT.md | Architecture |
| KNOWLEDGE_INDEX.md | AI navigation map |
| DECISIONS.md | Architectural decisions |
| NEXT_TASK.md | Tomorrow's starting point |

If documentation and code differ, **report the inconsistency** before making changes.

---

## SESSION.md Rules

- **One file only:** \`docs/aqond-os/SESSION.md\`
- **During development:** update continuously (progress, working files, resume point, regression)
- **Before writing code:** read SESSION.md; resume from Resume Point
- **End of session:** finalize SESSION.md, then sync to other docs below

## Documentation Maintenance (After Every Completed Task)

0. Update [SESSION.md](./SESSION.md) — progress, resume point, regression checklist
1. Update [CURRENT_STATUS.md](./CURRENT_STATUS.md)
2. Update [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) if architecture changed
3. Update [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md)
4. Update [API_CATALOG.md](./API_CATALOG.md) if APIs changed
5. Update [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) if database changed
6. Update [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) if dependencies changed
7. Update [MODULE_MAP.md](./MODULE_MAP.md) if modules changed
8. Update [DECISIONS.md](./DECISIONS.md) if architectural decisions were made
9. Update [NEXT_TASK.md](./NEXT_TASK.md)
10. Generate a **new** daily log in [logs/daily/](./logs/daily/) (append-only, never overwrite)

---

## Navigation

| Document | Purpose |
|----------|---------|
| [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) | Full platform architecture |
| [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) | Module lookup — use before scanning code |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | **Start here** — today's state |
| [NEXT_TASK.md](./NEXT_TASK.md) | Current sprint task card |
| [ROADMAP.md](./ROADMAP.md) | Past, present, future work |
| [DECISIONS.md](./DECISIONS.md) | Architectural decision log |
| [API_CATALOG.md](./API_CATALOG.md) | API index |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Tables and storage |
| [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) | Module dependencies |
| [MODULE_MAP.md](./MODULE_MAP.md) | Per-module entry points |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Conventions |
| [REGRESSION_STATUS.md](./REGRESSION_STATUS.md) | Test / regression tracking |

### Products

[products/services.md](./products/services.md) · [products/food.md](./products/food.md) · [products/market.md](./products/market.md) · [products/brain.md](./products/brain.md) · [products/pay.md](./products/pay.md) · [products/admin.md](./products/admin.md)

### Logs & Artifacts

| Type | Location |
|------|----------|
| Daily | [logs/daily/](./logs/daily/) |
| Weekly | [logs/weekly/](./logs/weekly/) |
| Monthly | [logs/monthly/](./logs/monthly/) |
| Archive | [logs/archive/](./logs/archive/) |
| Reports | [reports/](./reports/) |
| Architecture | [architecture/](./architecture/) |
| Diagrams | [diagrams/](./diagrams/) |

---

## Performance Optimization

- Use [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) first — never scan the whole repository if the index identifies the correct files
- Analyze only relevant source code for the current task
- Minimize token consumption

---

## Latest Daily Log

→ [logs/daily/${TODAY}.md](./logs/daily/${TODAY}.md)
`);

write('CURRENT_STATUS.md', `# AQOND — Current Status

**Last Updated:** ${TODAY}
**Current Sprint:** Merchant Ad Video + Storefront Product Integration
**AQOND-OS Version:** 1.0.0 (initial bootstrap)

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
| AQOND-OS documentation | 100% (bootstrap) |
| **Overall sprint** | **~70%** |

---

## Modules Finished (Recent)

- AIVOS \`merchant-ad\` module (Phase 21): brief, generate, Grok bridge, token wallet, publish API
- Storefront: \`MerchantAdStudioClient\`, background job banner, progress ring
- Storefront: \`AdClipProductCard\` — AI product draft, save, publish
- \`loadHomeProducts()\` — local catalog + Kong merge, merchant-ad pinning
- \`affiliate.json\` overwrite fix in \`localCatalog.ts\`
- Dev proxy: \`AIVOS_MERCHANT_AD_DEV_KEY\`, backend runtime env fix
- AQOND-OS isolated documentation workspace under \`docs/aqond-os/\`

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
| \`affiliate.json\` stale links | Medium | Fixed: catalog wins over affiliate (DOS-002) |
| Grok API cost / timeout | Medium | Per-shot timeout 4min, heartbeat progress |
| AQOND-OS drift from codebase | Medium | End-of-task workflow enforcement |

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

write('NEXT_TASK.md', `# AQOND — Next Task

**Last Updated:** ${TODAY}
**This file is tomorrow's starting point.**

---

## Current Sprint

**Merchant Ad Video + Storefront Product Integration** (Q2–Q3 2026)

---

## Current Objective

Harden the end-to-end merchant ad video pipeline: Grok generation (\`mad-*\` jobs) → product publish → home catalog visibility → PDP video playback.

---

## Files to Modify

| Priority | Path | Why |
|----------|------|-----|
| P0 | \`aqond-v2/apps/storefront/components/mobile/MobileProductClient.tsx\` | PDP gallery video autoplay |
| P0 | \`aqond-v2/apps/storefront/lib/server/pdpStudioBridge.ts\` | Wire \`product_video_url\` from catalog |
| P1 | \`backend/lib/aivos/merchant-ad/videoEngine.js\` | Verify Grok path, no kenburns fallback |
| P1 | \`aqond-v2/apps/storefront/lib/server/merchantAdPublish.ts\` | Existing-product video attach flow |
| P2 | \`docs/aqond-os/REGRESSION_STATUS.md\` | After MAD test run |
| P2 | \`docs/aqond-os/logs/daily/\` | End-of-session daily log |

---

## Dependencies

- Backend running with \`AIVOS_RUNTIME_ENABLED=1\`, \`AIVOS_MERCHANT_AD_ENABLED=1\`
- \`XAI_API_KEY\` set for Grok video (not kenburns \`adv-*\`)
- Storefront \`.env.local\`: \`AIVOS_MERCHANT_AD_DEV_KEY\`
- ffmpeg on backend host for shot concat
- See [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) → Merchant Ad Video, Home Products

---

## Risks

| Risk | Impact |
|------|--------|
| Backend not restarted after env change | Falls back to kenburns (\`adv-*\`) |
| Local \`.data\` catalog vs production catalog-svc | Publish works in dev only |
| Grok timeout on slow shots | Job stuck; heartbeat should recover |

---

## Regression Scope

- AIVOS merchant-ad MAD01–MAD11 (\`backend/__tests__/aivosMerchantAd*.test.js\`)
- Manual: publish product → appears in \`loadHomeProducts()\` fresh section
- Manual: PDP video plays on gallery swipe
- Do **not** regress: wallet, job board, course marketplace payment flows

---

## Recommended First Action

1. Read [CURRENT_STATUS.md](./CURRENT_STATUS.md) and latest [logs/daily/](./logs/daily/)
2. Restart backend + storefront with correct env flags
3. Run \`GET /api/aivos/merchant-ad/health\` — confirm runtime enabled
4. Generate one ad clip; confirm job ID prefix is \`mad-*\` (not \`adv-*\`)
5. Publish product; verify home feed fresh section
`);

write('MASTER_BLUEPRINT.md', `# AQOND — Master Blueprint

**Last Updated:** ${TODAY}

Complete platform architecture reference for AQOND/meerak monorepo.

---

## Products

| Product | Path | Doc |
|---------|------|-----|
| Services (mobile) | \`mobile/\` | [products/services.md](./products/services.md) |
| Food | \`aqond-v2/services/food-svc/\` | [products/food.md](./products/food.md) |
| Market | \`aqond-v2/apps/storefront/\` | [products/market.md](./products/market.md) |
| Brain | \`aqond-brain/\` | [products/brain.md](./products/brain.md) |
| Pay | \`backend/\`, payment-svc | [products/pay.md](./products/pay.md) |
| Admin | \`nexus-admin-core/\`, \`ads-admin-core/\` | [products/admin.md](./products/admin.md) |

---

## Platform Layers

### Clients
- **Mobile** (\`mobile/\`) — Vite + React + Capacitor, port 3000
- **Storefront v2** (\`aqond-v2/apps/storefront/\`) — Next.js 14, port 3003
- **Nexus Admin** (\`nexus-admin-core/\`) — KYC, courses, content
- **Ads Admin** (\`ads-admin-core/\`) — campaigns, billing, fraud
- **Landing** (\`landing-aqond/\`) — marketing, port 3009

### Core Backend
- **Legacy monolith** (\`backend/server.js\`) — auth, wallet, payments, courses, AIVOS, port 3001
- **AIVOS** (\`backend/lib/aivos/\`) — AI runtime, skills, workflows, merchant-ad
- **Support MS** (\`support/\`) — isolated support microservice

### v2 Microservices (\`aqond-v2/services/\`)
\`bff-svc\`, \`food-svc\`, \`wallet-svc\`, \`feed-svc\`, \`payment-svc\`, \`merchant-ops-svc\`, \`cart-svc\`, \`dispatch-svc\`, \`order-svc\`, \`catalog-svc\`, \`coins-svc\`

### Data
- PostgreSQL \`meera_db\` (legacy, 260+ migrations)
- PostgreSQL v2 (Citus-oriented, \`aqond-v2/infra/postgres/\`)
- Redis, AWS S3, JSON \`.data/\` dev stores

---

## Shared Services

| Service | Location | Routes |
|---------|----------|--------|
| Payment | \`paymentManager.js\`, \`payment-svc\` | \`/api/payments/*\`, webhooks |
| Wallet | \`server.js\`, \`wallet-svc\` | \`/api/wallet/*\`, BFF wallet |
| Token | PaySo TEP, LiveKit, AIVOS | card-token, live tokens, clip tokens |
| AI | AIVOS, ai-core, aqond-brain | \`/api/aivos/*\` |
| Feed | \`feed-svc\`, legacy videos | \`/api/videos/feed\`, BFF feed |

---

## Integration Architecture

\`\`\`mermaid
flowchart TB
  subgraph clients [Clients]
    Mobile[mobile :3000]
    Storefront[storefront :3003]
    NexusAdmin[nexus-admin]
    AdsAdmin[ads-admin]
  end

  subgraph edge [Edge]
    Kong[Kong BFF :8000]
    NextAPI[storefront /api/*]
  end

  subgraph core [Core]
    Backend[backend :3001]
    AIVOS[AIVOS merchant-ad]
    GoSvc[Go microservices]
  end

  subgraph data [Data]
    PG[(PostgreSQL)]
    Redis[(Redis)]
    S3[(S3)]
    LocalData[.data JSON]
  end

  Mobile --> Backend
  Storefront --> NextAPI
  NextAPI --> Kong
  NextAPI --> LocalData
  Kong --> GoSvc
  NextAPI --> Backend
  Backend --> AIVOS
  Backend --> PG
  AIVOS --> LocalData
  NexusAdmin --> Backend
  AdsAdmin --> Backend
\`\`\`

---

## Current Sprint: Merchant Ad Video

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

## Entry Points

| Service | Command | Port |
|---------|---------|------|
| Backend | \`cd backend && node server.js\` | 3001 |
| Storefront | \`cd aqond-v2/apps/storefront && npm run dev\` | 3003 |
| Mobile | \`cd mobile && npm run dev\` | 3000 |
| Kong | \`aqond-v2/infra\` docker compose | 8000 |

See [MODULE_MAP.md](./MODULE_MAP.md) for per-module routes.

---

## Boundary Rules

1. \`mobile\` is the core product shell — do not modify unless explicitly requested
2. Partner/marketplace/v2 identity work lives in \`aqond-v2/apps/storefront\`
3. AIVOS phases are additive — new phases must not break prior phases
4. Local \`.data\` catalog is **dev fallback** — production uses catalog-svc
`);

write('KNOWLEDGE_INDEX.md', `# AQOND — Knowledge Index

**Last Updated:** ${TODAY}

AI navigation map. Locate modules here before scanning code.

Every entry includes: Purpose, Location, Dependencies, Related APIs, Related Database Tables, Related Products, Last Updated, Current Status.

---

## Merchant Ad Video (AIVOS)

| Field | Value |
|-------|-------|
| **Purpose** | AI ad clip wizard: brief → generate (Grok/ffmpeg) → publish → token wallet |
| **Location** | \`backend/lib/aivos/merchant-ad/\` |
| **Dependencies** | AIVOS runtime, XAI API (Grok), ffmpeg, \`merchantAdStorage.js\` |
| **Related APIs** | \`/api/aivos/merchant-ad/*\` — [API_CATALOG.md](./API_CATALOG.md) |
| **Related Database Tables** | JSON: \`.data/aivos/merchant-ad/jobs.json\`, \`token-wallets.json\` |
| **Related Products** | [market.md](./products/market.md), [brain.md](./products/brain.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational (dev); Grok production hardening pending |

**Key files:** \`routes.js\`, \`videoEngine.js\`, \`grokVideoBridge.js\`, \`tokenEngine.js\`, \`config.js\`

---

## Merchant Ad Storefront

| Field | Value |
|-------|-------|
| **Purpose** | Ad Studio UI, BFF proxy to AIVOS, product draft/publish, background jobs |
| **Location** | \`aqond-v2/apps/storefront/\` — \`components/mobile/MerchantAd*\`, \`lib/server/merchantAd*\` |
| **Dependencies** | Backend AIVOS, \`merchantCatalog.ts\`, \`homeProducts.ts\` |
| **Related APIs** | \`/api/merchant/ad-video/*\` |
| **Related Database Tables** | \`.data/dev/catalog.json\`, \`merchant-ad-videos.json\`, \`listings/manifest.json\` |
| **Related Products** | [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | ~80% — PDP video integration in progress |

**Key files:** \`MerchantAdStudioClient.tsx\`, \`AdClipProductCard.tsx\`, \`merchantAdPublish.ts\`, \`merchantAdProxy.ts\`

---

## Home Products / Catalog

| Field | Value |
|-------|-------|
| **Purpose** | Merge Kong BFF + local catalog; pin merchant-ad products on home |
| **Location** | \`aqond-v2/apps/storefront/lib/server/homeProducts.ts\`, \`localCatalog.ts\`, \`merchantCatalog.ts\` |
| **Dependencies** | \`marketplaceSync.ts\`, \`affiliate.json\` (studio) |
| **Related APIs** | \`/api/bff/v1/home\`, \`loadHomeProducts()\` |
| **Related Database Tables** | Local JSON catalog; production: catalog-svc |
| **Related Products** | [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Affiliate overwrite fixed (DOS-002) |

---

## Wallet (Legacy)

| Field | Value |
|-------|-------|
| **Purpose** | Deposits, topup, transactions, receipts, tax documents |
| **Location** | \`backend/server.js\` (\`/api/wallet/*\`), migrations 158+ |
| **Dependencies** | PaySo, \`paymentManager.js\`, PostgreSQL |
| **Related APIs** | \`/api/wallet/summary\`, \`/deposit\`, \`/transactions\` |
| **Related Database Tables** | \`wallet_*\`, \`payment_ledger_audit\`, deposit webhook logs |
| **Related Products** | [pay.md](./products/pay.md), [services.md](./products/services.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Stable — do not regress in course/marketplace work |

---

## Wallet (v2)

| Field | Value |
|-------|-------|
| **Purpose** | Microservice wallet for v2 commerce |
| **Location** | \`aqond-v2/services/wallet-svc/\`, \`coins-svc/\` |
| **Dependencies** | Kong, Postgres v2 migrations |
| **Related APIs** | BFF \`/api/bff/v1/wallet/*\` |
| **Related Database Tables** | \`034_merchant_wallet_fees.sql\` |
| **Related Products** | [pay.md](./products/pay.md), [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Scaffolded |

---

## Payment

| Field | Value |
|-------|-------|
| **Purpose** | PaySo/Stripe intents, holds, webhooks, card tokenization |
| **Location** | \`backend/lib/paymentManager.js\`, \`aqond-v2/services/payment-svc/\` |
| **Dependencies** | PaySo, Stripe, PostgreSQL ledger |
| **Related APIs** | \`/api/payments/*\`, \`/api/payment-gateway/*\`, \`/api/webhooks/*\` |
| **Related Database Tables** | Payment intents, \`payment_ledger_audit\` |
| **Related Products** | [pay.md](./products/pay.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Production-critical |

---

## AIVOS Runtime

| Field | Value |
|-------|-------|
| **Purpose** | AI apps, skills, workflows, billing, governance, tenant sessions |
| **Location** | \`backend/lib/aivos/\` |
| **Dependencies** | \`AIVOS_RUNTIME_ENABLED=1\`, migration \`260_ai_runtime_semantic.sql\` |
| **Related APIs** | \`/api/aivos/*\` |
| **Related Database Tables** | AIVOS semantic runtime tables |
| **Related Products** | [brain.md](./products/brain.md), [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Phases 1–20 complete; merchant-ad Phase 21 active |

---

## Food

| Field | Value |
|-------|-------|
| **Purpose** | Nearby restaurants, menu, cart, order tracking |
| **Location** | \`aqond-v2/services/food-svc/\`, storefront \`localFood.ts\` |
| **Dependencies** | Kong, \`025_food_svc.sql\` |
| **Related APIs** | BFF \`v1/food/*\`, \`/api/food/tracking/*\` |
| **Related Database Tables** | \`025_food_svc.sql\` + local food JSON |
| **Related Products** | [food.md](./products/food.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational (local dev) |

---

## Course Marketplace

| Field | Value |
|-------|-------|
| **Purpose** | Udemy-style courses, studio, purchases, moderation |
| **Location** | \`backend/lib/courseMarketplace/\`, \`nexus-admin-core/\` |
| **Dependencies** | Payment, wallet, migrations 235–246 |
| **Related APIs** | \`/api/courses/*\`, \`/api/course-marketplace/*\` |
| **Related Database Tables** | Migrations 235–246, 259 |
| **Related Products** | [services.md](./products/services.md), [admin.md](./products/admin.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Phases 3–18 complete |

---

## Ads Platform

| Field | Value |
|-------|-------|
| **Purpose** | Campaigns, billing ledger, outcomes, optimization |
| **Location** | \`backend/lib/ads/\`, \`ads-admin-core/\` |
| **Dependencies** | ClickHouse (verification), Postgres ledger |
| **Related APIs** | \`/api/ads-admin/*\` |
| **Related Database Tables** | Migrations 247–256 |
| **Related Products** | [admin.md](./products/admin.md), [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational |

---

## Job Board

| Field | Value |
|-------|-------|
| **Purpose** | Job posting, bids, advance procurement |
| **Location** | \`backend/server.js\`, \`mobile/\` job views |
| **Dependencies** | PostgreSQL, push notifications |
| **Related APIs** | \`/api/jobs/*\`, \`/api/advance-jobs/*\` |
| **Related Database Tables** | Migrations 091–098, 231–234 |
| **Related Products** | [services.md](./products/services.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Stable |

---

## Admin (Nexus)

| Field | Value |
|-------|-------|
| **Purpose** | KYC review, course admin, content, ads summary |
| **Location** | \`nexus-admin-core/\` |
| **Dependencies** | Backend \`/api/admin/*\` |
| **Related APIs** | \`/api/admin/*\` |
| **Related Database Tables** | KYC, course audit tables |
| **Related Products** | [admin.md](./products/admin.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational |

---

## Live Commerce

| Field | Value |
|-------|-------|
| **Purpose** | LiveKit streams, commerce overlay, studio playback |
| **Location** | \`aqond-v2/live/\`, storefront \`/api/live-commerce/*\` |
| **Dependencies** | \`token-service\`, \`commerce-service\`, LiveKit |
| **Related APIs** | \`/api/live-commerce/*\` |
| **Related Database Tables** | Live session tables |
| **Related Products** | [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Scaffolded |

---

## Index Maintenance

When adding a module, append a new section. Never remove historical entries — mark **Status: deprecated** instead.
`);

write('ROADMAP.md', `# AQOND — Roadmap

**Last Updated:** ${TODAY}

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
- AQOND-OS documentation workspace (\`docs/aqond-os/\`)

---

## Current (Q2–Q3 2026)

| Initiative | Target |
|------------|--------|
| Merchant Ad Video production hardening | Grok path, quotas, ops runbook |
| PDP video + mock Live rail | Gallery swipe autoplay |
| Catalog-svc production path | Replace \`.data\` JSON in prod |
| AQOND-OS maintenance | End-of-task doc sync |
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

**Last Updated:** ${TODAY}

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
| **Status** | Accepted — verified |

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

## DOS-005 — AQOND-OS as isolated AI documentation workspace

| Field | Value |
|-------|-------|
| **Date** | ${TODAY} |
| **Problem** | AI sessions re-scan entire codebase; docs mixed with legacy files in \`docs/\` |
| **Decision** | Maintain \`docs/aqond-os/\` as the ONLY official AI documentation workspace; preserve legacy \`docs/\` unchanged |
| **Reason** | Reduce token usage; clear navigation; single source of truth for AI sessions |
| **Impact** | Every session reads aqond-os first; end-of-task doc updates required |
| **Alternative Considered** | Continue using flat \`docs/\` DOS at repo root |
| **Status** | Accepted |
`);

write('API_CATALOG.md', `# AQOND — API Catalog

**Last Updated:** ${TODAY}

For full legacy prefix list see [\`../AQOND-DOS.md\`](../AQOND-DOS.md) §4 (historical reference only).

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

---

## Storefront Merchant Ad (\`/api/merchant/ad-video\`)

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
`);

write('DATABASE_SCHEMA.md', `# AQOND — Database Schema

**Last Updated:** ${TODAY}

---

## Storage Overview

| Store | Location | Purpose |
|-------|----------|---------|
| PostgreSQL (legacy) | \`meera_db\` | Primary backend — 260+ migrations |
| PostgreSQL (v2) | \`aqond-v2/infra/postgres/\` | Citus-oriented microservices |
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

### \`.data/dev/catalog.json\` (Storefront)
| Field | Purpose |
|-------|---------|
| \`id\` | Product ID |
| \`merchant_id\` | Owner merchant |
| \`source\` | \`merchant-ad\` when from ad studio |
| \`product_video_url\` | PDP video |
| \`metadata.product_code\` | SKU display |

---

## PostgreSQL — Domain Groups (Legacy)

| Domain | Migration Range | Purpose |
|--------|-----------------|---------|
| Wallet & Payments | 158, 195–198 | Deposits, webhooks, tax docs |
| Courses | 235–246, 259 | Course marketplace |
| Ads | 247–256 | Campaign ledger, outcomes |
| Identity / KYC | 204–205, 223–225, 257 | KYC, Compass onboarding |
| AI Runtime | 260 | AIVOS semantic runtime |
| Jobs | 091–098, 231–234 | Advance jobs, procurement |

---

## PostgreSQL — v2

| Migration | Purpose |
|-----------|---------|
| \`025_food_svc\` | Food service schema |
| \`034_merchant_wallet_fees\` | Merchant wallet fees |
`);

write('DEPENDENCY_GRAPH.md', `# AQOND — Dependency Graph

**Last Updated:** ${TODAY}

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

## Critical Path (Merchant Ad Sprint)

\`MerchantAdStudioClient\` → \`merchantAdProxy\` → \`backend merchant-ad\` → \`videoEngine\` → \`grokVideoBridge\` → publish → \`merchantCatalog\` → \`homeProducts\`

---

## External Dependencies

| Service | Used By |
|---------|---------|
| PostgreSQL | backend, v2 services, support |
| Redis | backend rate limit, dispatch |
| AWS S3 | backend uploads, storefront media |
| Firebase Auth | mobile, storefront |
| PaySo / Stripe | payments |
| XAI API | merchant-ad Grok |
| LiveKit | live commerce |
| ffmpeg | merchant-ad video concat |
`);

write('MODULE_MAP.md', `# AQOND — Module Map

**Last Updated:** ${TODAY}

---

## AIVOS Merchant Ad

| Field | Value |
|-------|-------|
| **Purpose** | AI merchant ad video generation and publish |
| **Entry Point** | \`backend/lib/aivos/merchant-ad/routes.js\` |
| **Routes** | \`/api/aivos/merchant-ad/*\` |
| **Services** | \`videoEngine.js\`, \`grokVideoBridge.js\`, \`tokenEngine.js\`, \`briefEngine.js\` |
| **Database** | \`.data/aivos/merchant-ad/*.json\` |
| **Related APIs** | [API_CATALOG.md](./API_CATALOG.md) |

---

## Storefront Merchant Ad Studio

| Field | Value |
|-------|-------|
| **Purpose** | Merchant UI for ad clips + product publish |
| **Entry Point** | \`app/m/merchant/ad-studio/page.tsx\` |
| **Routes** | \`/m/merchant/ad-studio\`, \`/api/merchant/ad-video/*\` |
| **Services** | \`merchantAdProxy.ts\`, \`merchantAdPublish.ts\`, \`merchantAdProductDraft.ts\` |
| **Database** | \`.data/dev/catalog.json\`, \`merchant-ad-videos.json\` |

---

## Home / Catalog

| Field | Value |
|-------|-------|
| **Purpose** | Home feed product loading and catalog persistence |
| **Entry Point** | \`lib/server/homeProducts.ts\` |
| **Routes** | \`/m/home\`, \`/api/bff/v1/home\` |
| **Services** | \`localCatalog.ts\`, \`merchantCatalog.ts\`, \`marketplaceSync.ts\` |

---

## Backend Monolith

| Field | Value |
|-------|-------|
| **Purpose** | Primary API for mobile + admin + AIVOS |
| **Entry Point** | \`backend/server.js\` |
| **Routes** | \`/api/*\` |
| **Database** | PostgreSQL \`meera_db\` |

---

## Storefront BFF

| Field | Value |
|-------|-------|
| **Purpose** | Proxy to Kong/Go services + local handlers |
| **Entry Point** | \`app/api/bff/[...path]/route.ts\` |
| **Routes** | \`/api/bff/v1/*\` |
`);

write('CODING_STANDARDS.md', `# AQOND — Coding Standards

**Last Updated:** ${TODAY}

---

## Folder Structure

| Area | Convention |
|------|------------|
| Legacy backend | \`backend/lib/<domain>/\`, \`backend/routes/\`, \`backend/db/migrations/\` |
| Storefront | Next.js App Router: \`app/\`, \`components/\`, \`lib/server/\` for server-only |
| Go services | \`aqond-v2/services/<name>-svc/main.go\` |
| AIVOS | \`backend/lib/aivos/<module>/\` — phases additive |
| Tests | \`backend/__tests__/\`, \`*.test.js\` |
| AI docs | \`docs/aqond-os/\` only — do not mix with legacy \`docs/\` |

---

## Naming

| Type | Convention | Example |
|------|------------|---------|
| API routes | kebab-case paths | \`/api/merchant/ad-video\` |
| Job IDs | prefix by module | \`mad-*\` (merchant-ad), \`adv-*\` (legacy local) |
| Env flags | \`AIVOS_*_ENABLED=1\` | \`AIVOS_MERCHANT_AD_GROK_VIDEO=1\` |
| Migrations | \`NNN_description.sql\` | \`260_ai_runtime_semantic.sql\` |
| React components | PascalCase | \`MerchantAdStudioClient.tsx\` |

---

## Architecture Rules

1. AIVOS phases are additive — Phase 21 must not break Phases 1–20
2. Storefront server logic in \`lib/server/\` — not in React components
3. Prefer proxy to backend over duplicating AIVOS logic in storefront
4. Local catalog is dev fallback — production targets catalog-svc
5. AQOND-OS documentation append-only — never delete historical entries
6. \`mobile\` is core shell — modify only when explicitly requested
`);

write('REGRESSION_STATUS.md', `# AQOND — Regression Status

**Last Updated:** ${TODAY}
**Latest Regression Date:** 2026-06-28 (MAD suite)
**Regression Coverage:** ~40%

---

## Verified Modules

| Module | Last Verified | Test / Method |
|--------|---------------|---------------|
| AIVOS merchant-ad MAD01–11 | 2026-06-28 | \`backend/__tests__/aivosMerchantAd*.test.js\` |
| Home product order (merchant-ad) | 2026-06-29 | Manual — user confirmed |
| Catalog affiliate skip | 2026-06-29 | Code review + manual (DOS-002) |

---

## Pending Verification

| Module | Test Needed |
|--------|-------------|
| Grok end-to-end (\`mad-*\`) | Full generate with XAI key after restart |
| PDP gallery video autoplay | Manual + optional Playwright |
| Existing product video attach flow | E2E ad-studio?product_id= |
| catalog-svc production path | Integration test vs local JSON |

---

## Regression Commands

\`\`\`bash
cd backend
set AIVOS_RUNTIME_ENABLED=1
set AIVOS_MERCHANT_AD_ENABLED=1
node --test __tests__/aivosMerchantAd*.test.js
\`\`\`
`);

// --- Product docs ---
const productTemplate = (name, path, purpose, apis, tables, status) => `# AQOND ${name}

**Last Updated:** ${TODAY}
**Related:** [KNOWLEDGE_INDEX.md](../KNOWLEDGE_INDEX.md)

---

## Purpose

${purpose}

---

## Location

\`${path}\`

---

## Dependencies

See [DEPENDENCY_GRAPH.md](../DEPENDENCY_GRAPH.md) and [KNOWLEDGE_INDEX.md](../KNOWLEDGE_INDEX.md).

---

## Related APIs

${apis}

---

## Related Database Tables

${tables}

---

## Current Status

${status}
`;

write('products/services.md', productTemplate(
  'Services (Mobile Core)',
  'mobile/',
  'Core product shell: jobs, bookings, wallet, video feed, course marketplace UI, Capacitor Android. Handoff to v2 storefront for marketplace/commerce.',
  '- `/api/jobs/*`, `/api/bookings/*`, `/api/bids/*`\n- `/api/wallet/*`\n- `/api/videos/feed`\n- `/api/courses/*`, `/api/course-marketplace/*`',
  '- Job tables (migrations 091–098, 231–234)\n- Wallet tables (migration 158+)\n- Course marketplace (235–246)',
  'Stable — primary user-facing app on port 3000. Do not modify unless explicitly requested.'
));

write('products/food.md', productTemplate(
  'Food',
  'aqond-v2/services/food-svc/, storefront localFood.ts',
  'Restaurant discovery, menu browsing, food cart, order tracking, rider dispatch integration.',
  '- BFF `v1/food/nearby`, `v1/food/menu`, `v1/food/cart/*`\n- Storefront `/api/food/tracking/*`',
  '- `025_food_svc.sql`\n- Local food JSON (dev fallback)',
  'Operational in local dev via storefront BFF + food-svc.'
));

write('products/market.md', productTemplate(
  'Market (Storefront v2)',
  'aqond-v2/apps/storefront/',
  'Next.js 14 commerce platform: home, search, PDP, cart, checkout, merchant back-office, ad studio, live commerce, food integration.',
  '- `/api/bff/v1/*`\n- `/api/merchant/*`\n- `/api/merchant/ad-video/*`\n- `/api/cart/*`, `/api/checkout/*`',
  '- `.data/dev/catalog.json` (dev)\n- catalog-svc (production target)\n- `merchant-ad-videos.json`',
  'Active sprint — merchant ad video + catalog integration ~80% complete.'
));

write('products/brain.md', productTemplate(
  'Brain (AI / AIVOS)',
  'backend/lib/aivos/, aqond-brain/, aqond-v2/infra/ai-core/',
  'AIVOS: AI runtime, skills, workflows, billing, merchant-ad video. aqond-brain: offline Python media factory. ai-core: storefront prompt service.',
  '- `/api/aivos/*`\n- `/api/aivos/merchant-ad/*`',
  '- `.data/aivos/merchant-ad/*.json`\n- Migration `260_ai_runtime_semantic.sql`',
  'AIVOS Phases 1–20 complete. Merchant-ad Phase 21 active (Grok video).'
));

write('products/pay.md', productTemplate(
  'Pay (Wallet & Payments)',
  'backend/lib/paymentManager.js, aqond-v2/services/payment-svc/, wallet-svc/',
  'PaySo/Stripe payment intents, wallet deposits, topup, transactions, receipts, tax documents, merchant wallet fees.',
  '- `/api/wallet/*`\n- `/api/payments/*`, `/api/payment-gateway/*`\n- `/api/webhooks/*`',
  '- `payment_ledger_audit`\n- Wallet migrations 158, 195–198\n- `034_merchant_wallet_fees.sql` (v2)',
  'Production-critical — regression scope for all marketplace/course changes.'
));

write('products/admin.md', productTemplate(
  'Admin',
  'nexus-admin-core/, ads-admin-core/',
  'Nexus: KYC review, course marketplace admin, content manager, ads summary. Ads Admin: campaigns, billing, fraud, optimization.',
  '- `/api/admin/*`\n- `/api/ads-admin/*`',
  '- KYC tables (204–205, 223–225)\n- Ads ledger (247–256)\n- Course audit tables',
  'Operational — connects to legacy backend API.'
));

// --- Logs ---
write('logs/daily/2026-06-30.md', `# Daily Log — ${TODAY}

## Summary

Bootstrapped **AQOND-OS** — isolated AI documentation workspace at \`docs/aqond-os/\`. Migrated project memory from flat \`docs/\` DOS structure without modifying existing documentation.

---

## Changes Made

### Documentation

- Created \`docs/aqond-os/\` folder structure per AQOND-OS specification
- Populated all core markdown files (README, CURRENT_STATUS, MASTER_BLUEPRINT, etc.)
- Added \`NEXT_TASK.md\` as session starting point
- Added \`products/\` docs (services, food, market, brain, pay, admin)
- Added \`logs/\`, \`reports/\`, \`architecture/\`, \`diagrams/\` directories
- Recorded decision DOS-005 (AQOND-OS isolation)

### Code

- Added \`scripts/bootstrap-aqond-os.cjs\` for regeneration

---

## Decisions Recorded

- DOS-005 in [DECISIONS.md](../DECISIONS.md)

---

## Regression

No code changes — documentation only.

---

## Tomorrow's Recommended Tasks

See [NEXT_TASK.md](../NEXT_TASK.md) — merchant ad video pipeline hardening remains primary sprint.
`);

write('logs/weekly/2026-W26.md', `# Weekly Log — 2026-W26

**Week of:** 2026-06-23 to 2026-06-29

## Highlights

- Merchant Ad Video sprint: Grok per-shot generation, storefront Ad Studio
- Product publish pipeline: AI draft → catalog → home feed
- Critical fix: affiliate.json no longer overwrites merchant-ad catalog entries
- AQOND-OS bootstrap — isolated documentation workspace

## Next Week Focus

- PDP video integration complete
- Grok production path verification
- Regression automation
`, { skipIfExists: true });

write('logs/monthly/2026-06.md', `# Monthly Log — 2026-06

## Summary

Major progress on AIVOS Phase 21 (merchant-ad) and storefront commerce integration. AQOND-OS documentation system established end of month.

## Shipped

- Merchant ad video wizard (brief, generate, publish)
- Grok image-to-video per-shot pipeline
- Storefront Ad Studio with background jobs
- Product AI draft and publish to catalog/home
- AQOND-OS documentation workspace
`, { skipIfExists: true });

write('architecture/README.md', `# Architecture Artifacts

Store diagrams, deep-dive documents, and architecture decision visuals here.

## Current References

- [MASTER_BLUEPRINT.md](../MASTER_BLUEPRINT.md) — platform diagram (Mermaid)
- [DEPENDENCY_GRAPH.md](../DEPENDENCY_GRAPH.md) — module dependencies
- [diagrams/](../diagrams/) — exported diagrams

## Historical Reference (parent docs/)

- [\`../AQOND-DOS.md\`](../AQOND-DOS.md) — monorepo facts (do not modify from aqond-os)
`);

write('reports/README.md', `# Reports

Phase reports, audits, and production readiness assessments.

New structured reports go here. Legacy reports remain in parent \`docs/\` unchanged.
`);

write('diagrams/README.md', `# Diagrams

Export Mermaid renders, architecture screenshots, and flow diagrams here.

Source diagrams live in [MASTER_BLUEPRINT.md](../MASTER_BLUEPRINT.md) and [DEPENDENCY_GRAPH.md](../DEPENDENCY_GRAPH.md).
`);

touchDir('logs/archive');

write('SESSION.md', `# AQOND — SESSION (Working Memory)

> **This file is the AI's current working memory.** Overwritten each session; finalized before session end.

**Session Status:** ACTIVE
**Last Updated:** ${TODAY}

---

## Session Information

| Field | Value |
|-------|-------|
| **Current Date** | ${TODAY} |
| **Current Sprint** | _(update)_ |
| **Session Number** | _(increment)_ |
| **Developer Goal** | _(update)_ |
| **Current Objective** | _(update)_ |
| **Overall Project Completion** | _(update)_ |

---

## Active Module

| Field | Value |
|-------|-------|
| **Current Product** | _(update)_ |
| **Current Module** | _(update)_ |
| **Current Feature** | _(update)_ |
| **Current API** | _(update)_ |
| **Current Database Tables** | _(update)_ |
| **Current Frontend Screen** | _(update)_ |
| **Current Backend Service** | _(update)_ |

---

## Current Working Files

| File Path | Purpose | Modification Status | Priority |
|-----------|---------|---------------------|----------|
| _(add rows)_ | | | |

---

## Current Progress

### Completed During This Session
- _(update)_

### Work In Progress
- _(update)_

### Waiting Tasks
- _(update)_

### Blocked Tasks
- None / _(update)_

---

## Dependency Analysis

_(modules, shared services, regression areas, external services, database impact)_

---

## Decisions Made

_(document during session — sync to DECISIONS.md at end)_

---

## Known Issues

_(bugs, workarounds, open questions, tech debt)_

---

## Regression Checklist

| Area | Status |
|------|--------|
| Frontend | PENDING |
| Backend | PENDING |
| API | PENDING |
| Database | PENDING |
| Wallet | PENDING |
| Payment | PENDING |
| Merchant | PENDING |
| Admin | PENDING |
| AI | PENDING |
| Authentication | PENDING |

---

## Resume Point

| Field | Value |
|-------|-------|
| **Current File** | _(update)_ |
| **Last Completed Action** | _(update)_ |
| **Next Immediate Action** | _(update)_ |
| **Expected Result** | _(update)_ |
| **Risk Level** | _(update)_ |
| **Estimated Remaining Work** | _(update)_ |

---

## Next Session Recommendation

_(prioritized tasks, dependencies, risks)_

---

## End-of-Session Sync Checklist

- [ ] SESSION.md finalized
- [ ] CURRENT_STATUS.md updated
- [ ] NEXT_TASK.md updated
- [ ] Daily log in logs/daily/
`, { skipIfExists: true });

console.log('bootstrap-aqond-os: complete');
