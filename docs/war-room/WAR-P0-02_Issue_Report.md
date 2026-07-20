# WAR-P0-02 — Auth smoke harness

**Issue ID:** WAR-P0-02  
**PASS/FAIL:** PASS (local)

## Files

- `backend/scripts/war-room-auth-smoke.mjs`
- `backend/package.json` (`war-room:auth-smoke`)
- `docs/war-room/evidence/prod-smoke.json`

## Tests

- `npm test` — 81/81
- `npm run war-room:auth-smoke` @ `http://127.0.0.1:3001` — exit 0

## Evidence (production)

`https://api.aqond.com` — `/api/health` 200, **`/api/meta` + `/api/app/bootstrap` 404** → deploy required (WAR-P0-01 + latest SHA).

## Rollback

`git revert HEAD`

## Next

**P2 staging deploy** — Render manual deploy from `master` after WAR-P0-01; re-run smoke against staging URL.
