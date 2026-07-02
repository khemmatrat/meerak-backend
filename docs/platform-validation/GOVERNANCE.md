# Platform Validation — Governance

Rules and baseline structure for AQOND Platform Validation (PV).

---

## Baseline map

```
Baseline 001 (frozen)
─────────────────────
Marketplace Browse
S001 – S005
Tag: baseline-wave1-2026-07-02

Baseline 002 (in progress)
──────────────────────────
Consumer Checkout
S006 – S010
Target tag: after S010

Current state (2026-07-02)
──────────────────────────
S007 ✓ Stable (sealed)
Next: S008 Payment Processing
```

---

## Engineering Rule PV-001 — Stable scenarios

Once a scenario is marked **Stable** (see [STABLE-SCENARIOS.md](STABLE-SCENARIOS.md)):

**No feature work, no refactor, no optimization** on that scenario unless:

1. **Security issue**
2. **Data corruption**
3. **Blocking regression** (not accepted flakes — see [KNOWN-ISSUES-REGISTRY.md](KNOWN-ISSUES-REGISTRY.md))
4. **Approved engineering change** (documented in session + tracker)

Rationale: small “just tweak it” changes are the most common source of regressions at scale.

---

## Frozen scenarios (Browse)

**S001–S005** — frozen at Baseline 001. Do not modify unless PV-001 criteria or critical prod regression.

**S001** — additional freeze: [FLAKE-001](KNOWN-ISSUES-REGISTRY.md#flake-001--s001-skeleton-timing-accepted) accepted; no PV time until **Production Build Validation**.

---

## Commit taxonomy

| Type | Example | Purpose |
|------|---------|---------|
| Feature | `pv(s007): Consumer Checkout — place order validation` | Scenario implementation |
| Regression | (CI / documented run) | Result evidence |
| **Governance** | `docs(pv): record FLAKE-001 and regression accounting` | Flakes, stable seal, baselines |

---

## Regression accounting

| Suite | Result | Dashboard |
|-------|--------|-----------|
| S001–S007 | **70/71 PASS** | [REGRESSION-DASHBOARD.md](REGRESSION-DASHBOARD.md) |

Effective blocking failures: **0** (FLAKE-001 accepted).

---

## Related documents

- [BASELINE-REGISTRY.md](BASELINE-REGISTRY.md)
- [STABLE-SCENARIOS.md](STABLE-SCENARIOS.md)
- [KNOWN-ISSUES-REGISTRY.md](KNOWN-ISSUES-REGISTRY.md)
- [REGRESSION-DASHBOARD.md](REGRESSION-DASHBOARD.md)
