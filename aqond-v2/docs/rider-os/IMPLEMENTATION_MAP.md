# Rider OS — Technical Implementation Map

Maps the **Technical Deep Dive** spec (Dispatch, COD schema, API, COD UI) to code in this repo.
Surface: **storefront `/m/rider/*` only** (no native parity).

## 1. Dispatch Algorithm

| Spec concept | Implementation |
|--------------|----------------|
| Strategy B weighted score | `aqond-v2/services/dispatch-svc/dispatch_score.go` — env `DISPATCH_W_*` (provisional) |
| Candidate filter (idle, KYC, load) | `dispatch_match.go` — `riderEligibleForJob`, `loadActiveRiders` includes `kyc_status`, `suspended` |
| Radius expand 3→5→8 km | `dispatch_match.go` — `dispatchRadiusStepsKm()`, `pickBestRiderWithRadiusExpand()` |
| COD tier cap filter | `dispatch_match.go` — queries `commerce.rider_cod_accounts`, platinum cap **20k THB provisional** |
| Auto-assign + pending_accept | `automatch.go` |
| Sequential offer queue (top 5 × 15s) | `offer_queue.go` — `DISPATCH_OFFER_TIMEOUT_SEC`, `DISPATCH_MAX_OFFERS_PER_ROUND`; `POST /jobs/:id/reject` |
| Timeout rematch (max 5) | `rematch.go` |
| Manual batch (ops) | `ops_tier2.go` — `/v1/dispatch/batches` |
| Legacy nearest | `DISPATCH_SCORE_MODE=nearest` in `tracking.go` |

**Not yet:** Redis geo index, full VRP auto-batch, heading telemetry in score.

Reference pseudo-code from spec → use Go files above as source of truth.

## 2. COD Database

| Spec (greenfield) | This repo (Opus-approved) |
|-------------------|---------------------------|
| `cod_transactions`, `riders.cod_outstanding` | **`ledger_entries`** + `payment_ledger_audit` (migration **267**) |
| `rider_cod_reconciliation_batches` | **`reconciliation_runs` / `reconciliation_lines`** via `runCodReconciliation()` |
| Mutable cap state | **`commerce.rider_cod_accounts`** + **`commerce.rider_cod_holds`** (conditional UPDATE) |

Service: `backend/lib/riderCodLedger.js`  
Cron: `backend/scripts/cod-reconcile-cron.js`

## 3. API (Rider ↔ Backend)

| OpenAPI path | Storefront BFF | Backend |
|--------------|----------------|---------|
| `GET /cod/summary` | `GET /api/rider/cod/summary` | `GET /api/rider-os/cod/summary` |
| `POST /cod/deposit` | `POST /api/rider/cod/deposit` | `POST /api/rider-os/cod/deposit` |
| Collect at delivery | `POST /api/rider/jobs/:id/cod/collected` | same on rider-os |
| Accept + COD hold | `POST /api/rider/jobs/:id/accept` → `proxyRiderCodReserve` | `POST /api/rider-os/jobs/:id/cod/reserve` |
| Go online + doc expiry | `POST /api/rider/status` | doc gate before face in `riderOsRoutes.js` |

Client: `aqond-v2/apps/storefront/lib/riderCod.ts`

## 4. COD UI (Wireframes)

| Screen | Route / component |
|--------|-------------------|
| COD Dashboard | `/m/rider/cod` — `app/m/rider/cod/page.tsx` |
| Collect cash | `RiderCodCollectPanel` on active job |
| Deposit methods | COD page deposit section |
| Nav tab | `RiderOsIcons` — COD tab |
| Styles | `app/m/rider/rider-axs.css` (`.tt-rider-cod-*`) |

## Compliance (Module 6)

| Feature | Location |
|---------|----------|
| Doc expiry lock (before face) | `backend/lib/riderDocGate.js` |
| Uniform check (non-blocking, conf>0.9 flag) | `backend/lib/riderUniformCheck.js` + `riderFaceSession.js` |

All COD monetary values marked **provisional — awaiting business sign-off** in code and commits.
