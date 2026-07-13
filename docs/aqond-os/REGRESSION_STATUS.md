# AQOND — Regression Status

**Last Updated:** 2026-06-29  
**Latest Regression Date:** 2026-06-28 (MAD suite)  
**Regression Coverage:** ~40% (AIVOS merchant-ad focused; storefront E2E partial)

---

## Verified Modules

| Module | Last Verified | Test / Method |
|--------|---------------|---------------|
| AIVOS merchant-ad MAD01–11 | 2026-06-28 | `backend/__tests__/aivosMerchantAd*.test.js` |
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
| Grok end-to-end (`mad-*`) | Full generate with XAI key after restart |
| PDP gallery video autoplay | Manual + optional Playwright |
| Existing product "เพิ่มวิดีโอ" flow | E2E ad-studio?product_id= |
| catalog-svc production path | Integration test vs local JSON |
| Kenburns fallback disabled default | Env flag regression |

---

## Regression Commands

```bash
# Backend merchant-ad tests
cd backend
set AIVOS_RUNTIME_ENABLED=1
set AIVOS_MERCHANT_AD_ENABLED=1
node --test __tests__/aivosMerchantAd*.test.js

# Storefront dev
cd aqond-v2/apps/storefront
npm run dev
# Manual: publish product → check /m/home fresh section
```

---

## History

| Date | Action |
|------|--------|
| 2026-06-29 | DOS bootstrap; regression doc created |
| 2026-06-28 | MAD01–11 pass (sprint 4 Grok) |
