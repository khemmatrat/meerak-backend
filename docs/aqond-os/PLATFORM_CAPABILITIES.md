# Platform Capability Matrix

**Last Updated:** 2026-06-30  
**Purpose:** At-a-glance readiness across modules.

Legend: ✅ Ready · 🟡 Partial · ⬜ Missing · 🔌 API only

| Module | Backend | API | User UI | Merchant UI | Rider UI | Admin | Analytics | Event Bus |
|--------|---------|-----|---------|-------------|----------|-------|-----------|-----------|
| **Food** | 🟡 food-svc + local | ✅ BFF | 🟡 `/m/food` | 🟡 merchant | — | 🟡 Food Merchant OS | ⬜ | 🟡 |
| **Marketplace** | 🟡 order/cart | ✅ | 🟡 `/m/*` | 🟡 | — | 🟡 | ⬜ | 🟡 |
| **Rider / Dispatch** | 🟡 dispatch-svc + local | ✅ | — | — | 🟡 Rider OS | 🟡 | ⬜ | ✅ |
| **Wallet / Pay** | ✅ backend + wallet-svc | ✅ | 🟡 account wallet | 🟡 | 🟡 | 🟡 | ⬜ | ⬜ |
| **Event Bus / Timeline** | 🟡 storefront spine | ✅ | 🟡 track pages | 🟡 | 🟡 | ✅ admin timeline | ⬜ | ✅ |
| **Merchant OS** | 🟡 merchant-ops | ✅ | — | 🟡 `/m/merchant` | — | 🟡 | 🟡 sales | ⬜ |
| **AIVOS / Brain** | ✅ backend/aivos | ✅ | 🟡 ad studio | 🟡 | — | 🟡 | ⬜ | ⬜ |
| **Services (mobile)** | ✅ backend jobs | ✅ | ✅ mobile app | — | — | 🟡 | ⬜ | ⬜ |
| **Live Commerce** | 🟡 live/ | 🟡 | 🟡 | ⬜ | — | ⬜ | ⬜ | ⬜ |
| **CRM / Campaigns** | ⬜ | ⬜ | ⬜ | ⬜ | — | ⬜ | ⬜ | ⬜ |
| **Design System (AXS)** | — | — | ⬜ | ⬜ | ⬜ | ⬜ | — | — |
| **Platform Monitoring** | ⬜ | ⬜ | — | — | — | ⬜ | — | — |

## Completion estimates (2026-06-30)

| Layer | % |
|-------|---|
| Architecture (services exist) | ~75% |
| API surface (storefront BFF) | ~70% |
| User UI polish | ~40% |
| Rider OS | ~55% |
| Merchant OS | ~50% |
| Admin OS | ~35% |
| AXS Design System | ~15% (docs done, migration pending) |
| Analytics / CRM | ~10% |

## Next unlock

Sprint 22 AXS → then UI migration sprints 23–26 per product.
