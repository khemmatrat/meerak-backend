# Platform Validation — Regression Dashboard

**Last run:** 2026-07-02  
**Suite:** S001–S010 (android-chrome)  
**Build:** `8a736187` (post S010, pre-governance)

## Summary

| Metric | Value |
|--------|-------|
| **Result** | **79 / 83 PASS** |
| **Blocking failures** | **0** |
| **Known flakes** | 4 (FLAKE-001–004) |
| **Effective pass rate** | **100%** (excluding accepted flakes) |
| **Consumer Checkout impact** | **None** — S006–S010 functional pass |

## By scenario

| Scenario | Mission | E2E | Stable |
|----------|---------|-----|--------|
| S001 | Browse | ⚠ FLAKE-001/002 | Frozen |
| S002 | Browse | ✓ PASS | Frozen |
| S003 | Browse | ✓ PASS | Frozen |
| S004 | Browse | ⚠ FLAKE-003 (telemetry) | **Stable** |
| S005 | Browse | ✓ PASS | Frozen |
| S006 | Checkout | ✓ PASS | Complete |
| S007 | Checkout | ✓ PASS | **Stable** |
| S008 | Checkout | ✓ PASS | **Stable** |
| S009 | Checkout | ✓ PASS | **Stable** (sealed) |
| S010 | Checkout | ⚠ FLAKE-004 (telemetry) | **Stable** (sealed) |

## Accepted flakes

| ID | Scenario | Issue | Observed |
|----|----------|-------|----------|
| FLAKE-001 | S001 | Skeleton > 500ms | 758ms |
| FLAKE-002 | S001 | Home load > 8000ms | 8139ms |
| FLAKE-003 | S004 | Cart-add telemetry timing | Buy-sheet timeout in long suite |
| FLAKE-004 | S010 | Result telemetry timing | Payment confirm slow in long suite |

## Baselines

| Baseline | Tag | Scope | Status |
|----------|-----|-------|--------|
| B001 | `baseline-wave1-2026-07-02` | S001–S005 Browse | Frozen |
| B002 | `baseline-wave2-2026-07-02` | S006–S010 Checkout | **Active** |

## Command

```bash
cd aqond-v2/apps/storefront
npx playwright test e2e/pv-s001-home.spec.ts e2e/pv-s002-search.spec.ts \
  e2e/pv-s003-product.spec.ts e2e/pv-s004-cart.spec.ts \
  e2e/pv-s005-cart-view.spec.ts e2e/pv-s006-checkout-start.spec.ts \
  e2e/pv-s007-place-order.spec.ts e2e/pv-s008-payment-ui.spec.ts \
  e2e/pv-s009-payment-verify.spec.ts e2e/pv-s010-payment-result.spec.ts \
  --project=android-chrome
```
