# Platform Validation — Baseline Registry

Official quality baselines for AQOND. Each baseline is an immutable **git tag** plus a **health snapshot**.

---

## Registry

| ID | Git tag | Scope | Scenarios | Experience avg | Regression | Status | Reference |
|----|---------|-------|-----------|----------------|------------|--------|-----------|
| **Baseline 001** | `baseline-wave1-2026-07-02` | Marketplace Browse | S001–S005 | **9.0** | 38/38 | **Frozen** | `29ac144d` |
| **Baseline 002** | `baseline-wave2-2026-07-02` | Consumer Checkout | S006–S010 | **8.7** | 79/83† | **Active** | `8a736187` |

† 0 blocking failures · FLAKE-001–004 accepted

| ID | Git tag | Scope | Status |
|----|---------|-------|--------|
| Baseline 003 | *(planned)* | Food Ordering | Not started |
| Baseline 004 | *(planned)* | Merchant | Not started |
| Baseline 005 | *(planned)* | Rider | Not started |
| Baseline 006 | *(planned)* | Talent | Not started |
| Baseline 007 | *(planned)* | Admin | Not started |
| Baseline 008 | *(planned)* | Jarvis | Not started |

---

## Baseline 002 — Consumer Checkout (S006–S010)

| Field | Value |
|-------|-------|
| **Tag** | `baseline-wave2-2026-07-02` |
| **Governance commit** | `docs(pv): seal Consumer Checkout mission` |
| **Mission** | Consumer Checkout complete |
| **Stable** | S007, S008, S009, S010 |
| **Regression** | S001–S010: 79/83 PASS |
| **Dashboard** | [REGRESSION-DASHBOARD.md](REGRESSION-DASHBOARD.md) |
| **Coverage** | [MISSION-COVERAGE.md](MISSION-COVERAGE.md) |

### Reproduce regression at baseline

```bash
git checkout baseline-wave2-2026-07-02
cd aqond-v2/apps/storefront
npx playwright test e2e/pv-s00*.spec.ts --project=android-chrome
```

---

## Baseline 001 — Marketplace Browse (S001–S005)

Frozen at `baseline-wave1-2026-07-02` · commit `29ac144d` · S004 Stable.

---

*Maintainers: append a row when a new baseline tag is created. Never retag or force-push baselines.*
