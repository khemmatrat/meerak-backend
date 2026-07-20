# WAR-W2-01 — Load / stress runbook + k6 scripts

**Issue ID:** WAR-W2-01  
**PASS / FAIL:** **PASS** (tooling + docs; **no load executed** — prod/staging still fails preflight)

---

## Files changed

| Path | Purpose |
| --- | --- |
| `docs/war-room/W2_LOAD_STRESS_RUNBOOK.md` | Team runbook |
| `docs/war-room/evidence/w2-load-test-report.md` | Report template |
| `docs/war-room/evidence/.gitignore` | Ignore raw k6 JSON exports |
| `backend/scripts/k6/war-room-w2-load.js` | Smoke + ramp load |
| `backend/scripts/k6/war-room-w2-ladder.js` | 100/500/1000 ladder |
| `backend/scripts/k6/war-room-w2-stress.js` | Breaking-point ramp |
| `backend/scripts/war-room-w2-preflight.mjs` | Smoke gate before k6 |
| `backend/scripts/war-room-k6.mjs` | preflight + k6 wrapper |
| `backend/package.json` | npm scripts |

---

## Tests executed

```bash
cd backend && npm test   # 81/81
npm run war-room:w2-preflight -- https://api.aqond.com   # expected FAIL until deploy
```

---

## Evidence

Preflight blocks k6 until meta/bootstrap 200 — aligns with W2 gate.

---

## Rollback

```bash
git revert HEAD
```

---

## Next issue

After staging deploy + preflight OK: run ladder 100→500→1000, fill `w2-load-test-report.md` → **W3** monitoring thresholds.
