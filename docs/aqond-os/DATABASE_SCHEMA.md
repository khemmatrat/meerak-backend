# AQOND — Database Schema

**Last Updated:** 2026-06-29

---

## Storage Overview

| Store | Location | Purpose |
|-------|----------|---------|
| PostgreSQL (legacy) | `meera_db` | Primary backend — 260 migrations |
| PostgreSQL (v2) | aqond-v2 infra | Citus-oriented microservices |
| Redis | backend + v2 | Rate limits, sessions, pub/sub |
| S3 | `backend/lib/s3-client.js` | Uploads, media |
| JSON files | `.data/` | Dev catalog, AIVOS merchant-ad jobs |

---

## Merchant Ad (JSON — Dev)

### `.data/aivos/merchant-ad/jobs.json`
| Field | Purpose |
|-------|---------|
| `id` | Job ID (`mad-*`) |
| `merchantId` | Merchant scope |
| `status` | queued / processing / done / failed |
| `progress` | Heartbeat % |
| `shots` | Grok shot metadata |

**Owner:** AIVOS merchant-ad  
**Relationships:** Links to output files under `output/`

### `.data/aivos/merchant-ad/token-wallets.json`
| Field | Purpose |
|-------|---------|
| `merchantId` | Wallet key |
| `balance` | Clip generation tokens |

### `.data/dev/catalog.json` (Storefront)
| Field | Purpose |
|-------|---------|
| `id` | Product ID |
| `merchant_id` | Owner merchant |
| `source` | `merchant-ad` when from ad studio |
| `product_video_url` | PDP video |
| `metadata.product_code` | SKU display |

**Relationships:** `marketplaceSync` → `listings/manifest.json`, `studio/affiliate.json`

---

## PostgreSQL — Domain Groups (Legacy)

### Wallet & Payments
| Table / Migration | Purpose |
|-------------------|---------|
| `payment_ledger_audit` | Financial audit trail |
| `158_hybrid_wallet_deposit` | Wallet deposit flow |
| `195_wallet_deposit_webhook_logs` | PaySo webhook logs |
| `196–198` | Tax identity, fiscal documents |

### Courses
| Migration range | Purpose |
|-----------------|---------|
| `235–246` | Course marketplace phases |
| `259_ai_video_platform` | AI video platform tables |

### Ads
| Migration range | Purpose |
|-----------------|---------|
| `247–256` | Campaign ledger, outbox, outcomes, optimization |

### Identity / KYC
| Migration range | Purpose |
|-----------------|---------|
| `204–205`, `223–225` | KYC submissions, supplements |
| `257_compass_onboarding` | Compass flow |

### AI Runtime
| Migration | Purpose |
|-----------|---------|
| `260_ai_runtime_semantic` | AIVOS semantic runtime |

### Jobs
| Migration range | Purpose |
|-----------------|---------|
| `091–098`, `231–234` | Advance jobs, procurement |

---

## PostgreSQL — v2 (`aqond-v2/infra/postgres/migrations`)

| Migration | Purpose |
|-----------|---------|
| `025_food_svc` | Food service schema |
| `034_merchant_wallet_fees` | Merchant wallet fees |

---

## Indexes & FK Conventions

- Migrations numbered sequentially in `backend/db/migrations/`
- FK naming: `*_id` references parent table
- Audit tables: `*_audit`, `*_ledger_events`

---

## Migration History Command

```bash
ls backend/db/migrations/*.sql | tail -20
ls aqond-v2/infra/postgres/migrations/
```
