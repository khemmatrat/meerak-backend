# SRP-W1-01 — Issue Report

**ID:** SRP-W1-01  
**Title:** Mount server-side phone OTP API on release branch

---

## Scope

Restore identity-isolated OTP libraries and register HTTP routes without rewriting login/register.

## Files

| File | Action |
| --- | --- |
| `backend/lib/phoneOtpAuth.js` | Add (from `feature/identity/backend-wip`) |
| `backend/lib/smsOtpDelivery.js` | Add |
| `backend/lib/authPhoneOtpRoutes.js` | Add (registrar) |
| `backend/server.js` | Wire registrar + `RATE_LIMIT_OTP_REQUEST_IP` |
| `backend/__tests__/phoneOtpAuth.test.js` | Add unit tests |
| `backend/package.json` | Include test in `npm test` |

## Dependency

- Existing: `authLimiter`, `checkRateLimit`, `normalizePhoneForStorage`, `JWT_SECRET`, Redis optional
- SMS: env provider (503 if not configured — failure path)

## Risk

- SMS cost/abuse — mitigated by existing rate limits + IP cap
- Duplicate with Firebase client OTP — complementary paths (server SMS for non-Firebase flows)

## Rollback

```bash
git revert <commit-sha>
```

## Acceptance criteria

- [x] `POST /api/auth/phone-otp/send` returns 400 without phone on running server
- [x] `POST /api/auth/phone-otp/verify` returns 400 without phone
- [x] Routes exist in Git `server.js` wiring (registrar)
- [x] Backend tests 78/78 pass
- [x] Mobile `vite build` pass

## Test plan

- `cd backend && npm test`
- `cd backend && npm run build`
- `cd mobile && npm run build`
- curl empty body → 400

## Expected output

- OTP send/verify handlers registered; `/api/meta` parity with runtime

---

## Test results

| Suite | Result |
| --- | --- |
| Backend `npm test` | **78 pass / 0 fail** |
| Backend `npm run build` | **PASS** |
| Mobile `npm run build` | **PASS** |

## Rollback verification

Revert commit removes libs + registrar + tests; `master` returns to pre-W1-01 OTP surface.

## Production impact

Enables server SMS OTP path when SMS env configured; no change to existing login/register contracts.

## GO / NO-GO (issue)

**GO** for SRP-W1-01 scope.
