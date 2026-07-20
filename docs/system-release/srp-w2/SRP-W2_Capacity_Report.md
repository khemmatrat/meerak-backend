# SRP-W2 — Capacity Report & Scaling Plan

**Wave:** SRP-W2  
**Issue:** SRP-W2-01 (evidence)  
**Date:** 2026-07-20  
**Git:** post SRP-W1-02

---

## Gate: **NO-GO** for 100k claim

Load ladder **100 → 100,000** was **not** executed to completion on this workstation. **No production capacity claim** is made.

---

## Smoke results (local, single Node process)

**Target:** `GET /api/health`

| Concurrent | OK | Fail | ms |
| ---: | ---: | ---: | ---: |
| 100 | 100 | 0 | ~261 |
| 500 | 345 | 155 | ~594 |
| 1,000 | 488 | 512 | ~776 |
| 5,000 | 3,361 | 1,639 | ~4,927 |

*(Single local Node process — not staging cluster.)*

---

## Bottlenecks (inferred)

| Layer | Risk |
| --- | --- |
| Single Node event loop | CPU + connection accept |
| PostgreSQL pool size | Auth + health detailed |
| Redis | Rate limits + OTP |
| No horizontal pod evidence | Render single service default |

---

## Scaling plan (incremental)

1. **Staging** k6/Locust from separate hosts — ladder 100…10k with SLA gates (p95 &lt; 500ms health).
2. **Render** horizontal scaling + health checks on `/api/health`.
3. **PG** connection pool tuning (`DATABASE_POOL_*` if present).
4. **Redis** required for multi-instance rate limits + OTP.
5. **CDN** for mobile static; API separate.

---

## Optimization (non-rewrite)

- Cache `/api/app/bootstrap` (already cached server-side).
- Keep auth hot paths rate-limited.
- Do not load-test production.

---

## Rollback

N/A (docs-only issue).

## GO / NO-GO

**NO-GO** capacity sign-off — proceed to W3 with staging test plan.
