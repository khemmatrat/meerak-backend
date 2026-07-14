#!/usr/bin/env node
/**
 * AQOND Platform Validation — Phase PV-1
 * READ ONLY deliverable generator. Docs only — no production code.
 *
 * Usage: node scripts/write-platform-validation-pv1.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'platform-validation');
const TODAY = new Date().toISOString().slice(0, 10);

fs.mkdirSync(OUT, { recursive: true });

function w(name, body) {
  fs.writeFileSync(path.join(OUT, name), body.trimStart() + '\n');
  console.log('  wrote', name);
}

const HDR = (title) => `# ${title}

**Status:** DRAFT — Phase PV-1 Read-Only Audit  
**Date:** ${TODAY}  
**Role:** Chief Platform Auditor  
**Rules:** Evidence-based · mark UNKNOWN when uncertain · no code changes  

`;

const files = {
'000-program-overview.md': `${HDR('AQOND Platform Validation Program — Overview')}

## Three-layer methodology (CTO proposal)

| Layer | Name | PV phase | Purpose |
|-------|------|----------|---------|
| **1** | Feature Inventory | **PV-1** (this audit) | Map of what exists |
| **2** | Master Scenario Book | PV-2 (future) | Role-based journeys to test |
| **3** | Validation Tracker | PV-3 (future) | ✅ ⚠️ ❌ 🔄 + evidence |

**Do not create 500–1,000 test cases upfront.** Build inventory → scenarios → tracker.

## PV-1 deliverables

| Doc | Title |
|-----|-------|
| 001 | Feature Inventory |
| 002 | Pages |
| 003 | API Inventory |
| 004 | Data Model |
| 005 | Role Matrix |
| 006 | User Journeys |
| 007 | Cross Flow |
| 008 | Integrations |
| 009 | AI Integration |
| 010 | Guardian Coverage |
| 011 | Health Score |
| 012 | Critical Gaps |
| 013 | Technical Debt |
| 014 | Production Readiness |
| 015 | Executive Summary |

## Repository scope audited

- \`aqond-v2/\` — Next.js storefront, 34 Go microservices, Guardian, infra
- \`backend/\` — Legacy Express monolith (~960 API routes)
- \`mobile/\`, \`nexus-admin-core/\`, \`ads-admin-core/\`
- \`support/\`, \`aqond-brain/\`, \`helper-docs/\`

## Evidence method

Automated scan + subagent exploration. Paths cited throughout. **UNKNOWN** where not verified in repo.
`,

'001-feature-inventory.md': `${HDR('001 — Platform Feature Inventory')}

## Summary

AQOND is a **dual-stack platform**: legacy v1 (\`backend/\` + \`mobile/\`) and v2 commerce (\`aqond-v2/\`). Feature maturity varies sharply by vertical.

**Legend:** Impl % = estimated implementation completeness · Prod = production-ready for public launch

---

## Marketplace & Commerce

| Feature | Impl % | Frontend | Backend | Database | API | AI | Prod |
|---------|--------|----------|---------|----------|-----|-----|------|
| Product catalog / search | 75% | ✅ storefront \`/m/home\`, \`/m/search\` | ✅ \`catalog-svc\`, BFF | ✅ commerce schema | ✅ BFF + \`/api/search\` | ⚠️ visual-search | ⚠️ |
| Cart / checkout | 70% | ✅ \`/m/cart\`, \`/m/checkout\` | ✅ \`cart-svc\`, \`checkout-svc\` | ✅ | ✅ \`/api/checkout/*\` | ❌ | ⚠️ |
| Orders / tracking | 65% | ✅ \`/m/orders\` | ✅ \`order-svc\` | ✅ | ✅ \`/api/orders\` | ❌ | ⚠️ |
| Merchant OS | 70% | ✅ \`/m/merchant/*\` (14 pages) | ✅ merchant APIs + Go | ✅ \`merchant_*\` tables | ✅ \`/api/merchant/*\` | ✅ assistant | ⚠️ |
| Live commerce | 50% | ✅ \`/m/live/[roomId]\` | ✅ \`live/\`, \`video-svc\` | ⚠️ partial | ✅ proxy | ❌ | ❌ |
| Bagisto bridge | 40% | ❌ | ✅ \`marketplace/bagisto-bridge\` | ⚠️ | ⚠️ | ❌ | ❌ |
| Escrow | 45% | ❌ direct UI | ✅ \`escrow-service\` | ✅ \`escrow.*\` | ⚠️ | ❌ | ❌ |

**Evidence:** \`aqond-v2/apps/storefront/app/m/\`, \`aqond-v2/services/catalog-svc\`, \`checkout-svc\`, \`order-svc\`

---

## Food

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| Food discovery | 70% | ✅ \`/m/food\` | ✅ \`food-svc\` | ✅ \`025_food_svc.sql\` | ✅ BFF food | ❌ | ⚠️ |
| Food cart/checkout | 65% | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| Food tracking | 70% | ✅ \`/m/food/track\` | ✅ dispatch | ✅ | ✅ \`/api/food/tracking\` | ⚠️ rider chat | ⚠️ |
| Kitchen/merchant food | 65% | ✅ merchant menu | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| Admin food ops | 60% | ✅ \`/m/admin\` + nexus | ✅ \`foodMerchantAdminRoutes.js\` | ✅ | ✅ \`/api/admin/food/*\` | ❌ | ⚠️ |

---

## Wallet & Payment

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| User wallet (v1 mobile) | 60% | ✅ \`mobile/pages/WalletDashboard\` | ✅ \`backend/server.js\` wallet | ✅ | ✅ \`/api/wallet/*\` | ❌ | ⚠️ |
| Merchant wallet (v2) | 65% | ✅ \`/m/merchant/wallet\` | ✅ \`wallet-svc\` | ✅ \`034_merchant_wallet_fees.sql\` | ✅ | ❌ | ⚠️ |
| Rider wallet | 60% | ✅ \`/m/rider/wallet\` | ✅ dispatch ledger | ✅ | ✅ \`/api/rider/*\` | ❌ | ⚠️ |
| Payment gateway | 55% | ✅ checkout payment | ✅ \`payment-svc\` + v1 | ✅ | ✅ webhooks | ❌ | ❌ |
| Payouts / withdrawals | 50% | ⚠️ partial | ✅ v1 payouts | ✅ | ✅ | ❌ | ❌ |

---

## Rider / Dispatch

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| Rider signup/KYC | 55% | ✅ \`/m/rider/signup\` | ✅ | ✅ \`dispatch_riders\` | ✅ | ❌ | ❌ |
| Job board / map | 65% | ✅ jobs, map | ✅ \`dispatch-svc\` | ✅ | ✅ | ⚠️ voice | ⚠️ |
| Active delivery | 60% | ✅ \`/m/rider/active\` | ✅ | ✅ | ✅ | ✅ \`/api/ai/rider-voice\` | ⚠️ |
| Rider auth | **30%** | ✅ UI | ⚠️ | ✅ | ⚠️ **rider_id query param** | ❌ | ❌ |

**Critical:** Rider API auth gap — \`aqond-v2/apps/storefront/app/api/rider/\` — no dedicated RBAC middleware found.

---

## Talent / Jobs (v1)

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| Job board | 65% | ✅ \`mobile/JobBoard\` | ✅ \`advance_jobs\` | ✅ | ✅ \`/api/jobs/*\` | ❌ | ⚠️ |
| Talent videos | 60% | ✅ mobile | ✅ | ✅ \`talent_videos\` | ✅ | ❌ | ⚠️ |
| Bids / bookings | 55% | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| Training/LMS | 50% | ✅ \`TrainingDashboard\` | ✅ \`trainingLms.js\` | ✅ | ✅ | ❌ | ❌ |

---

## CRM / Chat / Notification

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| Shop chat | 55% | ✅ \`/m/chats\`, \`/m/chat/[shopId]\` | ⚠️ | ⚠️ | ✅ \`/api/shop-chat\` | ❌ | ⚠️ |
| Notifications | 50% | ✅ account notifications | ✅ \`notifications/\` svc | ✅ | ✅ \`/api/notify\` | ❌ | ⚠️ |
| Support tickets | 55% | ⚠️ admin | ✅ v1 support | ✅ | ✅ \`/api/support/*\` | ⚠️ support AI | ⚠️ |

---

## Admin

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| Nexus admin panel | 70% | ✅ \`nexus-admin-core/\` | ✅ \`adminAuthMiddleware\` | ✅ \`user_roles\` | ✅ \`/api/admin/*\` (~200+) | ❌ | ⚠️ |
| Storefront break-glass admin | 40% | ✅ \`/m/admin\` | ✅ | ✅ | ✅ \`x-admin-key\` | ❌ | ❌ |
| Ads admin | 60% | ✅ \`ads-admin-core/\` | ✅ \`adsAdminRoutes\` | ✅ | ✅ \`/api/ads-admin/*\` | ⚠️ AIVOS | ⚠️ |

---

## Jarvis / Hermes / AI

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| Jarvis concierge | **75%** | ✅ via chat surfaces | ✅ ai-core + local | ✅ experience | ✅ \`/api/ai/jarvis\` | ✅ | ⚠️ observe |
| Jarvis persona/memory/voice | 70% | ✅ | ✅ v1+v2 mirror | ✅ | ✅ \`/api/jarvis/*\` | ✅ | ⚠️ |
| Merchant assistant | 55% | ✅ | ✅ | ⚠️ | ✅ \`/api/ai/merchant-assistant\` | ✅ | ⚠️ |
| Hermes orchestration | **25%** | ❌ UI | ⚠️ AIVOS orchestrator | ⚠️ | ⚠️ \`/api/aivos/orchestrator\` | ⚠️ stub | ❌ |
| Recommendation | 50% | ✅ feed/rec | ✅ \`rec-svc\`, \`recsys-svc\` | ✅ | ✅ proxy | ✅ engines | ⚠️ |
| Visual search | 45% | ✅ modal | ⚠️ | ❌ | ✅ \`/api/ai/visual-search\` | ✅ | ❌ |
| Voice (Jarvis/Rider) | 55% | ✅ flags | ✅ \`@aqond/voice\` | ⚠️ | ✅ | ✅ | ⚠️ |

---

## Guardian (AGK)

| Feature | Impl % | Frontend | Backend | DB | API | AI | Prod |
|---------|--------|----------|---------|-----|-----|-----|------|
| Observe / enforce / shadow | **80%** | ✅ tap | ✅ \`guardian-api\` | ⚠️ in-memory | ✅ :8200 | ✅ | ⚠️ gates |
| Intent + Mission | 60% | ⚠️ not wired UI | ✅ 3.8 | ⚠️ JSON files | ✅ | ✅ | ❌ |
| Hypervisor / Scheduler | 70% | ❌ | ✅ | ✅ files | ✅ | ❌ | ⚠️ |
| Governance validation | 65% | ❌ | ✅ drills | ❌ | ✅ | ❌ | ⚠️ |
| Service Mesh | **0%** impl | ❌ | ❌ | ❌ | 📄 4A docs only | ❌ | ❌ |

**Coverage:** Jarvis path only — see 010.

---

## Other modules

| Module | Impl % | Prod | Evidence |
|--------|--------|------|----------|
| Course marketplace | 55% | ⚠️ | \`backend/routes/courseMarketplace.js\` |
| AIVOS (25 submodules) | 50% | ❌ | \`backend/lib/aivos/\` |
| Ads platform | 60% | ⚠️ | \`backend/lib/ads*.js\` |
| Experience / FTX wizard | 65% | ⚠️ | \`experienceRoutes.js\`, \`/m/ftx/wizard\` |
| Growth / Pass / Referral | 55% | ⚠️ | \`/api/growth/*\`, \`/m/pass\` |
| Analytics | 40% | ❌ | \`aqond-v2/analytics/\` |
| CMS | 40% | ❌ | \`aqond-v2/cms/\` |
| Identity / KYC | 60% | ⚠️ | v1 KYC + v2 auth |
| Permissions / RBAC | 65% admin, 30% rider | ⚠️ | 005 |
| Audit | 55% | ⚠️ | v1 audit_logs + AGK audit |
`,

'002-pages.md': `${HDR('002 — Page Inventory')}

## Storefront Next.js (\`aqond-v2/apps/storefront\`)

**Total \`page.tsx\`:** 97 routes  
**Evidence:** \`aqond-v2/apps/storefront/app/\`

### Status legend

| Mark | Meaning |
|------|---------|
| **Connected** | Calls \`/api/*\`, BFF, or lib with backend fetch |
| **Partial** | Some API; stubs for sub-screens |
| **UI Only** | Redirect, stub, or design-system |
| **Dead** | Redirect only / no data |

### Desktop routes

| Route | Status | File |
|-------|--------|------|
| \`/\` | Connected | \`app/page.tsx\` |
| \`/shop\` | Connected | \`app/shop/page.tsx\` |
| \`/product/[id]\` | Connected | \`app/product/[id]/page.tsx\` |
| \`/cart\`, \`/checkout\` | Connected | \`app/cart\`, \`app/checkout\` |
| \`/account\`, \`/orders\`, \`/search\`, \`/feed\` | Connected | respective \`page.tsx\` |
| \`/live\` | UI Only → redirect \`/m/live\` | \`app/live/page.tsx\` |
| \`/design-system/*\` | UI Only | demo |

### Mobile commerce (\`/m/*\`)

| Route | Status |
|-------|--------|
| \`/m/home\`, \`/m/search\`, \`/m/feed\` | Connected |
| \`/m/product/[id]\`, \`/m/shop/[id]\` | Connected |
| \`/m/cart\`, \`/m/checkout/*\` | Connected |
| \`/m/food/*\` (5 routes) | Connected |
| \`/m/orders/*\` | Connected + dispute sheets |
| \`/m/account/*\` | Mixed — settings stubs (help, terms, privacy, delete) = **UI Only** |
| \`/m/login\`, \`/m/register\`, \`/m/auth/handoff\` | Connected |
| \`/m/onboarding/intent\` | UI Only — links only |
| \`/m/studio\`, \`/m/live/[roomId]\` | Connected |
| \`/m/pro\`, \`/m/pass\` | Partial — delegate components |

### Merchant (\`/m/merchant/*\`)

| Route | Status |
|-------|--------|
| \`/m/merchant\` | Dead → redirect orders |
| orders, sales, wallet, menu, shops, staff, promos, ads, ad-studio, assistant, tier | **Connected** |
| \`/m/merchant/qr\` | UI Only |
| \`/m/merchant/help\` | Connected (disputes) |

### Rider (\`/m/rider/*\`)

| Route | Status |
|-------|--------|
| home, jobs, map, mine, active, wallet, settings, signup | **Connected** |
| \`/m/rider/profile\` | Partial |
| \`/m/rider\` | Dead → redirect home |

### Admin

| Route | Status |
|-------|--------|
| \`/m/admin\` | Connected — break-glass \`x-admin-key\` |

### Account settings stubs (Missing API)

\`/m/account/settings/{help,about,terms,privacy,blocked,delete-account,rate,password}\` — **UI Only** (\`MpSettingsStubPage\`)

### Mobile app (non-Next)

| App | Routes | Path |
|-----|--------|------|
| Capacitor mobile | Hash routes | \`mobile/App.tsx\` — Jobs, Wallet, MarketplaceEmbed, Training |
| Nexus admin | SPA views | \`nexus-admin-core/components/*\` |
| Ads admin | SPA | \`ads-admin-core/\` |

### Modals (not routes)

\`TtVisualSearchModal\`, \`TtFoodAddSheet\`, \`TtDisputeReportSheet\`, \`TtRiderChatSheet\` — inline on pages.

### Counts

| Category | Count |
|----------|-------|
| Connected | ~72 |
| UI Only / stub | ~12 |
| Delegate to components | ~13 |
| Dead redirect | 2 |
`,

'003-api.md': `${HDR('003 — API Inventory')}

## Scale

| Surface | Approx endpoints | Primary file |
|---------|------------------|--------------|
| Backend Express | **~960** | \`backend/server.js\` (~609) + modular routes (~350) |
| Storefront Next API | **134** \`route.ts\` | \`aqond-v2/apps/storefront/app/api/\` |
| Guardian API | **35** | \`aqond-v2/guardian/guardian-api/server.js\` |
| Go microservices | 34 services | \`aqond-v2/services/*/main.go\` — via Kong/BFF |

---

## Authentication patterns

| Pattern | Where | Risk |
|---------|-------|------|
| \`authenticateToken\` JWT | v1 user APIs | Standard |
| \`adminAuthMiddleware\` | \`/api/admin/*\` | Standard |
| \`optionalAuth\` / open | Many v1 routes | ⚠️ user-id in body |
| \`verifyAdminKey\` | storefront \`/api/admin/*\` | Dev key |
| \`assertMerchantAccess\` | \`/api/merchant/*\` | \`x-user-id\` header |
| **rider_id query** | \`/api/rider/*\` | **❌ High risk** |
| **None** | Guardian :8200 | Internal only |
| Global \`apiLimiter\` | \`/api/*\` v1 | Rate limit only |

---

## Guardian-protected APIs

| Route | Guardian |
|-------|----------|
| \`POST /api/ai/jarvis\` | ✅ observe + enforce via \`guardianTap.ts\` |
| All other storefront APIs | ❌ bypass |
| All backend v1 APIs | ❌ bypass |
| Guardian API itself | N/A |

---

## Storefront API groups (134 routes)

| Prefix | Count area | Auth |
|--------|------------|------|
| \`/api/bff/*\` | Catch-all BFF | Forward auth headers |
| \`/api/merchant/*\` | ~25 | Merchant access |
| \`/api/rider/*\` | ~12 | ⚠️ weak |
| \`/api/food/*\` | tracking, chat | Mixed |
| \`/api/ai/*\` | jarvis, merchant-assistant, rider-voice | Mixed |
| \`/api/jarvis/*\` | profile APIs | Upstream auth |
| \`/api/admin/food/*\` | admin key | Admin |
| \`/api/checkout/*\`, \`/api/orders/*\` | commerce | Mixed |
| Proxies: \`kong\`, \`growth\`, \`search\`, \`rec\`, \`feed\`, \`video\` | catch-all | Varies |

---

## Backend v1 major domains (\`server.js\`)

| Domain | Prefix | Auth typical |
|--------|--------|--------------|
| Admin | \`/api/admin/*\` | adminAuthMiddleware |
| Jobs | \`/api/jobs/*\`, \`/api/advance-jobs/*\` | ⚠️ often open |
| Wallet | \`/api/wallet/*\` | Mixed |
| Payments | \`/api/payments/*\` | Mixed + limiter |
| Auth | \`/api/auth/*\` | rateLimitLogin |
| AIVOS | \`/api/aivos/*\` | token / dev key |
| Courses | \`/api/courses/*\` | modular routes |
| Ads | \`/api/ads/*\` | token |

---

## Deprecated / legacy markers

| Item | Evidence |
|------|----------|
| \`GET /api/job\` → 302 \`/api/jobs\` | \`server.js\` |
| Duplicate \`/api/reports/earnings\` | \`server.js\` ~7237 & ~8505 |
| \`/api/rider/link-user\` deprecated comment | \`route.ts\` |
| AIVOS dual mount \`/api/aivos/growth\` + \`/v1\` | version alias |

---

## Missing / stub implementations

| Item | Status |
|------|--------|
| Service Mesh invoke APIs | Architecture only (4A) |
| Hermes production API surface | Mostly AIVOS stubs |
| Event bus (AGK 023) | Not wired |
| OPA / Redis / Vault (chaos stubs) | Not in local AGK |
`,

