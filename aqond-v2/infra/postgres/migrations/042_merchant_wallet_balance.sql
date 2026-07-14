-- Merchant wallet: authoritative available balance + DB-level escrow-credit idempotency.
-- Replaces the previous JSON-file store (.data/dev/merchant-wallets.json + merchant-wallet-escrow-credits.json)
-- which was not concurrency-safe (lost updates) and had no DB idempotency for credits.
-- Apply with 039+040+041 on commerce database.

CREATE TABLE IF NOT EXISTS merchant_wallet_balance (
  merchant_id TEXT PRIMARY KEY,
  available_micro BIGINT NOT NULL DEFAULT 0 CHECK (available_micro >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_wallet_escrow_credits (
  order_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  net_amount_micro BIGINT NOT NULL CHECK (net_amount_micro >= 0),
  credited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_wallet_escrow_credits_merchant
  ON merchant_wallet_escrow_credits (merchant_id);

COMMENT ON TABLE merchant_wallet_balance IS 'Authoritative merchant available balance (accumulated). Derived fields (pending/held/earned) are computed on read.';
COMMENT ON TABLE merchant_wallet_escrow_credits IS 'DB-level idempotency ledger: one row per order credited to merchant available from escrow release.';
