-- Rider OS credit line (ให้ยืมก่อน) — account snapshot + extended ledger events
CREATE TABLE IF NOT EXISTS commerce.rider_credit_accounts (
  rider_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  credit_limit_micro BIGINT NOT NULL DEFAULT 50000 CHECK (credit_limit_micro >= 0),
  credit_used_micro BIGINT NOT NULL DEFAULT 0 CHECK (credit_used_micro >= 0),
  cash_balance_micro BIGINT NOT NULL DEFAULT 0 CHECK (cash_balance_micro >= 0),
  lifetime_earned_micro BIGINT NOT NULL DEFAULT 0,
  completed_jobs INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_credit_used_within_limit CHECK (credit_used_micro <= credit_limit_micro)
);

CREATE INDEX IF NOT EXISTS idx_rider_credit_accounts_user
  ON commerce.rider_credit_accounts (user_id);

COMMENT ON TABLE commerce.rider_credit_accounts IS 'Rider OS credit line snapshot — limit, used (outstanding), cash withdrawable';

-- Extend ledger event types (drop inline check if present)
DO $$
BEGIN
  ALTER TABLE commerce.rider_credit_ledger
    DROP CONSTRAINT IF EXISTS rider_credit_ledger_event_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE commerce.rider_credit_ledger
  DROP CONSTRAINT IF EXISTS rider_credit_ledger_event_type_check;

ALTER TABLE commerce.rider_credit_ledger
  ADD CONSTRAINT rider_credit_ledger_event_type_check
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
    'adjustment',
    'credit_line_open',
    'credit_limit_set',
    'credit_consume',
    'credit_repay',
    'credit_topup'
  ));