'004-data-model.md': `${HDR('004 — Data Model Inventory')}

## Schema sources

| Tree | Path | Tables (approx) |
|------|------|-----------------|
| Backend v1 | \`backend/db/migrations/\` | **~255** SQL files, 280+ CREATE TABLE |
| Aqond v2 | \`aqond-v2/infra/postgres/migrations/\` | **38** files |
| Reference | \`backend/db/schema.sql\` | Dev DDL |
| Runtime bootstrap | \`backend/server.js\` ~L32242 | CREATE IF NOT EXISTS |

**No Prisma / ORM** — raw SQL only.

---

## Aqond v2 schemas

| Schema | Purpose | Key tables |
|--------|---------|------------|
| \`commerce.*\` | Core commerce | merchants, products, orders, carts, food_*, dispatch_*, merchant_* |
| \`escrow.*\` | Escrow ledger | ledger, audit_log |
| \`ai.*\` | AI inference log | inference_log |
| \`analytics.*\` | Events | stream_events |
| \`marketplace.*\` | Legacy sync | products, orders |

**Evidence:** \`aqond-v2/infra/postgres/migrations/033_production_base.sql\`, \`025_food_svc.sql\`, \`026_dispatch_svc.sql\`

---

## Backend v1 domains (selected)

| Domain | Tables |
|--------|--------|
| Users / RBAC | \`users\`, \`user_roles\`, \`staff\`, \`kyc_*\` |
| Jobs / talent | \`jobs\`, \`advance_jobs\`, \`talent_videos\`, \`job_bids\` |
| Payments | \`payments\`, \`transactions\`, \`wallet_transactions\`, \`payout_requests\` |
| Courses | \`course_*\` (20+ tables) |
| Ads | \`ads_*\`, \`ad_campaign_escrow\` |
| AIVOS | \`aivos_*\` (28+ tables) |
| Audit | \`audit_logs\`, \`admin_logs\`, \`financial_audit_log\` |

---

## Dual-stack integrity risks

| Risk | Severity | Evidence |
|------|----------|----------|
| **Two Postgres worlds** not unified | High | Separate migration trees |
| Wallet data v1 vs v2 | High | \`wallet_transactions\` vs \`commerce.wallets\` |
| Orders v1 jobs vs v2 commerce orders | Medium | Different models |
| User identity across stacks | Medium | \`auth_identities\` v2 vs \`users\` v1 |
| Guardian registry JSON files vs DB | Low | \`guardian-api/lib/data/*.json\` |

---

## Indexes / FK

**UNKNOWN** — full index audit not run in PV-1. Migration files contain FK definitions; recommend dedicated DBA pass.

---

## Unused / legacy tables (suspected)

| Area | Note |
|------|------|
| Gold lotto, PRB, marine | Niche modules — verify active use |
| Gigastore webhooks | Integration-specific |
| Brand adviser tables | ⚠️ verify UI still linked |

**Mark for PV-2:** table-level usage telemetry.
`,

