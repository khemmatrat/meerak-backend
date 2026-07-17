# AQOND Food Delivery OS — Release Gate (Production Acceptance)

**Version:** 1.0.0  
**Status:** Pending formal sign-off  
**Architecture:** Approved  
**FairPlay OS:** Not implemented (by design)

> **Rule:** Do not declare **Production Ready** in production communications until every gate below is **PASS** with recorded evidence.  
> Known non-blocking debt (dual-write JSON/PG in non-prod, live map, notify templates) may remain open only if explicitly waived by PO + Architect.

---

## Capability baseline (implementation complete)

| Layer | Target | Implementation |
|-------|--------|----------------|
| Happy Path | 100% | ✅ |
| Track OS | 100% | ✅ (live map viz = debt) |
| Claim OS | 100% | ✅ |
| Control Flow | 100% | ✅ |
| Production Backbone | 100% | ✅ (PG dual-write in non-prod = debt) |
| AI Assist | 100% | ✅ (suggestion only) |

---

## Gate checklist

| # | Gate | How to verify | Evidence required | Status |
|---|------|---------------|-------------------|--------|
| **G1** | **Clean environment install** | Fresh VM/container; clone repo; follow [07-DEPLOYMENT-CHECKLIST.md](./07-DEPLOYMENT-CHECKLIST.md) end-to-end without undocumented steps | Install log, env file (redacted), service health URLs | ☐ Pending |
| **G2** | **Migrations apply clean** | `pwsh aqond-v2/infra/scripts/apply-migrations.ps1` from empty DB through `049_event_dlq.sql` | Migration stdout, `\dt commerce.*` listing | ☐ Pending |
| **G3** | **Integration + E2E tests green** | `npm run test:release-gate` in storefront; Playwright smoke optional | CI log or local run artifact | ☐ Pending |
| **G4** | **Feature flag rollback** | Toggle each flag off → confirm legacy path; toggle on → confirm gate restored | Per-flag test notes (see §Feature flags) | ☐ Pending |
| **G5** | **Database backup / restore** | pg_dump → restore to fresh DB → replay smoke query + one happy-path order | Backup file hash, restore log, post-restore test | ☐ Pending |
| **G6** | **Monitoring, logs, alerts (Event Backbone)** | Confirm metrics endpoint, outbox depth, DLQ visibility, alert routing | Dashboard screenshot / alert fire log | ☐ Pending |
| **G7** | **Performance under target load** | Load test per agreed SLO (orders/min, SSE connections, outbox replay lag) | k6/Locust report, p95 latency | ☐ Pending |

---

## G1 — Clean environment install

1. Provision PostgreSQL, MinIO (proof storage), storefront, ai-core, dispatch-svc.
2. Copy `.env.example` → `.env.local`; set secrets (never commit).
3. Apply migrations (G2).
4. Start storefront: `npm run dev` or production `npm run build && npm start`.
5. Verify: `GET /api/admin/food/orders?admin_key=…` → 200.

---

## G2 — Migration sequence (Food OS relevant)

| Migration | Purpose |
|-----------|---------|
| `045_order_packing_proofs.sql` | Packing proof storage |
| `046_pickup_verifications.sql` | QR pickup verification |
| `047_order_lifecycle_events.sql` | Lifecycle event PG store |
| `048_event_outbox.sql` | Transactional outbox |
| `049_event_dlq.sql` | Dead letter queue |

---

## G3 — Automated test bundle

From `aqond-v2/apps/storefront` (storefront on `:3003`):

```bash
npm run test:release-gate
```

Individual tests (for debugging):

```bash
npm run test:packing-proof
npm run test:order-pickup-qr
npm run test:pickup-verification
npm run test:food-delivery-confirm
npm run test:food-happy-path
npm run test:track-os-projection
npm run test:track-os-sse
npm run test:claim-os
npm run test:event-outbox
npm run test:lifecycle-event-types
```

E2E (optional CI gate):

```bash
npm run test:e2e -- e2e/food-happy-path.spec.ts
```

---

## G4 — Feature flag rollback matrix

| Flag | Default (prod intent) | Rollback = `false` / unset | Verify |
|------|---------------------|----------------------------|--------|
| `FOOD_PACKING_GATE` | `true` | Merchant can mark ready without photo | packing-proof test fails gate → manual confirm |
| `FOOD_PICKUP_QR_REQUIRED` | `true` | Rider skips QR scan | pickup-verification test |
| `FOOD_CUSTOMER_CONFIRM` | `true` | Auto-complete without customer CTA | food-delivery-confirm test |
| `FOOD_AUTO_CONFIRM_MINUTES` | `15` | Timer behaviour | confirm test / track UI |
| `FOOD_EVENT_BACKBONE` | `pg` (prod) | JSON dev store only (non-prod) | metrics + replay API |

---

## G5 — Backup / restore

```bash
pg_dump -Fc -h $PGHOST -U $PGUSER -d $PGDATABASE -f aqond-food-$(date +%F).dump
# restore
pg_restore -c -h $PGHOST -U $PGUSER -d $PGDATABASE_RESTORE aqond-food-YYYY-MM-DD.dump
```

Post-restore: run `npm run test:food-happy-path`.

---

## G6 — Event Backbone observability

| Signal | Endpoint / location |
|--------|---------------------|
| Outbox pending depth | `GET /api/admin/events/metrics?admin_key=…` |
| DLQ entries | Same metrics payload → `dlq` |
| Replay worker | Cron `npm run worker:lifecycle-projector` or `POST /api/admin/events/replay` |
| Lifecycle stream | `commerce.order_lifecycle_events` table |
| Alert (recommended) | DLQ count > 0 for 5m; outbox pending > 100; replay failures |

---

## G7 — Performance targets (fill before sign-off)

| Metric | Target (draft) | Measured |
|--------|----------------|----------|
| Happy-path order create → confirm | p95 < 120s (excl. human) | |
| Admin Track BFF | p95 < 500ms | |
| SSE event latency | < 5s after transition | |
| Outbox replay lag | < 30s at steady state | |
| Concurrent active food orders | ___ (PO to set) | |

---

## Accepted technical debt (non-blocking if waived)

| Item | Risk | Waive requires |
|------|------|----------------|
| JSON + PG dual-write in non-production | Dev/prod parity drift | Architect |
| Track OS live map visualization | Admin UX gap only | PO |
| Notify templates incomplete | Push gaps on edge events | PO + Ops |

---

## Sign-off

| Role | Name | Date | G1–G7 |
|------|------|------|-------|
| Product Owner | | | |
| Architect | | | |
| Ops / SRE | | | |

**When all gates PASS:** update status to **Production Ready — Accepted** and proceed to FairPlay OS Architecture Review (planning only).
