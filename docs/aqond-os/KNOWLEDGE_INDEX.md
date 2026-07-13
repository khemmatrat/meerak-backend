# AQOND — Knowledge Index

**Last Updated:** 2026-06-30

AI navigation map. Locate modules here before scanning code.

Every entry includes: Purpose, Location, Dependencies, Related APIs, Related Database Tables, Related Products, Last Updated, Current Status.

---

## Merchant Ad Video (AIVOS)

| Field | Value |
|-------|-------|
| **Purpose** | AI ad clip wizard: brief → generate (Grok/ffmpeg) → publish → token wallet |
| **Location** | `backend/lib/aivos/merchant-ad/` |
| **Dependencies** | AIVOS runtime, XAI API (Grok), ffmpeg, `merchantAdStorage.js` |
| **Related APIs** | `/api/aivos/merchant-ad/*` — [API_CATALOG.md](./API_CATALOG.md) |
| **Related Database Tables** | JSON: `.data/aivos/merchant-ad/jobs.json`, `token-wallets.json` |
| **Related Products** | [market.md](./products/market.md), [brain.md](./products/brain.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational (dev); Grok production hardening pending |

**Key files:** `routes.js`, `videoEngine.js`, `grokVideoBridge.js`, `tokenEngine.js`, `config.js`

---

## Merchant Ad Storefront

| Field | Value |
|-------|-------|
| **Purpose** | Ad Studio UI, BFF proxy to AIVOS, product draft/publish, background jobs |
| **Location** | `aqond-v2/apps/storefront/` — `components/mobile/MerchantAd*`, `lib/server/merchantAd*` |
| **Dependencies** | Backend AIVOS, `merchantCatalog.ts`, `homeProducts.ts` |
| **Related APIs** | `/api/merchant/ad-video/*` |
| **Related Database Tables** | `.data/dev/catalog.json`, `merchant-ad-videos.json`, `listings/manifest.json` |
| **Related Products** | [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | ~80% — PDP video integration in progress |

**Key files:** `MerchantAdStudioClient.tsx`, `AdClipProductCard.tsx`, `merchantAdPublish.ts`, `merchantAdProxy.ts`

---

## Home Products / Catalog

| Field | Value |
|-------|-------|
| **Purpose** | Merge Kong BFF + local catalog; pin merchant-ad products on home |
| **Location** | `aqond-v2/apps/storefront/lib/server/homeProducts.ts`, `localCatalog.ts`, `merchantCatalog.ts` |
| **Dependencies** | `marketplaceSync.ts`, `affiliate.json` (studio) |
| **Related APIs** | `/api/bff/v1/home`, `loadHomeProducts()` |
| **Related Database Tables** | Local JSON catalog; production: catalog-svc |
| **Related Products** | [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Affiliate overwrite fixed (DOS-002) |

---

## Wallet (Legacy)

| Field | Value |
|-------|-------|
| **Purpose** | Deposits, topup, transactions, receipts, tax documents |
| **Location** | `backend/server.js` (`/api/wallet/*`), migrations 158+ |
| **Dependencies** | PaySo, `paymentManager.js`, PostgreSQL |
| **Related APIs** | `/api/wallet/summary`, `/deposit`, `/transactions` |
| **Related Database Tables** | `wallet_*`, `payment_ledger_audit`, deposit webhook logs |
| **Related Products** | [pay.md](./products/pay.md), [services.md](./products/services.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Stable — do not regress in course/marketplace work |

---

## Wallet (v2)

| Field | Value |
|-------|-------|
| **Purpose** | Microservice wallet for v2 commerce |
| **Location** | `aqond-v2/services/wallet-svc/`, `coins-svc/` |
| **Dependencies** | Kong, Postgres v2 migrations |
| **Related APIs** | BFF `/api/bff/v1/wallet/*` |
| **Related Database Tables** | `034_merchant_wallet_fees.sql` |
| **Related Products** | [pay.md](./products/pay.md), [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Scaffolded |

---

## Payment

| Field | Value |
|-------|-------|
| **Purpose** | PaySo/Stripe intents, holds, webhooks, card tokenization |
| **Location** | `backend/lib/paymentManager.js`, `aqond-v2/services/payment-svc/` |
| **Dependencies** | PaySo, Stripe, PostgreSQL ledger |
| **Related APIs** | `/api/payments/*`, `/api/payment-gateway/*`, `/api/webhooks/*` |
| **Related Database Tables** | Payment intents, `payment_ledger_audit` |
| **Related Products** | [pay.md](./products/pay.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Production-critical |

---

## AIVOS Runtime

| Field | Value |
|-------|-------|
| **Purpose** | AI apps, skills, workflows, billing, governance, tenant sessions |
| **Location** | `backend/lib/aivos/` |
| **Dependencies** | `AIVOS_RUNTIME_ENABLED=1`, migration `260_ai_runtime_semantic.sql` |
| **Related APIs** | `/api/aivos/*` |
| **Related Database Tables** | AIVOS semantic runtime tables |
| **Related Products** | [brain.md](./products/brain.md), [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Phases 1–20 complete; merchant-ad Phase 21 active |

---

## Food

| Field | Value |
|-------|-------|
| **Purpose** | Nearby restaurants, menu, cart, order tracking |
| **Location** | `aqond-v2/services/food-svc/`, storefront `localFood.ts` |
| **Dependencies** | Kong, `025_food_svc.sql` |
| **Related APIs** | BFF `v1/food/*`, `/api/food/tracking/*` |
| **Related Database Tables** | `025_food_svc.sql` + local food JSON |
| **Related Products** | [food.md](./products/food.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational (local dev) |

---

## Course Marketplace

| Field | Value |
|-------|-------|
| **Purpose** | Udemy-style courses, studio, purchases, moderation |
| **Location** | `backend/lib/courseMarketplace/`, `nexus-admin-core/` |
| **Dependencies** | Payment, wallet, migrations 235–246 |
| **Related APIs** | `/api/courses/*`, `/api/course-marketplace/*` |
| **Related Database Tables** | Migrations 235–246, 259 |
| **Related Products** | [services.md](./products/services.md), [admin.md](./products/admin.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Phases 3–18 complete |

---

## Ads Platform

| Field | Value |
|-------|-------|
| **Purpose** | Campaigns, billing ledger, outcomes, optimization |
| **Location** | `backend/lib/ads/`, `ads-admin-core/` |
| **Dependencies** | ClickHouse (verification), Postgres ledger |
| **Related APIs** | `/api/ads-admin/*` |
| **Related Database Tables** | Migrations 247–256 |
| **Related Products** | [admin.md](./products/admin.md), [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational |

---

## Job Board

| Field | Value |
|-------|-------|
| **Purpose** | Job posting, bids, advance procurement |
| **Location** | `backend/server.js`, `mobile/` job views |
| **Dependencies** | PostgreSQL, push notifications |
| **Related APIs** | `/api/jobs/*`, `/api/advance-jobs/*` |
| **Related Database Tables** | Migrations 091–098, 231–234 |
| **Related Products** | [services.md](./products/services.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Stable |

---

## Admin (Nexus)

| Field | Value |
|-------|-------|
| **Purpose** | KYC review, course admin, content, ads summary |
| **Location** | `nexus-admin-core/` |
| **Dependencies** | Backend `/api/admin/*` |
| **Related APIs** | `/api/admin/*` |
| **Related Database Tables** | KYC, course audit tables |
| **Related Products** | [admin.md](./products/admin.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Operational |

---

## Live Commerce

| Field | Value |
|-------|-------|
| **Purpose** | LiveKit streams, commerce overlay, studio playback |
| **Location** | `aqond-v2/live/`, storefront `/api/live-commerce/*` |
| **Dependencies** | `token-service`, `commerce-service`, LiveKit |
| **Related APIs** | `/api/live-commerce/*` |
| **Related Database Tables** | Live session tables |
| **Related Products** | [market.md](./products/market.md) |
| **Last Updated** | 2026-06-29 |
| **Current Status** | Scaffolded |

---

## Index Maintenance

When adding a module, append a new section. Never remove historical entries — mark **Status: deprecated** instead.

### AI Director / UGC (brain product)

| Doc | Purpose |
|-----|---------|
| [products/brain/AI_DIRECTOR_ARCHITECTURE.md](./products/brain/AI_DIRECTOR_ARCHITECTURE.md) | Orchestrator + engines |
| [products/brain/UGC_LIPSYNC_ARCHITECTURE.md](./products/brain/UGC_LIPSYNC_ARCHITECTURE.md) | UGC format technical flow |
| [products/brain/UGC_PROMPT_LIBRARY.md](./products/brain/UGC_PROMPT_LIBRARY.md) | Category prompt templates |
| [products/brain/UGC_STYLE_LIBRARY.md](./products/brain/UGC_STYLE_LIBRARY.md) | Style presets |
| [products/brain/UGC_SCRIPT_ENGINE.md](./products/brain/UGC_SCRIPT_ENGINE.md) | Script generation |
| [products/brain/AI_DIRECTOR_ROADMAP.md](./products/brain/AI_DIRECTOR_ROADMAP.md) | Implementation phases |

**Code (when approved):** `backend/lib/aivos/merchant-ad/director/`, `aqond-brain/scripts/merchant_ad_ugc.py`

### AI Director code (Phase 1)

| Path | Role |
|------|------|
| backend/lib/aivos/merchant-ad/director/orchestrator.js | Orchestrator |
| backend/lib/aivos/merchant-ad/director/engines/videoEngine.js | generateVideo() |
| backend/lib/aivos/merchant-ad/director/providers/video/ | TVC + UGC adapters |
| backend/__tests__/aivosMerchantAdDirector.test.js | MAD12–MAD18 |

### Prompt Composition Engine (Phase 2)

| Path | Role |
|------|------|
| director/engines/promptComposer.js | composePromptFromDimensions |
| director/engines/promptConfigLoader.js | Load versioned JSON |
| director/data/prompt-catalog.json | Catalog v2.0.0 + recipes |
| director/data/*.json | Dimension fragments |
| __tests__/aivosMerchantAdPromptEngine.test.js | MAD19–MAD25 |

### Script Strategy Engine (Phase 3)

| Path | Role |
|------|------|
| director/engines/strategyEngine.js | Marketing strategy selection |
| director/engines/psychologyEngine.js | Emotional strategy |
| director/engines/scriptComposer.js | Layer composition |
| director/data/script-catalog.json | Catalog v3.0.0 |
| director/data/marketing-strategies.json | 11 sell strategies |
| director/data/business-strategy-map.json | Industry→strategy |
| __tests__/aivosMerchantAdScriptEngine.test.js | MAD26–MAD32 |

---

## AQOND Experience System (AXS) — Sprint 22

| Field | Value |
|-------|-------|
| **Purpose** | Unified design language for User, Merchant, Rider, Admin |
| **Location** | `docs/aqond-os/design-system/`, `aqond-v2/packages/ui/` |
| **Dependencies** | Inter + Noto Sans Thai, Lucide icons |
| **Related docs** | [design-system/README.md](./design-system/README.md) |
| **Status** | Docs complete; migration not started |

## Platform Registries

| Doc | Purpose |
|-----|---------|
| [PLATFORM_CAPABILITIES.md](./PLATFORM_CAPABILITIES.md) | Module readiness matrix |
| [FEATURE_REGISTRY.md](./FEATURE_REGISTRY.md) | Anti-duplicate feature list |
| [API_REGISTRY.md](./API_REGISTRY.md) | Endpoint registry |
| [SYSTEM_DATA_FLOW.md](./SYSTEM_DATA_FLOW.md) | Data flow diagram |
| [PLATFORM_COMPLETION_REPORT.md](./PLATFORM_COMPLETION_REPORT.md) | Audit report |

| FTX (First-Time Experience) | docs/aqond-os/products/ftx.md | Sprint 30 |

| Experience layer stack | docs/aqond-os/experience-stack.md | Sprint 30 |
| Kernel target architecture | docs/aqond-os/AQOND_KERNEL.md | Sprint 30 |
| Primary/secondary/hidden intent | docs/aqond-os/INTENT_ENGINE.md | Sprint 30 |
| User lifecycle stages | docs/aqond-os/LIFECYCLE_ENGINE.md | Sprint 30 |
| Proactive Jarvis | docs/aqond-os/JARVIS_AI_OS.md | Sprint 30 |
| Sprint 30a deliverables | docs/aqond-os/SPRINT_30a.md | Sprint 30 || Jarvis 10-layer architecture | docs/aqond-os/products/jarvis/JARVIS_ARCHITECTURE.md | Arch Freeze |
| Memory tiers L3 | docs/aqond-os/products/jarvis/JARVIS_MEMORY.md | Arch Freeze |
| Language intelligence L1+L5 | docs/aqond-os/products/jarvis/JARVIS_LANGUAGE_ENGINE.md | Arch Freeze |
| Regional personas L2+4+9 | docs/aqond-os/products/jarvis/JARVIS_PERSONAS.md | Arch Freeze |
| Locale prompt library | docs/aqond-os/products/jarvis/JARVIS_PROMPT_LIBRARY.md | Arch Freeze |
| Context matrix L7 | docs/aqond-os/products/jarvis/JARVIS_CONTEXT_ENGINE.md | Arch Freeze |
| Proactive recommendations L8 | docs/aqond-os/products/jarvis/JARVIS_RECOMMENDATION_ENGINE.md | Arch Freeze |
| Event subscribe L10 | docs/aqond-os/products/jarvis/JARVIS_EVENT_INTEGRATION.md | Arch Freeze |
| API stability review | docs/aqond-os/products/jarvis/JARVIS_API.md | Arch Freeze |
| Sprints 31–35 | docs/aqond-os/products/jarvis/JARVIS_ROADMAP.md | Arch Freeze |
| All Jarvis matrices | docs/aqond-os/products/jarvis/JARVIS_CONTRACTS.md | Arch Freeze |
| Super App stack | docs/aqond-os/architecture/SUPER_APP_ARCHITECTURE.md | Arch Freeze |
| Event envelope map | docs/aqond-os/architecture/SUPER_APP_EVENT_MAP.md | Arch Freeze |
| Context sources | docs/aqond-os/architecture/SUPER_APP_CONTEXT_MAP.md | Arch Freeze |
| AI routing | docs/aqond-os/architecture/SUPER_APP_AI_GATEWAY.md | Arch Freeze |
| Jarvis permissions | docs/aqond-os/architecture/SUPER_APP_PERMISSION_MODEL.md | Arch Freeze |
| Session FSM | docs/aqond-os/architecture/SUPER_APP_STATE_MACHINE.md | Arch Freeze |
| Domain ownership | docs/aqond-os/architecture/SUPER_APP_DOMAIN_BOUNDARIES.md | Arch Freeze |
| Readiness audit | docs/aqond-os/reports/JARVIS_READINESS_REPORT.md | Arch Freeze |
