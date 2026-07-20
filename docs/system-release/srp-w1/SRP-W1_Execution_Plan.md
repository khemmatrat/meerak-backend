# SRP-W1 — Execution Plan

**Wave:** SRP-W1 Authentication Completion  
**Date:** 2026-07-20  
**Baseline:** `master` post-PRP (`f4ffb2e3`)

---

## Analysis (pre-code)

| Gap (PR-2) | Incremental fix (no rewrite) |
| --- | --- |
| Phone OTP routes missing on `master` | Restore libs + route registrar from `feature/identity/backend-wip` |
| `/api/meta` lists OTP routes | Satisfied when routes mounted |
| No `/api/auth/refresh` | **Future issue** — assess JWT session model |
| No `/api/auth/logout` | **Future issue** — client JWT + optional denylist |
| Firebase register requires `firebase_uid` | Unchanged — server OTP verify issues verification token |

---

## Issue breakdown

| ID | Scope | Status |
| --- | --- | --- |
| **SRP-W1-01** | Mount `phone-otp/send` + `phone-otp/verify` | **Done** |
| SRP-W1-02 | Auth route manifest + smoke tests in `__tests__` | Planned |
| SRP-W1-03 | Session refresh contract (if exists) or document NO-OP | Planned |
| SRP-W1-04 | Logout / force_logout parity doc + smoke | Planned |

---

## Evidence plan

Each issue → `docs/system-release/srp-w1/` Issue Report + Commit Report + test log.

---

## Rollback wave

Revert commits newest-first for W1 issues.
