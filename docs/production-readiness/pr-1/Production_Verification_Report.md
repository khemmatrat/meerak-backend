# PR-1 — Production Verification Report

**Program:** Production Readiness (PRP)  
**Phase:** PR-1  
**Date:** 2026-07-20  
**Git:** `master` @ `b725db4a` (includes RSP-7B)  
**Identity Recovery:** Frozen (not in scope)

---

## Gate result: **CONDITIONAL GO** (continue PRP with documented gaps)

| Criterion | Result |
| --- | --- |
| Backend unit tests | **PASS** (75/75) |
| Mobile / admin / landing production builds | **PASS** |
| IRP endpoints live | **PASS** (local `localhost:3001`) |
| Auth routes reachable (validation-level) | **PASS** (400 on empty body = route exists) |
| `/api/meta` vs implemented auth routes | **FAIL** (parity drift — see §4) |
| Runtime vs Git alignment | **UNVERIFIED / risk** (see §5) |

**Rollback (this phase):** `git revert <PR-1-docs-commit>` — documentation only.

---

## 1. Application alignment

| App | Path | Build | Backend tests | Role |
| --- | --- | ---: | --- | --- |
| Backend | `backend/` | `npm run build` (tsc) **PASS** | **75/75** | API @ `node backend/server.js` |
| Mobile | `mobile/` | `vite build` **PASS** | n/a | Capacitor + Vite :3000 |
| Admin | `nexus-admin-core/` | `vite build` **PASS** | 4 fail / 15 pass (vitest, pre-existing) |
| Landing | `landing-aqond/` | `vite build` **PASS** | `tsc --noEmit` **PASS** |

**Deploy entry (Render):** `startCommand: node backend/server.js` — matches repo layout.

**Shared modules (post RSP-7B):** repo-root `shared/` present; mobile `../../shared/*` resolves.

---

## 2. API verification (local backend)

**Probe time:** 2026-07-20, base `http://localhost:3001`

| Endpoint | HTTP | Notes |
| --- | ---: | --- |
| `GET /health` | 200 | Liveness |
| `GET /api/health` | 200 | JSON `status: OK`, DB field present |
| `GET /api/meta` | 200 | IRP-1-01 build meta |
| `GET /api/app/bootstrap` | 200 | IRP-1-02 mobile cold-start config |
| `POST /api/auth/register` | 400 | `Phone, password, and name required` / Firebase UID |
| `POST /api/auth/login` | 400 | `Phone and password required` |
| `POST /api/auth/forgot-password` | 400 | `Phone number required` |

**Mobile dev (Vite :3000):** `Home.tsx`, `Login.tsx`, `ForgotPassword.tsx` modules **200** (no shared import failure).

---

## 3. Login / register (verification only)

**Register (`POST /api/auth/register` on `master`):** Requires `phone`, `password`, `name`, **`firebase_uid`** — Firebase-first registration; not exercised with real credentials in PR-1.

**Login (`POST /api/auth/login`):** Phone + password; rate-limited (`rateLimitLogin`).

**Mobile UI:** Register flow uses Firebase phone OTP client (`mobile/services/phoneAuth.ts`) then backend register — **E2E not automated in PR-1**.

---

## 4. `/api/meta` parity drift

`backend/lib/buildMeta.js` **declares** on `master`:

- `POST /api/auth/phone-otp/send`
- `POST /api/auth/phone-otp/verify`

**`backend/server.js` on `master` does not register these paths** (grep: no `phone-otp`). Identity phone-OTP implementation remains on **`feature/identity/backend-wip`**.

**Production risk:** Load balancers or clients trusting `expectedAuthRoutes` may assume OTP API availability when it is **not** on the release branch.

---

## 5. Runtime anomaly (evidence)

`curl POST /api/auth/phone-otp/send` returned `400` + `Phone number required` (not `404`), while **Git HEAD** has no such route in `server.js`.

**Action (ops, not code):** Confirm which process listens on `:3001` and restart from `b725db4a` if alignment with Git is required. PR-1 does not change runtime.

---

## 6. Evidence

- RSP-7C build/test baseline: `docs/auth-architecture/identity-recovery/rsp-7/RSP7C_Repository_Verification_Report.md`
- Commit under test: `b725db4a`

---

## STOP (PR-1)

PR-1 complete. Proceed to **PR-2** with **Identity Recovery frozen** — full OTP/backend chain may **NO-GO** on `master`.
