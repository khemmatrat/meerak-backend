# Platform Validation — Changelog

All notable **validation baselines** and milestone snapshots.

Format based on [Keep a Changelog](https://keepachangelog.com/). Tags are immutable; fixes after a baseline get a new tag.

---

## [baseline-wave1-2026-07-02] — 2026-07-02

### Baseline 001 — Marketplace Browse (pre-checkout)

**Tag:** `baseline-wave1-2026-07-02`  
**Snapshot:** `WAVE1-2026-07-02`  
**Code reference:** `29ac144d`

#### Scope

- S001 — Open storefront home
- S002 — Find & decide (search)
- S003 — Product detail
- S004 — Add to cart (Production Pass)

#### Metrics

| Metric | Value |
|--------|-------|
| Average Experience | **9.0** / 10 |
| Production Pass | 1 (S004) |
| Functional Pass | 3 (S001–S003) |
| Regression e2e | **38/38 PASS** (android-chrome) |
| Time Saved (sum) | 37 min / browse-to-cart session |
| Go / No-Go | Conditional GO for PV continuation |

#### Added

- `wave-1-health-report.md` — Wave 1 health snapshot
- `wave-1-health-snapshot.csv` — machine-readable baseline
- `BASELINE-REGISTRY.md` — platform baseline registry
- `pv-write-wave1-health-report.mjs` — snapshot generator

#### Notes

Baseline captured **before Merge Checkout (S005+)**. Use this tag to answer: *"What was marketplace quality before checkout work began?"*

---

## [Unreleased]

- Baseline 002 — Checkout (S005–S010) — planned after Wave 1 checkout PV
