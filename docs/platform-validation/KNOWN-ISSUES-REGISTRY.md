# Platform Validation — Known Issues Registry

Official record of accepted flakes, deferred items, and freeze decisions.

---

## FLAKE-001 — S001 skeleton timing (Accepted)

| Field | Value |
|-------|-------|
| **ID** | FLAKE-001 |
| **Scenario** | S001 — Open storefront home |
| **Test** | `step 4: skeleton visible quickly (not black screen)` |
| **Issue** | Skeleton paint exceeds 500ms dev budget during long regression suite |
| **Observed** | up to ~2043ms in S001–S007 combined run |
| **Impact** | **None** |
| **Root cause** | Dev build + accumulated suite execution (cold/warm state) |
| **Production impact** | Not reproduced in isolated production validation |
| **Checkout impact** | None |
| **User impact** | None |
| **Status** | **Accepted** |
| **Criteria met** | Reproducible only in long suite · Not in isolated prod validation · No user/checkout impact |

### Governance

See [GOVERNANCE.md](GOVERNANCE.md) rule **PV-001** for Stable scenarios.

- **S001 frozen** until **Production Build Validation** (do not spend PV time on S001 dev flakes)
- Regression accounting: **70/71 PASS** — FLAKE-001 excluded from blocking signal
- Do **not** modify S001–S007 unless new blocking regression appears

---

## Freeze register

| Scenario | Status | Until |
|----------|--------|-------|
| S001–S005 | Frozen (Browse baseline) | Critical prod regression only |
| S001 | Additional freeze (FLAKE-001) | Production Build Validation |
| S006–S007 | Complete · S007 **Stable** | S008+ only with review |

---

*Maintainers: append new FLAKE-### entries; never delete accepted records.*

