-- =============================================================================
-- 188: payment_wallet_claims — UNIQUE(payment_id) for wallet apply (Payment Core)
-- =============================================================================
-- Separate from legacy `wallet_transactions` (different product surface).
-- Blocks double-apply if another code path credits without the topup handler.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_wallet_claims (
  id               BIGSERIAL PRIMARY KEY,
  payment_id       TEXT NOT NULL,
  user_id          TEXT,
  currency         VARCHAR(3) NOT NULL DEFAULT 'THB',
  ledger_entry_id  BIGINT REFERENCES ledger_entries (id),
  source           VARCHAR(80) NOT NULL DEFAULT 'wallet_topup_handler',
  trace_id         TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_payment_wallet_claims_payment_id UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_wallet_claims_user_created
  ON payment_wallet_claims (user_id, created_at DESC);

COMMENT ON TABLE payment_wallet_claims IS
  'Payment Core: at most one wallet apply per payment_id; pairs with ledger WALLET_CREDIT row.';
