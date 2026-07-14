-- B2.7 Return Core — escrow idempotency + auto-confirm audit (PostgreSQL mirror of storefront SQLite)
-- Apply after 039 on the commerce database:
--   psql -h HOST -U USER -d commerce -f 040_return_escrow_idempotency.sql

CREATE TABLE IF NOT EXISTS payment_capture_events (
  event_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  hold_id TEXT NOT NULL REFERENCES escrow_holds (hold_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_capture_events_order
  ON payment_capture_events (order_id);

CREATE TABLE IF NOT EXISTS order_auto_confirm_releases (
  order_id TEXT PRIMARY KEY,
  hold_id TEXT NOT NULL REFERENCES escrow_holds (hold_id),
  merchant_id TEXT,
  amount_micro BIGINT NOT NULL CHECK (amount_micro >= 0),
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_run_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_auto_confirm_releases_hold
  ON order_auto_confirm_releases (hold_id);

-- Cutover audit — records when backend switched to postgres (rollback gate input)
CREATE TABLE IF NOT EXISTS escrow_cutover_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('cutover_start', 'cutover_complete', 'rollback')),
  cutover_at TIMESTAMPTZ NOT NULL,
  backend TEXT NOT NULL CHECK (backend IN ('sqlite', 'postgres')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payment_capture_events IS 'Webhook/verify idempotency — one event_key per payment capture';
COMMENT ON TABLE order_auto_confirm_releases IS 'ORDER-AUTO-CONFIRM audit — one release per order_id';
COMMENT ON TABLE escrow_cutover_events IS 'Escrow cutover timeline for automated rollback safety checks';
