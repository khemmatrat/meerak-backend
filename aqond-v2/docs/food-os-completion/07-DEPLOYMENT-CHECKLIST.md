# Deployment Checklist — AQOND Food Delivery OS v1.0.0

Use this document for **Release Gate G1** (clean environment install).

## 1. Prerequisites

- Node.js 20+
- PostgreSQL 15+ with schema `commerce` created
- MinIO or S3-compatible storage (proof photos)
- Optional: Ollama host for ai-core LLM routes (AI Assist rules work without it)

## 2. Clone and install

```bash
git clone <repo-url> aqond && cd aqond/aqond-v2/apps/storefront
npm install
```

## 3. Environment

Copy `aqond-v2/apps/storefront/.env.example` → `.env.local`:

```env
FOOD_PACKING_GATE=true
FOOD_PICKUP_QR_REQUIRED=true
FOOD_CUSTOMER_CONFIRM=true
FOOD_AUTO_CONFIRM_MINUTES=15
FOOD_EVENT_BACKBONE=pg

AQOND_ADMIN_KEY=<rotate-from-dev-default>
ORDER_PICKUP_QR_SECRET=<random-32+>

PGHOST=...
PGUSER=...
PGPASSWORD=...
PGDATABASE=...
```

## 4. Database migrations

```powershell
pwsh aqond-v2/infra/scripts/apply-migrations.ps1
```

Confirm tables: `commerce.order_lifecycle_events`, `commerce.event_outbox`, `commerce.event_dlq`.

## 5. Start services

| Service | Command | Port |
|---------|---------|------|
| storefront | `npm run build && npm start` | 3003 |
| ai-core | `node server.js` in `infra/ai-core` | 8100 |
| dispatch-svc | per service README | env |

## 6. Workers

Schedule every 30–60s:

```bash
npm run worker:lifecycle-projector
```

Or admin replay: `POST /api/admin/events/replay?admin_key=…`

## 7. Post-deploy smoke

```bash
npm run test:release-gate
```

## 8. Rollback

Disable individual gates via env (see [09-RELEASE-GATE.md](./09-RELEASE-GATE.md) §G4).  
Do **not** set `FOOD_EVENT_BACKBONE=pg` rollback in production without ops approval.
