# Platform Validation — Baseline Registry

Official quality baselines for AQOND. Each baseline is an immutable **git tag** plus a **health snapshot** so regressions can be compared to a known-good state.

**How to use**

```bash
# Compare current branch to a baseline
git diff baseline-wave1-2026-07-02 -- aqond-v2/apps/storefront

# Re-run Wave 1 regression at a baseline
git checkout baseline-wave1-2026-07-02
cd aqond-v2/apps/storefront && npx playwright test e2e/pv-s00*.spec.ts --project=android-chrome
```

---

## Registry

| ID | Git tag | Scope | Scenarios | Experience avg | Regression | Status | Reference commit |
|----|---------|-------|-----------|----------------|------------|--------|------------------|
| **Baseline 001** | `baseline-wave1-2026-07-02` | Marketplace Browse | S001–S004 | **9.0** / 10 | 38/38 PASS | **Active** | `29ac144d` |

| ID | Git tag | Scope | Scenarios | Status |
|----|---------|-------|-----------|--------|
| Baseline 002 | *(planned)* | Checkout | S005–S010 | Not started |
| Baseline 003 | *(planned)* | Food Ordering | S016+ | Not started |
| Baseline 004 | *(planned)* | Merchant Daily Operations | — | Not started |
| Baseline 005 | *(planned)* | Rider Daily Operations | — | Not started |
| Baseline 006 | *(planned)* | Talent Booking | — | Not started |
| Baseline 007 | *(planned)* | Admin Operations | — | Not started |
| Baseline 008 | *(planned)* | Jarvis Concierge | — | Not started |
| Baseline 009 | *(planned)* | Hermes Worker | — | Not started |
| Baseline 010 | *(planned)* | AGK Production | — | Not started |

---

## Baseline 001 — Marketplace Browse (S001–S004)

| Field | Value |
|-------|-------|
| **Tag** | `baseline-wave1-2026-07-02` |
| **Snapshot ID** | `WAVE1-2026-07-02` |
| **Mission** | M-001 Marketplace |
| **Date** | 2026-07-02 |
| **Code reference** | `29ac144d` — S004 production hardening |
| **Go / No-Go** | Conditional GO → continue PV; No-Go full prod until checkout |

### Scenarios

| Scenario | Grade | Experience | Time saved |
|----------|-------|------------|------------|
| S001 Home | 🟡 Functional Pass | 9.1 | 18 min |
| S002 Search | 🟡 Functional Pass | 8.7 | 6 min |
| S003 Product | 🟡 Functional Pass | 8.8 | 8 min |
| S004 Add to cart | 🟢 Production Pass | 9.3 | 5 min |

### Artifacts

- [wave-1-health-report.md](pv-3/wave-1-health-report.md)
- [wave-1-health-snapshot.csv](pv-3/wave-1-health-snapshot.csv)
- [wave-1-tracker.csv](pv-3/wave-1-tracker.csv)
- [scenario-rollup.csv](pv-3/scenario-rollup.csv)
- [s004-hardening/](pv-3/s004-hardening/)

### Open issues at baseline (summary)

- S001: prod cold-start / skeleton timing unconfirmed
- S002: search-svc catalog-fallback in dev
- S003: not production-hardened
- S004: coupon/shipping deferred to S006; remote BFF cart unverified off local dev

---

*Maintainers: append a row when a new baseline tag is created. Never retag or force-push baselines.*