'005-role-matrix.md': `${HDR('005 — Role Matrix')}

## Platform admin roles (\`user_roles\`)

| Role | Admin panel | Financial | KYC | Ads | Evidence |
|------|-------------|-----------|-----|-----|----------|
| \`SUPER_ADMIN\` | ✅ all | ✅ | ✅ | ✅ | \`009_rbac_and_recon_uploads.sql\` |
| \`ADMIN\` | ✅ most | ✅ partial | ✅ | ✅ | |
| \`AUDITOR\` | ✅ read | ✅ read | ✅ | ❌ | |
| \`ACCOUNTANT\` | ✅ finance | ✅ | ❌ | ❌ | |
| \`SUPPORT\` | ✅ support | ❌ denied UI | ✅ | ❌ | \`adminRouteAccess.ts\` |
| \`DEVELOPER\` | ✅ dev | ❌ | ❌ | ❌ | |
| \`STAFF_KYC\` | ✅ KYC focus | ⚠️ JSON caps | ✅ | ❌ | |
| \`ADS_MANAGER\` | ✅ ads | ❌ | ❌ | ✅ | \`247_ads_marketplace_billing_role.sql\` |

**Enforcement:** \`adminAuthMiddleware\` in \`backend/server.js\` + per-route nested checks.

---

## End-user app mode (\`users.role\`)

| Mode | Meaning |
|------|---------|
| \`user\` | Consumer |
| \`provider\` | Service provider |
| \`employer\` | Employer / hirer |

**Not admin RBAC** — \`PATCH /api/users/me/app-mode\`

---

## Merchant staff (v2)

| Role | Permissions |
|------|-------------|
| \`owner\` | Full shop ops |
| \`staff\` | Limited — \`can_accept_orders\`, etc. |

**File:** \`aqond-v2/apps/storefront/lib/server/merchantStaff.ts\`, migration \`028_phase5_tier1.sql\`

---

## Role × module access matrix

| Module | User | Merchant | Food merchant | Rider | Talent | Admin |
|--------|------|----------|---------------|-------|--------|-------|
| Marketplace browse | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Checkout / pay | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Merchant OS | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ admin |
| Food order | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Rider jobs | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ dispatch |
| Talent / jobs v1 | ✅ | ❌ | ❌ | ⚠️ | ✅ | ✅ |
| Wallet | ✅ | ✅ merchant | ✅ | ✅ rider | ⚠️ | ✅ admin |
| Jarvis | ✅ | ✅ assistant | ✅ | ⚠️ voice | ⚠️ | ❌ |
| Nexus admin | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ RBAC |
| AGK governance | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ ops only |

---

## Over-privileged / missing

| Issue | Severity |
|-------|----------|
| Rider APIs accept \`rider_id\` without strong auth | **Critical** |
| Many v1 \`/api/jobs/*\` open with user-id in body | High |
| Break-glass \`/m/admin\` with shared admin key | High |
| Guardian has no auth on :8200 | Medium (internal) |
| Merchant staff RBAC | ✅ reasonably modeled |
| Talent has no platform RBAC role | Medium — ownership-based only |

---

## AI identities (AGK)

| AI_ID | Class | Guardian |
|-------|-------|----------|
| \`jarvis-prod-01\` | jarvis | ✅ wired |
| \`hermes-worker-01\` | hermes | ✅ registry only |
| Future agents | UNKNOWN | registry skeleton |
`,

