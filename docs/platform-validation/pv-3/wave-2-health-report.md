# Wave 2 — Health Report (Consumer Checkout)

**Baseline:** 002 · `baseline-wave2-2026-07-02`  
**Build:** `8a736187`  
**Regression:** 79/83 PASS · 0 blocking

---

## Scenario health

| ID | Title | Grade | Experience | E2E | Stable |
|----|-------|-------|------------|-----|--------|
| S006 | Checkout start | 🟡 | 8.7 | 10/10 | Complete |
| S007 | Place order | 🟡 | 8.8 | 8/8 | ✓ |
| S008 | Payment UI | 🟡 | 8.7 | 16/16 | ✓ |
| S009 | Payment verify | 🟡 | 8.7 | 16/16 | ✓ |
| S010 | Payment result | 🟡 | 8.7 | 16/16* | ✓ |

*S010: 1 telemetry flake in combined suite (FLAKE-004); isolated 8/8.

---

## Browse regression (Baseline 001 comparison)

| Scenario | Status |
|----------|--------|
| S001 | FLAKE-001/002 accepted |
| S002–S003 | PASS |
| S004 | FLAKE-003 telemetry accepted (Stable) |
| S005 | PASS |

**No blocking regressions** introduced by Consumer Checkout.

---

## Known issues

See [KNOWN-ISSUES-REGISTRY.md](../KNOWN-ISSUES-REGISTRY.md) — FLAKE-001 through FLAKE-004.

---

## Artifacts

- [Executive Summary](wave-2-executive-summary.md)
- [Regression Dashboard](../REGRESSION-DASHBOARD.md)
- [Mission Coverage](../MISSION-COVERAGE.md)
