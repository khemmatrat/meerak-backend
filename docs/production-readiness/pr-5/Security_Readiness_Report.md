# PR-5 — Security Readiness Report

**Program:** PRP  
**Phase:** PR-5  
**Date:** 2026-07-20  
**Scope:** Configuration validation on `master` — no hardening changes

---

## Gate result: **CONDITIONAL GO**

---

## HTTPS

| Layer | Status |
| --- | --- |
| Render / production TLS | **Expected** (platform) — not tested from PR-5 workstation |
| Local dev | HTTP — acceptable for dev only |

---

## CORS

| Item | Detail |
| --- | --- |
| Middleware | `cors()` with dynamic `resolveCorsAllowOrigin` |
| Config | `CORS_ORIGIN` env (comma-separated); defaults include `localhost:3000`, `5173` |
| Credentials | `true` |
| Block behavior | Error callback → blocked origin |

**Verify in prod:** `CORS_ORIGIN` includes mobile/web/admin origins only.

---

## JWT

| Item | Detail |
| --- | --- |
| Secret | `JWT_SECRET` (Render dashboard per `render.yaml` comment) |
| Usage | `jwt.verify` in auth middleware paths |
| Refresh tokens | **No dedicated refresh flow** (see PR-2) |

---

## Rate limiting

| Route / area | Control |
| --- | --- |
| `POST /api/auth/login` | `rateLimitLogin` (Redis-backed where configured) |
| `POST /api/auth/register` | `authLimiter` |
| Payments | `paymentLimiter` |
| In-memory fallback | `rateLimitMemory` map (documented in server) |

**Verify in prod:** Redis available for distributed rate limits.

---

## Security headers

| Item | Detail |
| --- | --- |
| `helmet()` | Enabled |
| CSP | **Disabled** (`contentSecurityPolicy: false`) — intentional for CORS/embed |
| CORP | `cross-origin` |

---

## Other

| Control | Status |
| --- | --- |
| Blocked IP table check | Early middleware |
| Admin TOTP | Separate admin-login/totp routes |
| Secrets in repo | `.env` gitignored — **do not commit** |

---

## Rollback

`git revert <PR-5-docs-commit>`

---

## STOP (PR-5)

**CONDITIONAL GO** — controls present; **prod env verification** (HTTPS, CORS list, Redis rate limits, Sentry) required at deploy time.