'006-user-journeys.md': `${HDR('006 — User Journey Discovery')}

> **Note:** PV-1 discovers journeys. PV-2 will expand into **Master Scenario Book** with step-by-step validation.

## Consumer — Marketplace purchase

\`\`\`
Register/Login → Browse (/m/home) → Search → Product detail → Cart → Checkout → Payment → Order track → Review
\`\`\`

| Step | Route/API | Status |
|------|-----------|--------|
| Login | \`/m/login\`, \`/api/auth/*\` | ✅ Connected |
| Browse | \`/m/home\`, BFF | ✅ |
| Checkout | \`/m/checkout\`, \`/api/checkout/place\` | ⚠️ partial local dev |
| Payment | \`/m/checkout/payment\` | ⚠️ |
| Track | \`/m/orders/[id]/track\` | ✅ |

---

## Consumer — Food order

\`\`\`
/m/food → Restaurant → Menu → Cart → Checkout → Track (/m/food/track) → Review/Chat rider
\`\`\`

**Status:** ✅ Mostly connected · ⚠️ payment edge cases UNKNOWN

---

## Merchant journey

\`\`\`
Onboard (/m/merchant/shops) → Menu setup → Orders dashboard → Accept → Wallet withdraw → Ads (ad-studio)
\`\`\`

**AI touch:** \`/m/merchant/assistant\` → \`/api/ai/merchant-assistant\`

---

## Rider journey

\`\`\`
Signup (/m/rider/signup) → Jobs (/m/rider/jobs) → Accept → Active delivery → Wallet withdraw
\`\`\`

**Broken risk:** Auth on rider APIs — see 012.

---

## Talent / Jobs (v1 mobile)

\`\`\`
mobile JobBoard → Apply/Bid → Booking → Payment milestone → Review
\`\`\`

**Stack:** v1 \`backend\` + \`mobile\` — parallel to v2 storefront.

---

## Admin journey

\`\`\`
Nexus admin login → RBAC view gating → Users/KYC/Finance/Ads/Food ops
\`\`\`

**Evidence:** \`nexus-admin-core/constants/adminRouteAccess.ts\`

---

## Jarvis / AI journey

\`\`\`
User message → POST /api/ai/jarvis → [AGK observe/enforce] → ai-core OR localJarvis → Response
\`\`\`

**Guardian:** ✅ wired · **Intent/Mission:** ⚠️ not in user-facing flow yet

---

## Hermes journey

\`\`\`
Designed: Jarvis → ACP → Hermes → orchestration
Current: ⚠️ AIVOS orchestrator API exists; production UI path UNKNOWN
\`\`\`

---

## Onboarding / growth

\`\`\`
/m/ftx/wizard → Experience engine → /m/pass, /m/pro → Growth APIs
\`\`\`

---

## Journeys likely broken or incomplete

| Journey | Issue |
|---------|-------|
| Cross-stack wallet (mobile v1 ↔ v2) | Dual DB |
| Live commerce checkout | ⚠️ partial |
| Account settings stubs | UI only pages |
| Hermes multi-agent | Not production |
| Service Mesh capability invoke | Not implemented |
`,

