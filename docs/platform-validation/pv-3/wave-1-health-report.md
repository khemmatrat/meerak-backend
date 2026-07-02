# Wave 1 Health Report — Marketplace Browse-to-Cart Baseline

**Baseline tag:** `baseline-wave1-2026-07-02` (Baseline 001 — Marketplace Browse)
**Registry:** `docs/platform-validation/BASELINE-REGISTRY.md`

**Snapshot ID:** `WAVE1-2026-07-02`
**Mission:** M-001 Marketplace Customer Journey
**Scope:** S001 → S002 → S003 → S004 (pre-checkout)
**Environment:** `local-dev:3003` · build `29ac144d` (post S004 Production Hardening)
**Purpose:** Baseline ก่อน Merge Checkout — ใช้ย้อนเปรียบเทียบเมื่อมี Regression ใน 3–6 เดือนข้างหน้า

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Scenarios complete** | 4 / 4 (Wave 1 slice) |
| **Average Experience** | **9.0** / 10 |
| **Production Pass** | 1 (S004) |
| **Functional Pass** | 3 (S001, S002, S003) |
| **Regression (e2e)** | **38 / 38 PASS** (android-chrome, post-S004) |
| **Total Time Saved (baseline)** | **37 min** / successful browse-to-cart session |
| **Go / No-Go** | **Conditional GO** — ต่อ Wave 1 PV (S005+) · **No-Go** full prod launch จนกว่า checkout ผ่าน |

---

## Scenario Scorecard

| ID | Title | Grade | Experience | Business | Time Saved | E2E |
|----|-------|-------|------------|----------|------------|-----|
| S001 | Open storefront home | Functional Pass | 9.1 | High | 18 min | 12 steps |
| S002 | Find & decide (search) | Functional Pass | 8.7 | High | 6 min | 10/10 |
| S003 | Product detail | Functional Pass | 8.8 | High | 8 min | 9/9 |
| S004 | Add to cart | **Production Pass** | **9.3** | High | 5 min | 16/16 |

---

## Experience Dimensions (Wave average)

| Dimension | Wave Avg |
|-----------|----------|
| Speed | 8.8 |
| Clarity | 9.4 |
| Recovery | 9.4 |
| Smoothness | 8.6 |
| Confidence | 8.9 |

---

## Regression Status

Combined S001–S004: **38/38 PASS** (android-chrome). S004 also **16/16** on iphone-safari.

Reproduce:
`npx playwright test e2e/pv-s00*.spec.ts --project=android-chrome`

---

## Open Issues

| Priority | Scenario | Issue |
|----------|----------|-------|
| P1 | S001 | Dev cold start >3s — confirm prod build |
| P2 | S001 | Skeleton <200ms prod target unverified |
| P2 | S002 | search-svc offline → catalog-fallback (dev) |
| P3 | S003 | Functional Pass only — no production hardening |
| P3 | S004 | Coupon/shipping deferred to S006 |
| P3 | S004 | Remote BFF cart without local dev unverified |

---

## Performance / UX / A11y / Tech Debt

- **Performance:** Home SSR OK; skeleton + cold start need prod confirmation. Cart badge optimistic <150ms.
- **UX:** Browse→search→PDP→cart journey verified. Cart qty/remove works.
- **A11y:** S001 prod spec + S004 aria-live/qty labels; expand to S002–S003.
- **Tech debt:** Local cart dual-path; S001–S003 not at Production Pass bar; partial git tracking.

---

## Business Impact

**37 min** time saved baseline (18+6+8+5) per successful browse-to-cart session. All 4 scenarios High impact.

---

## Go / No-Go

**Conditional GO** — Continue PV to S005/S006 with this snapshot as baseline.

**No-Go** — Full marketplace production release until checkout/payment (S006+) validated.

---

## Recommendation

1. Archive this snapshot before Merge Checkout.
2. Do not rush S005 until stakeholders review this report.
3. Next: S005 View cart using S004 useShopCart foundation.
4. Before S006: re-run 38 regression tests vs this baseline.

---

## Artifacts

- `pv-3/wave-1-health-report.md` (this file)
- `pv-3/wave-1-health-snapshot.csv`
- `pv-3/wave-1-tracker.csv`
- `pv-3/scenario-rollup.csv`
- `pv-3/s004-hardening/`

*Snapshot: 2026-07-02 · PV-2 Wave 1*

---

## Platform Regression — S001–S007 (2026-07-02)

| Metric | Value |
|--------|-------|
| **Suite** | S001–S007 android-chrome |
| **Result** | **70 / 71 PASS** |
| **Blocking** | **0** |
| **Known flake** | FLAKE-001 (S001 skeleton timing — accepted) |
| **Build** | `9db705ef` |

S007 Place Order marked **Stable**. S001 **frozen** until Production Build Validation.

See: [REGRESSION-DASHBOARD.md](../REGRESSION-DASHBOARD.md) · [KNOWN-ISSUES-REGISTRY.md](../KNOWN-ISSUES-REGISTRY.md)
