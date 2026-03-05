-- =================================================================================
-- 066: Withdrawal Rules & AqondPay Config
-- =================================================================================
-- Phase 3: Operational Logic
-- Withdrawal: min 10 jobs OR balance > 650 THB
-- Fee: 35 THB standard, 50 THB instant
-- =================================================================================

-- Payout config (withdrawal rules)
CREATE TABLE IF NOT EXISTS payout_config (
  key VARCHAR(50) PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO payout_config (key, value_json, updated_at) VALUES
  ('withdrawal_min_jobs', '10', NOW()),
  ('withdrawal_min_balance_thb', '650', NOW()),
  ('withdrawal_fee_standard_thb', '35', NOW()),
  ('withdrawal_fee_instant_thb', '50', NOW())
ON CONFLICT (key) DO NOTHING;

-- Add instant_payout flag to payout_requests (optional column for Phase 3)
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS instant_payout BOOLEAN DEFAULT FALSE;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS withdrawal_fee NUMERIC(18,2) DEFAULT 35;
COMMENT ON COLUMN payout_requests.instant_payout IS 'true = 50 THB fee, immediate processing';