'007-cross-flow.md': `${HDR('007 — Cross-Flow Discovery')}

## Canonical commerce chain (designed)

\`\`\`mermaid
flowchart LR
  U[User] --> M[Marketplace]
  M --> W[Wallet]
  W --> P[Payment]
  P --> N[Notification]
  N --> A[Analytics]
  A --> G[Guardian]
  G --> AI[Jarvis]
\`\`\`

---

## Food delivery chain

| Hop | From | To | Status |
|-----|------|-----|--------|
| 1 | User | Food UI | ✅ |
| 2 | Food UI | food-svc / BFF | ✅ |
| 3 | Order | dispatch-svc | ✅ |
| 4 | Dispatch | Rider app | ✅ |
| 5 | Rider | Wallet | ✅ |
| 6 | Payment | payment-svc | ⚠️ |
| 7 | Events | notification-svc | ⚠️ partial |
| 8 | All | Analytics | ⚠️ partial |
| 9 | Jarvis | AGK | ✅ jarvis only |
| 10 | Mission/Intent | AGK | ❌ not in flow |

---

## Broken / missing chains

| Chain | Gap |
|-------|-----|
| User → Wallet (v2) → User wallet (v1 mobile) | **Disconnected stacks** |
| Checkout → AGK policy | Only Jarvis chat has AGK |
| Payment webhook → Mission timeline | ❌ |
| Merchant ad → AIVOS → Analytics | ⚠️ partial |
| Food order → Guardian audit | ❌ bypass |
| Service Mesh Intent → Services | ❌ 4A docs only |
| Cross-tenant isolation at mesh | Designed 057, not in commerce APIs |

---

## Missing callbacks / events

| Event | Expected | Found |
|-------|----------|-------|
| \`order.paid\` → notification | ✅ partial | notify service |
| \`order.delivered\` → analytics | ⚠️ | stream_events |
| \`payment.failed\` → user notify | ⚠️ UNKNOWN |
| \`mesh.failover\` | AGK design | ❌ |
| \`intent.authorized\` → service invoke | 3.8 | ❌ no downstream |

---

## Missing audit spine

Only **Jarvis** requests get full AGK observe/enforce. Commerce, wallet, rider lack \`MISSION_ID\` binding in production paths.
`,

