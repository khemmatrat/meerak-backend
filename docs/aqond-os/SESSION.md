# AQOND Marketplace — Session Notes

Last updated: 2026-07-04

## Payment verify — path status (do NOT merge)

| Path | What it does | Test status | Production readiness |
|------|----------------|---------------|----------------------|
| **Local stub** | `localPaymentIntentStore` + PaySo inquire fallback on `lint-*` intents; dev simulate-capture under `app/api/dev/*` | **Verified** — `npm run test:payment-verify-security`, Playwright S008–S010 (24/24), escrow duplicate webhook self-test | Dev / PV only (`allowLocalOrders`) |
| **Production** | Kong → `payment-svc` `/v1/intents/inquire` → PaySo `PAYSO_DEPOSIT_STATUS_PATH` | **Unverified** — never exercised end-to-end with live PaySo sandbox or production credentials | **NOT production-ready** until sandbox E2E passes |

### Rules

- Do **not** mark payment verify or checkout payment flows **Production Ready** until the production path row above is **Verified**.
- Local stub passing tests does **not** imply production path is safe.
- Dev-only simulate-capture lives in `app/api/dev/checkout/payment/simulate-capture/` and is **removed from disk** before `next build` (`scripts/strip-dev-api-routes.mjs`). It is **not** a runtime `if` gate on a production route.

## PaySo sandbox (required before prod path testing)

Dev currently may point at production PaySo host with real merchant credentials. Request a **separate sandbox** base URL, credentials, inquire path, and webhook secret before running production-path E2E.

## Escrow on payment success (item 5)

- Hold-first, then mark PAID (`confirmPaymentCaptureForOrders`) — no PAID-without-hold window.
- Unique partial index on active `escrow_holds(order_id)` + `payment_capture_events` for webhook idempotency.
- Duplicate webhook self-test: `npm run test:payment-escrow-duplicate`.

## Deferred (strict order)

6. ORDER-AUTO-CONFIRM job (after payment + escrow verified on target environment)
7. Escrow migration → Postgres

## ORDER-AUTO-CONFIRM (item 6)

- Job: `runOrderAutoConfirmJob()` — scan delivered orders, release escrow after N days (default 7, env `ORDER_AUTO_CONFIRM_DAYS` 3–7)
- Trigger: `POST /api/return/v1/jobs/run?job=order_auto_confirm` (local dev / allowLocalOrders)
- Idempotency: `order_auto_confirm_releases` table (PK order_id) + `BEGIN IMMEDIATE` release
- Self-test (dev tree, stripped on prod build): `POST /api/dev/orders/v1/auto-confirm/self-test`
- Tests: `npm run test:order-auto-confirm-concurrent`, `npm run test:order-auto-confirm-functional`

## Dev self-test endpoints (all under app/api/dev — stripped before next build)

| Old path (removed) | New path |
|---|---|
| /api/checkout/payment/e2e/simulate-capture | /api/dev/checkout/payment/simulate-capture |
| /api/return/v1/escrow/self-test | /api/dev/return/v1/escrow/self-test |
| /api/checkout/payment/escrow-self-test | /api/dev/checkout/payment/escrow-self-test |
| — | /api/dev/orders/v1/auto-confirm/self-test |
