# WAR-P1-01 — Deploy & Auth QA Runbook

**Issue ID:** WAR-P1-01  
**Date:** 2026-07-20  
**PASS / FAIL:** **PASS** (documentation + smoke gate; production deploy still **FAIL**)

---

## Summary

Formal runbook for Render deploy (P0 unblock) and cross-browser auth QA (steps 3–4). Smoke script now fails if phone-OTP routes return 404 (stale deploy detector).

---

## Files changed

| File | Change |
| --- | --- |
| `docs/war-room/DEPLOY_AND_AUTH_QA_RUNBOOK.md` | Team runbook (TH/EN) |
| `docs/war-room/evidence/cross-platform-auth-matrix.md` | QA sign-off template |
| `docs/war-room/evidence/prod-smoke.json` | Pre-deploy prod baseline |
| `docs/war-room/WAR_ROOM_Status.md` | Links + smoke criteria |
| `backend/scripts/war-room-auth-smoke.mjs` | Hard-fail on phone-otp 404 |

---

## Tests executed

```bash
cd backend && npm test
npm run war-room:auth-smoke -- https://api.aqond.com   # exit 1 (expected pre-deploy)
```

---

## Evidence

- Prod smoke: `docs/war-room/evidence/prod-smoke.json` — meta/bootstrap/OTP **404** as of 2026-07-20T05:20Z
- JWT 401 on `/api/videos/my` (no token + invalid JWT): **PASS** on current prod

---

## Rollback

```bash
git revert HEAD
```

---

## Next issue

**Human gate:** Render Manual Deploy (runbook step 1–2).  
After smoke exit **0:** fill `cross-platform-auth-matrix.md` (step 3) → **WAR-P1-02** optional CI `WAR_ROOM_API_BASE` in pipeline.
