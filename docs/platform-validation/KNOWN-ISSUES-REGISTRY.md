# Platform Validation — Known Issues Registry

Official record of accepted flakes, deferred items, and freeze decisions.

---

## FLAKE-001 — S001 skeleton timing (Accepted)

| Field | Value |
|-------|-------|
| **ID** | FLAKE-001 |
| **Scenario** | S001 |
| **Test** | skeleton visible quickly |
| **Observed** | 758ms (S001–S010 suite, build `8a736187`) |
| **Impact** | None |
| **Status** | **Accepted** |

---

## FLAKE-002 — S001 home load timing (Accepted)

| Field | Value |
|-------|-------|
| **ID** | FLAKE-002 |
| **Scenario** | S001 |
| **Test** | load, products, no console errors |
| **Observed** | 8139ms (S001–S010 suite) |
| **Impact** | None |
| **Status** | **Accepted** |

---

## FLAKE-003 — S004 cart-add telemetry (Accepted)

| Field | Value |
|-------|-------|
| **ID** | FLAKE-003 |
| **Scenario** | S004 (Stable) |
| **Test** | telemetry posted for cart add |
| **Issue** | PDP buy-sheet timeout in long combined suite |
| **Impact** | None — S004 functional steps pass |
| **Status** | **Accepted** — do not modify S004 per PV-001 |

---

## FLAKE-004 — S010 result telemetry (Accepted)

| Field | Value |
|-------|-------|
| **ID** | FLAKE-004 |
| **Scenario** | S010 |
| **Test** | telemetry posted for payment result |
| **Issue** | Payment confirm slow after 22min suite; isolated 8/8 pass |
| **Impact** | None — S010 functional steps pass |
| **Status** | **Accepted** |

---

## Freeze register

| Scope | Status |
|-------|--------|
| S001–S005 | Frozen (B001) |
| S001 | FLAKE-001/002 until prod build validation |
| S006–S010 | Stable / Complete (B002) |
| S004, S007–S010 | **Stable** — PV-001 |

Regression accounting: **79/83 PASS** · **0 blocking**

---

*Maintainers: append FLAKE-### entries; never delete accepted records.*
