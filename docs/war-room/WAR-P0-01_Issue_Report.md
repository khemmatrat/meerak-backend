# WAR-P0-01 — Render backend install fix

**Issue ID:** WAR-P0-01  
**PASS/FAIL:** PASS (local verification)

## Scope

Fix Render `buildCommand` so production installs `backend/package.json` dependencies.

## Files

- `render.yaml`

## Tests

- `cd backend && npm test` — 81/81

## Evidence

Production `https://api.aqond.com/api/meta` → **404** (stale deploy + likely missing backend `npm ci` on prior builds).

## Rollback

```bash
git revert HEAD
```

## Next

WAR-P0-02 auth smoke script + staging deploy with current `master`.
