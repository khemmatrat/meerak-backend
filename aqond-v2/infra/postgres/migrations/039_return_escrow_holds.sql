-- B2.7 Return Core — escrow holds (production PostgreSQL mirror of storefront SQLite dev store)
-- Atomic hold per order enforced via partial unique index on active holds.

CREATE TABLE IF NOT EXISTS escrow_holds (
  hold_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount_micro BIGINT NOT NULL CHECK (amount_micro >= 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('held', 'released', 'refunded')),
  to_merchant_id TEXT,
  to_buyer_id TEXT,
  refund_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_active_order
  ON escrow_holds (order_id)
  WHERE status = 'held';

CREATE INDEX IF NOT EXISTS idx_escrow_holds_order ON escrow_holds (order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_holds_status ON escrow_holds (status);

CREATE TABLE IF NOT EXISTS escrow_reconciliation_runs (
  run_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  held_count INTEGER NOT NULL,
  matched_count INTEGER NOT NULL,
  orphan_holds INTEGER NOT NULL,
  missing_holds INTEGER NOT NULL,
  amount_mismatches INTEGER NOT NULL,
  report_json JSONB NOT NULL
);
