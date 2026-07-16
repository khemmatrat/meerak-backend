-- Rider credit topup via PromptPay (PaySo) — separate from main wallet deposit
CREATE TABLE IF NOT EXISTS rider_credit_topup_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  charge_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rider_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  amount_micro BIGINT NOT NULL CHECK (amount_micro > 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'expired')),
  payment_method TEXT NOT NULL DEFAULT 'promptpay',
  ledger_entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rider_credit_topup_charges_user
  ON rider_credit_topup_charges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rider_credit_topup_charges_rider
  ON rider_credit_topup_charges (rider_id, status);

COMMENT ON TABLE rider_credit_topup_charges IS 'PaySo PromptPay charges for Rider OS credit topup — fulfill riderCreditTopup on paid';
