-- Minimal Rider OS tables for local wallet topup testing (idempotent)
CREATE SCHEMA IF NOT EXISTS commerce;

CREATE TABLE IF NOT EXISTS commerce.dispatch_riders (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT 'motorcycle',
  plate TEXT NOT NULL DEFAULT '',
  rating NUMERIC(3,2) NOT NULL DEFAULT 4.8,
  review_count INT NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'A',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  load_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'approved',
  bank_account TEXT,
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_points INT NOT NULL DEFAULT 0,
  earnings_micro BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_riders_user
  ON commerce.dispatch_riders (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commerce.rider_credit_ledger (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
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

ALTER TABLE commerce.rider_credit_ledger
  DROP CONSTRAINT IF EXISTS rider_credit_ledger_event_type_check;

ALTER TABLE commerce.rider_credit_ledger
  ADD CONSTRAINT rider_credit_ledger_event_type_check
  CHECK (event_type IN (
    'job_earning','platform_fee','withdraw_request','withdraw_paid','withdraw_rejected',
    'admin_credit','admin_debit','bonus','penalty','adjustment',
    'credit_line_open','credit_limit_set','credit_consume','credit_repay','credit_topup'
  ));
