-- Rider OS credit ledger — append-only audit trail for all rider wallet movements
CREATE TABLE IF NOT EXISTS commerce.rider_credit_ledger (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'job_earning',
      'platform_fee',
      'withdraw_request',
      'withdraw_paid',
      'withdraw_rejected',
      'admin_credit',
      'admin_debit',
      'bonus',
      'penalty',
      'adjustment'
    )),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_micro BIGINT NOT NULL CHECK (amount_micro > 0),
  balance_after_micro BIGINT,
  job_id TEXT,
  order_id TEXT,
  payout_id TEXT,
  idempotency_key TEXT,
  reason TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rider_credit_ledger_idem
  ON commerce.rider_credit_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_rider_credit_ledger_rider
  ON commerce.rider_credit_ledger (rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rider_credit_ledger_user
  ON commerce.rider_credit_ledger (user_id, created_at DESC);

COMMENT ON TABLE commerce.rider_credit_ledger IS 'Append-only Rider OS credit ledger — job earnings, withdrawals, admin adjustments';
