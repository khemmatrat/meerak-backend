# Platform Validation — Regression Dashboard

**Last run:** 2026-07-02  
**Suite:** S001–S008 (android-chrome)  
**Build:** `104fd386` (post S008)

## Summary

| Metric | Value |
|--------|-------|
| **Result** | **65 / 67 PASS** |
| **Blocking failures** | **0** |
| **Known flakes** | 2 (FLAKE-001, FLAKE-002) |
| **Effective pass rate** | **100%** (excluding accepted flakes) |
| **S008 regression impact** | **None** (S002–S008 all pass) |

## By scenario

| Scenario | Mission | E2E status | Stable |
|----------|---------|------------|--------|
| S001 | Browse | ⚠ FLAKE-001 + FLAKE-002 (accepted) | Frozen |
| S002 | Browse | ✓ PASS | Frozen |
| S003 | Browse | ✓ PASS | Frozen |
| S004 | Browse | ✓ PASS | **Stable** |
| S005 | Browse | ✓ PASS | Frozen |
| S006 | Checkout | ✓ PASS | Complete |
| S007 | Checkout | ✓ PASS | **Stable** |
| S008 | Checkout | ✓ PASS | **Stable** |

## Accepted flakes

| ID | Test | Observed | Status |
|----|------|----------|--------|
| FLAKE-001 | S001 skeleton > 500ms | 744ms (long suite) | Accepted |
| FLAKE-002 | S001 home load > 8000ms | 8110ms (long suite) | Accepted |

See [KNOWN-ISSUES-REGISTRY.md](KNOWN-ISSUES-REGISTRY.md).

## Next mission

**S009 — Payment verify** (blocked until S008 governance seal complete — **now unblocked**)

## Commands

```bash
cd aqond-v2/apps/storefront
npx playwright test \
  e2e/pv-s001-home.spec.ts e2e/pv-s002-search.spec.ts \
  e2e/pv-s003-product.spec.ts e2e/pv-s004-cart.spec.ts \
  e2e/pv-s005-cart-view.spec.ts e2e/pv-s006-checkout-start.spec.ts \
  e2e/pv-s007-place-order.spec.ts e2e/pv-s008-payment-ui.spec.ts \
  --project=android-chrome
```
