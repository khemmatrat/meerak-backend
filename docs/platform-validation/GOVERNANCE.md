# Platform Validation — Governance

Rules and baseline structure for AQOND Platform Validation (PV).

---

## Baseline map

```
Baseline 001 (frozen)
─────────────────────
Marketplace Browse — S001–S005
Tag: baseline-wave1-2026-07-02

Baseline 002 (active)
─────────────────────
Consumer Checkout — S006–S010
Tag: baseline-wave2-2026-07-02

Current state (2026-07-02)
──────────────────────────
Consumer Checkout VALIDATION COMPLETE
S004, S007–S010 Stable
Await review — no new missions until approved
```

---

## Engineering Rule PV-001 — Stable scenarios

Once **Stable** (see [STABLE-SCENARIOS.md](STABLE-SCENARIOS.md)):

**No feature work, no refactor, no optimization** unless:

1. Security issue  
2. Data corruption  
3. Blocking regression (not accepted flakes)  
4. Approved engineering change  

**Stable:** S004, S007, S008, S009, S010

---

## Regression accounting

| Suite | Result | Dashboard |
|-------|--------|-----------|
| S001–S010 | **79/83 PASS** | [REGRESSION-DASHBOARD.md](REGRESSION-DASHBOARD.md) |

Blocking failures: **0** · FLAKE-001–004 accepted.

---

## Commit taxonomy

| Type | Example |
|------|---------|
| Feature | `pv(s010): Consumer Checkout — payment result validation` |
| Regression | Documented run (79/83) |
| Governance | `docs(pv): seal Consumer Checkout mission` |

---

## Related

- [BASELINE-REGISTRY.md](BASELINE-REGISTRY.md)
- [MISSION-COVERAGE.md](MISSION-COVERAGE.md)
- [KNOWN-ISSUES-REGISTRY.md](KNOWN-ISSUES-REGISTRY.md)