'008-integrations.md': `${HDR('008 — Integration Matrix')}

## Internal dependencies

| Module | Depends on | Status |
|--------|------------|--------|
| Storefront | BFF, Kong, backend v1 proxy | ✅ |
| Storefront | 34 Go services | ✅ via Kong |
| Storefront | Guardian SDK | ✅ Jarvis only |
| Storefront | ai-core | ✅ |
| Mobile | backend v1 | ✅ |
| Mobile | Storefront WebView | ✅ MarketplaceEmbed |
| Nexus admin | backend v1 | ✅ |
| Guardian | identity JSON files | ⚠️ not Postgres |
| Food | dispatch-svc, food-svc | ✅ |
| Merchant ads | AIVOS merchant-ad | ✅ proxy |

---

## External dependencies

| Service | Used by | Evidence |
|---------|---------|----------|
| Stripe / Payso webhooks | v1 payments | \`server.js\` webhooks |
| Cloudinary | uploads | \`/api/cloudinary/*\` |
| LINE Login | storefront auth | \`/m/login/line-callback\` |
| FCM push | rider, notifications | rider settings |
| Ollama / ai-core | Jarvis | \`infra/ai-core/\` |
| Bagisto | marketplace bridge | ⚠️ partial |
| ClickHouse | ads analytics | \`clickhouse-ads-setup.sql\` |
| Gigastore | webhooks | \`gigastoreWebhooks.js\` |

---

## Disconnected services

| Service | Issue |
|---------|-------|
| \`aqond-v2/cms/\` | ⚠️ not wired to storefront |
| \`aqond-v2/chat/\` | ⚠️ parallel to shop-chat |
| \`support/\` microservice | ⚠️ separate from v1 support |
| \`aqond-brain/\` | Media factory — not in commerce path |
| Hermes worker | Registry without production UI |
| Service Mesh | Docs only |

---

## Gateway

| Layer | Path |
|-------|------|
| Kong | \`aqond-v2/gateway/kong.yml\` |
| Storefront proxy | \`/api/kong/*\` |
| Docker compose | \`aqond-v2/docker-compose.yml\` |
`,

'009-ai.md': `${HDR('009 — AI Integration Audit')}

| Capability | Status | Evidence |
|------------|--------|----------|
| **Jarvis** | ✅ Implemented | \`/api/ai/jarvis\`, ai-core, localJarvis |
| **Hermes** | ⚠️ Stub | AIVOS orchestrator; ACP inbox seed |
| **Recommendation** | ✅ Partial | rec-svc, experience engine, feed |
| **Voice** | ✅ Partial | Jarvis voice, rider-voice AI |
| **Search** | ✅ | BFF search + visual-search |
| **Memory** | ✅ | \`/api/jarvis/memory\`, conversationMemory |
| **Persona** | ✅ | persona engine |
| **Guardian observe** | ✅ | AGK_OBSERVE |
| **Guardian enforce** | ✅ | AGK_POLICY on Jarvis |
| **Guardian shadow** | ✅ | AGK_FIREWALL=shadow |
| **Intent layer** | ⚠️ API only | 3.8 — not in Jarvis UX |
| **Mission session** | ⚠️ API only | 3.8 — not wired |
| **Capability grants** | ⚠️ Static catalog | intent-catalog.js |
| **ACP** | ✅ Partial | jarvis↔hermes deliver |
| **Knowledge plane** | ✅ | Guardian FAQ |
| **Canary / Confidence** | ✅ | 3.6 SDK |
| **AIVOS (25 modules)** | ⚠️ Mixed | backend/lib/aivos — dev/prototype |
| **Athena / Finance AI / Legal AI** | ❌ Missing | Vision only (060) |

---

## Disconnected AI

| Item | Gap |
|------|-----|
| Merchant assistant → AGK | ❌ no guardian tap |
| Rider voice → AGK | ❌ |
| Visual search → AGK | ❌ |
| AIVOS skills → Guardian | ❌ separate governance |
| ai-core → Mission ID | ❌ |

---

## Mock / local fallbacks

| Path | Fallback |
|------|----------|
| Jarvis | \`runLocalJarvis\` when ai-core offline |
| Merchant ad | AIVOS mock UGC flag |
| Notify | local \`.data/notify\` |
| BFF food cart | local fallback in bff route |
`,

'010-guardian-coverage.md': `${HDR('010 — Guardian Coverage Audit')}

## What passes through AGK today

| Surface | Observe | Enforce | Shadow | Intent | Mission |
|---------|---------|---------|--------|--------|---------|
| \`POST /api/ai/jarvis\` | ✅ canary | ✅ | ✅ compare | ❌ | ❌ |
| GET /api/ai/jarvis health | ⚠️ headers only | ❌ | ❌ | ❌ | ❌ |
| All other storefront APIs | ❌ | ❌ | ❌ | ❌ | ❌ |
| Backend v1 (960 routes) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Go microservices | ❌ | ❌ | ❌ | ❌ | ❌ |
| AIVOS | ❌ | ❌ | ❌ | ❌ | ❌ |

**Evidence:** \`apps/storefront/lib/server/guardianTap.ts\` — only Jarvis route imports SDK.

---

## AGK gates status

| Gate | Doc | Status |
|------|-----|--------|
| Kernel Readiness | 053 | ⏳ soak/chaos in progress |
| Production Confidence | 055 | ⏳ confidence ~98.8, need sustained |
| Governance Validation | 056 | ✅ drills 7/7 |
| Service Mesh 4A | 031 mesh report | ✅ docs only |

---

## Missing policies

| Area | Policy |
|------|--------|
| Commerce checkout | No AGK hook |
| Payment L2 | No mesh HITL |
| Rider actions | No policy |
| Merchant wallet withdraw | No AGK |
| Cross-tenant at commerce | DB only partial |
| AI_ID spoof at commerce | Not enforced |

---

## Missing audit / identity

| Item | Status |
|------|--------|
| MISSION_ID on commerce | ❌ |
| POLICY_ID on non-jarvis | ❌ |
| SERVICE_ID in requests | ❌ not in storefront |
| TENANT_ID in Jarvis | ⚠️ hierarchy exists, not in tap |
| Black box on commerce | ❌ |

---

## Recommendation

Expand AGK via **Intent Layer + Service Mesh (4B)** — not by bolting enforce onto every route ad hoc.
`,

