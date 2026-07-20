# SRP-W3 — Observability Report

**Wave:** SRP-W3  
**Issue:** SRP-W3-01 (evidence)  
**Date:** 2026-07-20

---

## Gate: **CONDITIONAL GO**

| Capability | Status |
| --- | --- |
| HTTP access logs (`morgan`) | Present |
| App logs (`winston`) | Present |
| `/api/health` / `detailed` | Verified (PG/Redis/S3) |
| Sentry | Optional via `SENTRY_DSN` |
| Prometheus `/metrics` | Not verified on master |
| Dashboards / alerts | Ops config — not in repo |
| Auth-specific metrics | Partial (audit logs) |
| Trace IDs | Payment paths; not uniform on auth |

---

## Recommendations (incremental)

1. Enable Sentry in staging/prod with test event.
2. Add Render alerts on 5xx rate and restarts.
3. Dashboard: login failures, OTP 503 rate, rate-limit 429s.
4. Standardize `x-trace-id` on auth routes (future issue).

---

## Rollback

N/A (docs-only).

## GO / NO-GO

**CONDITIONAL GO** — proceed W4.
