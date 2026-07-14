-- Rider earnings ledger + PaySo payouts (Tier 1b #5)

CREATE TABLE IF NOT EXISTS commerce.rider_earnings (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL,
  job_id TEXT,
  order_id TEXT NOT NULL DEFAULT '',
  gross_micro BIGINT NOT NULL DEFAULT 0,
  fee_micro BIGINT NOT NULL DEFAULT 0,
  net_micro BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_rider ON commerce.rider_earnings (rider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.rider_payouts (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL,
  amount_micro BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','paid','rejected')),
  bank_account TEXT NOT NULL DEFAULT '',
  payso_reference_id TEXT,
  payso_transaction_id TEXT,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_rider ON commerce.rider_payouts (rider_id, created_at DESC);
