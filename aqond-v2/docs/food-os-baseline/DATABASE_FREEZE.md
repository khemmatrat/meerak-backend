# DATABASE_FREEZE — Food Delivery OS v1.0.0

**Schema policy:** Additive migrations only post-baseline.  
**Schema:** `commerce`

---

## Food OS tables (migrations 045–049)

### `commerce.order_packing_proofs` (045)

| Column | Type | Constraints |
|--------|------|-------------|
| order_id | TEXT | PK, FK → orders(id) CASCADE |
| merchant_id | TEXT | NOT NULL |
| photo_url | TEXT | NOT NULL |
| storage | TEXT | NOT NULL DEFAULT 'local', CHECK local/minio |
| uploaded_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| uploaded_by | TEXT | |
| metadata | JSONB | NOT NULL DEFAULT '{}' |

**Index:** `idx_order_packing_proofs_merchant (merchant_id, uploaded_at DESC)`

---

### `commerce.pickup_verifications` (046)

| Column | Type |
|--------|------|
| order_id | TEXT PK, FK orders |
| merchant_id | TEXT NOT NULL |
| rider_id | TEXT |
| qr_verified_at | TIMESTAMPTZ |
| pickup_photo_url | TEXT |
| pickup_photo_at | TIMESTAMPTZ |
| pickup_completed_at | TIMESTAMPTZ |
| verification_method | TEXT DEFAULT 'qr_scan' |
| verification_result | TEXT |
| qr_signature | TEXT |
| photo_hash | TEXT |
| device_id | TEXT |
| gps_lat, gps_lng, accuracy | DOUBLE PRECISION |
| metadata | JSONB DEFAULT '{}' |
| created_at, updated_at | TIMESTAMPTZ |

**Index:** `idx_pickup_verifications_merchant (merchant_id, pickup_completed_at DESC)`

---

### `commerce.pickup_qr_nonces` (046)

| Column | Type |
|--------|------|
| nonce_key | TEXT PK |
| order_id | TEXT NOT NULL |
| consumed_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() |

---

### `commerce.order_lifecycle_events` (047)

| Column | Type |
|--------|------|
| id | TEXT PK |
| order_id | TEXT NOT NULL |
| event_type | TEXT NOT NULL |
| source | TEXT NOT NULL |
| actor | TEXT |
| phase | TEXT |
| job_id | TEXT |
| merchant_id | TEXT |
| rider_id | TEXT |
| payload | JSONB DEFAULT '{}' |
| at | TIMESTAMPTZ NOT NULL DEFAULT NOW() |

**Index:** `idx_order_lifecycle_events_order (order_id, at DESC)`

---

### `commerce.event_outbox` (048)

| Column | Type |
|--------|------|
| id | TEXT PK |
| idempotency_key | TEXT NOT NULL UNIQUE |
| order_id | TEXT NOT NULL |
| event_type | TEXT NOT NULL |
| payload | JSONB NOT NULL DEFAULT '{}' |
| status | TEXT NOT NULL DEFAULT 'pending' |
| attempts | INT NOT NULL DEFAULT 0 |
| last_error | TEXT |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() |
| processed_at | TIMESTAMPTZ |

**Index:** `idx_event_outbox_pending (status, created_at) WHERE status = 'pending'`

---

### `commerce.event_dlq` (049)

| Column | Type |
|--------|------|
| id | TEXT PK |
| outbox_id | TEXT NOT NULL |
| order_id | TEXT NOT NULL |
| event_type | TEXT NOT NULL |
| payload | JSONB NOT NULL DEFAULT '{}' |
| last_error | TEXT |
| attempts | INT NOT NULL DEFAULT 0 |
| failed_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() |

**Index:** `idx_event_dlq_order (order_id, failed_at DESC)`

---

## Dev JSON stores (non-production)

| File | Content |
|------|---------|
| `.data/dev/aqond-order-events.json` | Lifecycle events |
| `.data/dev/event-outbox.json` | Outbox entries |
| `.data/dev/event-dlq.json` | DLQ entries |

Not used when `FOOD_EVENT_BACKBONE=pg` and `NODE_ENV=production`.

---

## Migration history (Food OS additive)

```
045_order_packing_proofs.sql      — S1
046_pickup_verifications.sql      — S3
047_order_lifecycle_events.sql    — S16
048_event_outbox.sql              — S16
049_event_dlq.sql                 — S16
```

Full platform migrations 001–049 exist; Food OS baseline depends on `commerce.orders` from earlier migrations (005/008/025).

---

## Post-freeze rules

| Allowed | Forbidden |
|---------|-----------|
| `050_add_column_nullable.sql` | DROP COLUMN |
| New index CONCURRENTLY | Rename column without view |
| New table in new schema | Change FK cascade semantics |
| Add CHECK constraint (loosening) | Tighten CHECK breaking rows |
