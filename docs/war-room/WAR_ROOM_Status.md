# AQOND War Room — Status

**Updated:** 2026-07-20  
**Git:** `797bdf5e`  
**Auth acceptance:** **NOT COMPLETE** (production deploy pending)

---

## Critical finding

| URL | `/api/health` | `/api/meta` | `/api/app/bootstrap` | Auth validation |
| --- | ---: | ---: | ---: | --- |
| **Production** `api.aqond.com` | 200 | **404** | **404** | Login/register return 400 JSON (old stack) |
| **Local** `127.0.0.1:3001` | 200 | 200 | 200 | All P0 routes + JWT 401 checks **PASS** smoke |

Marketing traffic hits **stale production** without IRP bootstrap/meta and without SRP-W1 phone OTP until deploy.

---

## Completed issues

| ID | Commit | Result |
| --- | --- | --- |
| WAR-P0-01 | `7007ff71` | Render `buildCommand: npm ci --prefix backend` |
| WAR-P0-02 | `797bdf5e` | `npm run war-room:auth-smoke` + prod evidence JSON |

---

## Immediate actions (human / Render — STOP rule: cloud console)

1. **Deploy staging/production** from current `master` on Render (Manual Deploy).
2. Set env: `JWT_SECRET`, `CORS_ORIGIN` (include app/web origins), SMS vars if using server OTP.
3. After deploy:  
   `cd backend && npm run war-room:auth-smoke -- https://api.aqond.com`  
   Must show **200** for meta + bootstrap.
4. **Restart** local `node backend/server.js` if still on pre-SRP-W1 process.

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

## Next automated issue (after staging URL passes smoke)

WAR-P1-01 — Document staging E2E checklist (Android/Web) or add CI smoke against `STAGING_API_BASE`.

---

## STOP

**Do not declare auth COMPLETE** until production smoke passes. **Do not recommend production** until staging passes full E2E.