'011-health-score.md': `${HDR('011 — Platform Health Score')}

Scores 0–100 based on PV-1 evidence. **Not production metrics** — architectural audit.

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Architecture** | 62 | Dual stack; strong v2 direction; integration debt |
| **Security** | 48 | Rider auth gap; open v1 routes; AGK narrow coverage |
| **Performance** | UNKNOWN | No load test data in repo |
| **UX** | 65 | 97 pages; ~12 stubs; mobile+storefront |
| **Integration** | 52 | v1/v2 split; partial service wiring |
| **AI** | 58 | Jarvis strong; Hermes/mesh immature |
| **Guardian** | 55 | Excellent kernel; 1 route coverage |
| **Marketplace** | 68 | Core paths exist |
| **Food** | 65 | End-to-end mostly wired |
| **Wallet** | 50 | Dual stack confusion |
| **CRM** | 40 | Chat partial |
| **Admin** | 70 | Nexus mature |
| **Observability** | 45 | AGK audit; fragmented elsewhere |
| **Maintainability** | 42 | 37k line server.js; duplication |
| **Production Readiness** | **38** | See 015 |

**Overall Platform Health: 52/100** (weighted average excluding UNKNOWN performance as 50)
`,

'012-critical-gaps.md': `${HDR('012 — Critical Gaps')}

## Critical

| # | Gap | Why | Business | Security | Effort |
|---|-----|-----|----------|----------|--------|
| C1 | **Dual stack v1/v2** | Wallet/orders/users split | Data inconsistency | Identity confusion | XL |
| C2 | **Rider API auth** | \`rider_id\` param | Fraud, impersonation | **Critical** | M |
| C3 | **AGK coverage = Jarvis only** | Kernel ready but not deployed | AI risk on commerce | Bypass | L (Intent path) |
| C4 | **AGK gates incomplete** | 053/055 not 7-day green | Kernel not prod | False confidence | Time |
| C5 | **Open v1 job/wallet routes** | Weak auth patterns | Abuse | High | L |

## High

| # | Gap | Impact |
|---|-----|--------|
| H1 | Service Mesh not implemented | AI can't safely call services |
| H2 | Hermes not production | Multi-agent vision blocked |
| H3 | Mission/Intent not in UX | No audit replay for commerce |
| H4 | ~12 account settings stubs | User trust / app store rejection |
| H5 | Break-glass admin key | Ops risk |
| H6 | Guardian :8200 no auth | Internal network trust only |

## Medium

| # | Gap |
|---|-----|
| M1 | Duplicate API registrations (reports) |
| M2 | CMS/chat services disconnected |
| M3 | Escrow/live commerce immature |
| M4 | No unified event bus |
| M5 | ClickHouse vs Postgres analytics split |

## Low

| # | Gap |
|---|-----|
| L1 | Design-system pages in prod routes |
| L2 | Legacy /api/job redirect |
| L3 | Niche modules (lotto, PRB) |
`,

'013-technical-debt.md': `${HDR('013 — Technical Debt & Dead Code')}

## Monolith concentration

| Item | Evidence |
|------|----------|
| \`backend/server.js\` ~37k lines, ~609 routes | Single file risk |
| Duplicate route registrations | \`/api/reports/earnings\` twice |

## Duplicate modules

| Area | Paths |
|------|-------|
| Jarvis APIs | v1 \`jarvisRoutes.js\` + v2 \`/api/jarvis/*\` + \`/api/ai/jarvis\` |
| Experience | v1 experience + v2 \`/api/experience/*\` |
| Food admin | v1 \`foodMerchantAdminRoutes\` + v2 \`/api/admin/food/*\` |
| Growth | dual mount \`/api/aivos/growth\` + \`/v1\` |
| Wallet | v1 server + v2 wallet-svc + TS wallet routes |

## Deprecated / legacy

| Item | Evidence |
|------|----------|
| \`GET /api/job\` → 302 | Legacy alias |
| \`/api/rider/link-user\` | Deprecated comment |
| Course marketplace on v1 | Parallel to v2 commerce |

## Dead / stub UI

| Route | Type |
|-------|------|
| \`/m/account/settings/help\` etc. | MpSettingsStubPage |
| \`/m/onboarding/intent\` | Links only |
| \`/m/merchant/qr\` | Client QR only |

## Temporary workarounds

| Item | Evidence |
|------|----------|
| \`AQOND_LOCAL_DEV\` flags | Local order bypass |
| \`AIVOS_MERCHANT_AD_MOCK_UGC\` | Mock content |
| \`runLocalJarvis\` fallback | ai-core offline |
| Notify local \`.data/notify\` | Filesystem fallback |
| Guardian in-memory audit | Not durable Postgres |

## Legacy parallel apps

| App | Status |
|-----|--------|
| \`mobile/\` v1 | Active — jobs/wallet |
| \`nexus-admin-core/\` | Active — admin |
| v2 storefront | Primary commerce growth |

**Cursor rule:** \`aqond-v2/.cursor/rules/no-touch-mobile.mdc\` — intentional split.
`,

