# AQOND — Current Status (Storefront / Merchant-Ad Track)

**Last Updated:** 2026-06-29
**Current Sprint:** Merchant Ad Video + Storefront Product Integration
**Scope:** Storefront app, merchant ad video pipeline, PDP, home catalog. ไม่เกี่ยวกับ Jarvis architecture track — ดู `CURRENT_STATUS__JARVIS_ARCHITECTURE.md` แยกต่างหาก

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

- AIVOS `merchant-ad` module (Phase 21): brief, generate, Grok bridge, token wallet, publish API
- Storefront: `MerchantAdStudioClient`, background job banner, progress ring
- Storefront: `AdClipProductCard` — AI product draft, save, publish
- `loadHomeProducts()` — local catalog + Kong merge, merchant-ad pinning
- `affiliate.json` overwrite fix in `localCatalog.ts`
- Dev proxy: `AIVOS_MERCHANT_AD_DEV_KEY`, backend runtime env fix

---

## Modules In Progress

| Module | Work Remaining |
|--------|----------------|
| PDP `MobileProductClient` | Swipe gallery + video autoplay polish |
| `pdpStudioBridge` | Catalog `product_video_url` + studio posts |
| Grok production path | Ensure `mad-*` jobs, not kenburns fallback |
| Merchant menu product cards | Image, SKU, add-video CTA |

---

## Modules Pending

- Full API catalog automation (CI scan)
- Database schema auto-sync from migrations
- E2E tests for publish → home visibility
- Kong/catalog-svc write path (vs local `.data` fallback)
- Multi-tenant merchant-ad quotas in production

---

## Current Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Kenburns fallback when backend proxy fails | High | `.env.local` dev key + backend restart |
| Local `.data` catalog not in production | High | Document catalog-svc integration path |
| `affiliate.json` stale links | Medium | Fixed: catalog wins over affiliate |
| Grok API cost / timeout | Medium | Per-shot timeout 4min, heartbeat progress |
| DOS drift from codebase | Medium | End-of-day workflow enforcement |

---

## Immediate Next Tasks

1. Verify Grok path end-to-end (`mad-*` jobs, not `adv-*` kenburns)
2. Complete PDP video slide autoplay on gallery swipe
3. Wire `attachAdVideoToProduct` for existing-product video button flow
4. Add regression test: publish product → appears in `loadHomeProducts()` fresh section
5. Update `PLATFORM_READINESS_STATUS.md` after MAD test suite run *(เดิมชี้ไป REGRESSION_STATUS.md — เปลี่ยนตามไฟล์รวมใหม่)*

---

## Key Dev URLs

| Service | URL |
|---------|-----|
| Storefront | `http://localhost:3003` |
| Backend | `http://localhost:3001` |
| Ad Studio | `http://localhost:3003/m/merchant/ad-studio` |
| AIVOS health | `GET /api/aivos/merchant-ad/health` |
| Kong BFF | `http://127.0.0.1:8000/api/v1/bff/v1/home` |
