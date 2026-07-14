-- Marketplace platform commission (2.2% default) — accrued on hold, released on escrow release
-- Apply with 039+040 on commerce database.

CREATE TABLE IF NOT EXISTS platform_commission_ledger (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  hold_id TEXT NOT NULL REFERENCES escrow_holds (hold_id),
  merchant_id TEXT NOT NULL,
  gross_amount_micro BIGINT NOT NULL CHECK (gross_amount_micro >= 0),
  commission_rate NUMERIC(10, 6) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 1),
  commission_micro BIGINT NOT NULL CHECK (commission_micro >= 0),
  net_amount_micro BIGINT NOT NULL CHECK (net_amount_micro >= 0),
  status TEXT NOT NULL CHECK (status IN ('accrued', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_commission_ledger_hold
  ON platform_commission_ledger (hold_id);

CREATE INDEX IF NOT EXISTS idx_platform_commission_ledger_order
  ON platform_commission_ledger (order_id);

CREATE INDEX IF NOT EXISTS idx_platform_commission_ledger_status
  ON platform_commission_ledger (status);

CREATE INDEX IF NOT EXISTS idx_platform_commission_ledger_created
  ON platform_commission_ledger (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_commission_ledger_released
  ON platform_commission_ledger (released_at DESC)
  WHERE released_at IS NOT NULL;

COMMENT ON TABLE platform_commission_ledger IS 'Admin-only marketplace commission audit — merchant/buyer must not read';
