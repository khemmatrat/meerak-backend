-- Merchant wallet snapshot + daily fee ledger (replaces storefront .data JSON)

CREATE TABLE IF NOT EXISTS commerce.merchant_wallets (
  merchant_id TEXT PRIMARY KEY,
  available_micro BIGINT NOT NULL DEFAULT 0,
  held_dispute_micro BIGINT NOT NULL DEFAULT 0,
  pending_settlement_micro BIGINT NOT NULL DEFAULT 0,
  total_earned_micro BIGINT NOT NULL DEFAULT 0,
  total_fees_micro BIGINT NOT NULL DEFAULT 0,
  net_earned_micro BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.merchant_fee_ledger (
  merchant_id TEXT NOT NULL,
  fee_date DATE NOT NULL,
  month_index INT NOT NULL DEFAULT 1,
  gross_revenue_micro BIGINT NOT NULL DEFAULT 0,
  service_fee_micro BIGINT NOT NULL DEFAULT 0,
  rent_fee_micro BIGINT NOT NULL DEFAULT 0,
  total_fee_micro BIGINT NOT NULL DEFAULT 0,
  net_revenue_micro BIGINT NOT NULL DEFAULT 0,
  rent_tier TEXT NOT NULL DEFAULT 'none',
  rent_waived BOOLEAN NOT NULL DEFAULT FALSE,
  first_month_free BOOLEAN NOT NULL DEFAULT FALSE,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, fee_date)
);

CREATE INDEX IF NOT EXISTS idx_merchant_fee_ledger_merchant_date
  ON commerce.merchant_fee_ledger (merchant_id, fee_date DESC);
