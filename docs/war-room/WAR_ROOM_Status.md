# AQOND War Room — Status

**Updated:** 2026-07-20  
**Git:** `master` (post WAR-P1-01 runbook commit)  
**Auth acceptance:** **NOT COMPLETE** (production deploy pending)  
**Runbook:** [DEPLOY_AND_AUTH_QA_RUNBOOK.md](./DEPLOY_AND_AUTH_QA_RUNBOOK.md) · **W2 Load:** [W2_LOAD_STRESS_RUNBOOK.md](./W2_LOAD_STRESS_RUNBOOK.md)

---

## Critical finding

| URL | `/api/health` | `/api/meta` | `/api/app/bootstrap` | Auth validation |
| --- | ---: | ---: | ---: | --- |
| **Production** `api.aqond.com` | 200 | **404** | **404** | Login/register 400; **phone-otp 404** (SRP-W1 not deployed) |
| **Local** `127.0.0.1:3001` | 200 | 200 | 200 | All P0 routes + JWT 401 checks **PASS** smoke |

Marketing traffic hits **stale production** without IRP bootstrap/meta and without SRP-W1 phone OTP until deploy.

---

## Completed issues

| ID | Commit | Result |
| --- | --- | --- |
| WAR-P0-01 | `7007ff71` | Render `buildCommand: npm ci --prefix backend` |
| WAR-P0-02 | `797bdf5e` | `npm run war-room:auth-smoke` + prod evidence JSON |
| WAR-P1-01 | `eef27dd0` | Deploy & auth QA runbook + OTP 404 smoke gate |
| WAR-W2-01 | (this commit) | k6 load/stress scripts + W2 runbook |

---

## W2 load test

**Blocked** until smoke preflight passes on target URL:

`npm run war-room:w2-preflight -- https://<staging-api>`

Then: `npm run war-room:w2-load -- https://<staging-api>` (requires [k6](https://k6.io) on PATH)

Report template: [`evidence/w2-load-test-report.md`](./evidence/w2-load-test-report.md)

---

## Immediate actions (human / Render — STOP rule: cloud console)

Follow **[DEPLOY_AND_AUTH_QA_RUNBOOK.md](./DEPLOY_AND_AUTH_QA_RUNBOOK.md)** steps 1–2:

1. Manual Deploy `master` on Render.
2. Env: `JWT_SECRET`, `CORS_ORIGIN` (`https://app.aqond.com`, `https://aqond.com`, …), SMS if needed.
3. `cd backend && npm run war-room:auth-smoke -- https://api.aqond.com` → **exit 0**.
4. Step 3: [`evidence/cross-platform-auth-matrix.md`](./evidence/cross-platform-auth-matrix.md).
5. **Restart** local `node backend/server.js` if still on pre-SRP-W1 process.

---

## P0 checklist (post-deploy verification)

| Flow | Local code | Prod verified |
| --- | --- | --- |
| Register | Route + validation | Pending deploy |
| Login | Route + JWT 7d | Pending |
| Phone OTP | Routes mounted (SRP-W1) | Pending |
| Forgot password | Route | Pending |
| JWT protected API | 401 smoke | Pending prod |
| Invalid JWT | 401 smoke | Pending prod |
| Logout API | Client-side only | N/A |
| Refresh token | Not implemented | Re-login |

---

## Next issue (after smoke exit 0)

WAR-P1-02 — CI smoke against `WAR_ROOM_API_BASE` (optional) + matrix sign-off review.

---

## STOP

**Do not declare auth COMPLETE** until production smoke passes. **Do not recommend production** until staging passes full E2E.
