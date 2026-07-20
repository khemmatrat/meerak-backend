# PR-3 — Capacity Report

**Program:** PRP  
**Phase:** PR-3  
**Date:** 2026-07-20  
**Environment:** Local dev — single Node process `localhost:3001` (not production cluster)

---

## Gate result: **NO-GO** (production scale)

Target matrix **100 → 100,000 concurrent users** was **not executed** on this host (would require staging load generators, isolated infra, and approval).

Smoke concurrency tests below are **evidence only**, not a production capacity sign-off.

---

## Smoke load — `GET /api/health`

**Tool:** Node.js `http.get` parallel (same machine as API).

| Concurrent requests | HTTP 200 | Fail | Wall time (ms) |
| ---: | ---: | ---: | ---: |
| 100 | 100 | 0 | 261 |
| 500 | 345 | 155 | 594 |
| 1,000 | 488 | 512 | 829 |
| 2,000 | 529 | 1,471 | 918 |

**Interpretation:** Single-instance local backend **saturates below 500** parallel health checks. Production must use horizontal scaling, connection pooling tuning, and dedicated load testing (k6/Locust/Gatling) in **staging**.

---

## Dependency health (snapshot)

`GET /api/health/detailed` @ probe time:

| Service | Status |
| --- | --- |
| PostgreSQL | healthy |
| Redis | healthy |
| S3 | healthy |

**Memory (process):** heapUsed ~87 MB, RSS ~137 MB (single worker snapshot).

---

## Not measured (requires staging)

| Metric | Reason |
| --- | --- |
| API latency percentiles under load | No APM trace in PR-3 |
| OTP queue / SMS queue | Backend phone-OTP not on `master`; queues on identity branch |
| CPU/RAM at 10k–100k users | Not run — **NO-GO** |
| PostgreSQL connection exhaustion | Not instrumented in smoke test |

---

## Rollback

`git revert <PR-3-docs-commit>`

---

## STOP (PR-3)

**NO-GO** for declaring 100k-user capacity. Re-run in approved staging before production GO.
