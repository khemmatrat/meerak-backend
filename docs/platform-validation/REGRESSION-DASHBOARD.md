# Platform Validation — Regression Dashboard

**Last run:** 2026-07-02  
**Suite:** S001–S007 (android-chrome)  
**Build:** `9db705ef` (post S007)

## Summary

| Metric | Value |
|--------|-------|
| **Result** | **70 / 71 PASS** |
| **Blocking failures** | **0** |
| **Known flakes** | 1 (FLAKE-001) |
| **Effective pass rate** | **100%** (excluding accepted flake) |

## By scenario

| Scenario | Mission | E2E status | Stable |
|----------|---------|------------|--------|
| S001 | Browse | ⚠️ FLAKE-001 (accepted) | Frozen |
| S002 | Browse | ✅ PASS | Frozen |
| S003 | Browse | ✅ PASS | Frozen |
| S004 | Browse | ✅ PASS | Frozen |
| S005 | Browse | ✅ PASS | Frozen |
| S006 | Checkout | ✅ PASS | Complete |
| S007 | Checkout | ✅ PASS | **Stable** |

## FLAKE-001 detail

- **Test:** S001 skeleton timing > 500ms budget
- **When:** Long combined regression only
- **Action:** None — accepted per [KNOWN-ISSUES-REGISTRY.md](KNOWN-ISSUES-REGISTRY.md)

## Next mission

**S008 — Payment Processing** (not started — await review after S007 stable)

## Commands

```bash
cd aqond-v2/apps/storefront
npx playwright test e2e/pv-s001-home.spec.ts e2e/pv-s001-production.spec.ts \
  e2e/pv-s002-search.spec.ts e2e/pv-s003-product.spec.ts \
  e2e/pv-s004-cart.spec.ts e2e/pv-s004-production.spec.ts \
  e2e/pv-s005-cart-view.spec.ts e2e/pv-s006-checkout-start.spec.ts \
  e2e/pv-s007-place-order.spec.ts --project=android-chrome
```
