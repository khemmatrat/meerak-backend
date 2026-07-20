# SRP-W4 — Rollback & Recovery Report

**Wave:** SRP-W4  
**Issue:** SRP-W4-01 (evidence)  
**Date:** 2026-07-20

---

## Gate: **CONDITIONAL GO**

### Git rollback (per issue)

```bash
git revert <commit-sha>   # SRP-W1-01, W1-02, etc.
```

Verified: SRP-W1-01 revert removes OTP routes and libs.

### Deploy rollback

- Render: redeploy previous successful deploy / pin Git SHA.
- Env: `BUILD_GIT_SHA` on `/api/meta` for parity checks.

### Backup / restore

- **PostgreSQL:** provider backups (Render/managed PG) — confirm RPO/RTO in ops runbook.
- **Redis:** ephemeral OTP/rate-limit — acceptable loss on flush; PG is source of truth for users.

### Migrations

- No schema changes in SRP-W1 issues.
- Future migrations: forward-only with tested down scripts where required.

### DR / blue-green

- Not automated in repo; **Canary** = manual Render deploy + smoke `/api/health`, `/api/meta`, login 400 probe.

---

## GO / NO-GO

**CONDITIONAL GO** — procedural rollback clear; DR drills not executed.