'014-production-readiness.md': `${HDR('014 — Production Readiness Checklist')}

## Must pass before public launch

### Security
- [ ] Rider API proper auth (not query param)
- [ ] AGK gates 053 + 055 + 056 signed
- [ ] v1 open routes audit + harden
- [ ] Guardian internal auth / network policy
- [ ] Break-glass admin rotated keys
- [ ] Tenant isolation in commerce APIs

### Platform
- [ ] v1/v2 identity + wallet strategy decided
- [ ] Service Mesh 4B or explicit interim BFF-only plan
- [ ] Event bus / webhook idempotency verified
- [ ] Postgres backup / DR tested (056 drill extended)

### AI
- [ ] Jarvis AGK confidence ≥ 99 sustained (055)
- [ ] Intent/Mission wired to commerce or documented exception
- [ ] Hermes scope defined (in or out of launch)

### UX
- [ ] Account settings stubs completed or hidden
- [ ] Payment failure flows tested
- [ ] Food + marketplace checkout E2E on prod-like

### Ops
- [ ] 7-day soak green
- [ ] Chaos + attack sim on schedule
- [ ] Observability dashboards (021 mesh + AGK)
- [ ] Incident playbook (047) briefed

### Compliance
- [ ] Audit trail for L2 financial (wallet, payment)
- [ ] HITL on payment paths
- [ ] POLICY_ID on all AGK decisions (done for enforce API)

### Testing (PV-2/3)
- [ ] Master Scenario Book per role
- [ ] Validation Tracker operational
- [ ] Sprint 35 regression in CI
`,

'015-executive-summary.md': `${HDR('015 — Executive Summary (CTO Brief)')}

## 1. Can AQOND launch today?

**No.** Platform is feature-rich in development but **not production-ready for public launch**. Estimated readiness: **38%**. Jarvis + core browse/checkout work in local dev; security gaps, dual-stack debt, and incomplete AGK gates block launch.

---

## 2. Biggest production risk

**Dual-stack architecture (v1 backend + v2 commerce) with weak rider authentication and AGK protecting only Jarvis.** A public launch exposes wallet/order/identity inconsistencies and rider impersonation before the kernel protects commerce paths.

---

## 3. Modules production ready (relative)

| Module | Readiness |
|--------|-----------|
| Jarvis (local dev path) | ⚠️ ~75% — needs AGK gates |
| Marketplace browse/search | ⚠️ ~65% |
| Nexus admin (internal) | ⚠️ ~70% |
| Guardian kernel (lab) | ⚠️ ~80% code, 0% platform coverage |
| Food delivery (happy path) | ⚠️ ~60% |

---

## 4. Modules incomplete

| Module | Readiness |
|--------|-----------|
| Service Mesh | 0% impl (4A docs only) |
| Hermes / multi-agent | ~25% |
| Live commerce | ~50% |
| CMS / analytics services | ~40% |
| Cross-stack wallet | ~50% |
| Account settings stubs | UI only |

---

## 5. Broken user journeys

| Journey | Issue |
|---------|-------|
| v1 mobile wallet ↔ v2 storefront wallet | Disconnected |
| Account settings (help, delete, privacy) | Stubs |
| Hermes orchestration | No production path |
| Service capability invoke | Not built |
| Rider security | Auth gap |

---

## 6. Missing integrations

- Service Mesh (Intent → capability → service)
- Mission ID on commerce flows
- Event bus (AGK chaos stub)
- v1 ↔ v2 unified identity
- CMS, standalone chat service
- OPA/Redis/Vault (production AGK deps)

---

## 7. Absent Guardian protections

- 959+ of ~960 backend routes bypass AGK
- All Go microservices bypass AGK
- Merchant assistant, rider voice, visual search bypass AGK
- No MISSION_ID on purchases
- No POLICY_ID on commerce
- AGK :8200 unauthenticated (internal trust model)

---

## 8. What should the team work on first?

1. **Complete AGK gates** (053 soak, 055 confidence, sign 056) — kernel discipline
2. **Fix rider API authentication** — critical security
3. **Decide v1/v2 wallet + identity strategy** — architectural decision
4. **PV-2 Master Scenario Book** — role-based validation (not 1000 random tests)
5. **Wire Intent/Mission to one commerce flow** (e.g. food checkout) as AGK pilot
6. **Hide or complete account settings stubs**
7. **Do NOT start Service Mesh 4B** until gates + 4A sign-off

---

## 9. Top 20 priority tasks

| # | Task | Priority |
|---|------|----------|
| 1 | AGK 7-day soak green | P0 |
| 2 | Rider API auth hardening | P0 |
| 3 | v1/v2 identity wallet ADR | P0 |
| 4 | AGK confidence ≥99 sustained | P0 |
| 5 | PV-2 scenario book (consumer checkout) | P0 |
| 6 | PV-2 scenario book (food E2E) | P0 |
| 7 | Remove/hide settings stubs | P1 |
| 8 | Audit open v1 job/wallet routes | P1 |
| 9 | Guardian network auth | P1 |
| 10 | Mission ID pilot on checkout | P1 |
| 11 | Sprint 35 CI gate | P1 |
| 12 | Payment webhook E2E tests | P1 |
| 13 | Sign Phase 4A mesh architecture | P1 |
| 14 | Duplicate route cleanup (reports) | P2 |
| 15 | Merchant assistant AGK tap | P2 |
| 16 | Event bus design → impl plan | P2 |
| 17 | Hermes in/out of launch scope | P2 |
| 18 | Live commerce go/no-go | P2 |
| 19 | DBA FK/index audit | P2 |
| 20 | Validation Tracker tool (PV-3) | P2 |

---

## 10. Overall Production Readiness Score

# **38 / 100**

| Layer | Score |
|-------|-------|
| Feature completeness | 55 |
| Security | 42 |
| AGK / governance | 50 (kernel strong, coverage weak) |
| Integration | 45 |
| Test / validation maturity | 25 |
| Operational readiness | 30 |

---

## Validation program next steps

| Phase | Deliverable |
|-------|-------------|
| **PV-1** | ✅ This audit (Layer 1 — Feature Inventory) |
| **PV-2** | Master Scenario Book per role |
| **PV-3** | Validation Tracker (✅ ⚠️ ❌ 🔄) |

**No Phase 4B code. No AGK behavior changes until gates pass.**
`,
};

Object.entries(files).forEach(([name, body]) => w(name, body));

console.log(`\nAQOND Platform Validation PV-1 generated in docs/platform-validation/`);
