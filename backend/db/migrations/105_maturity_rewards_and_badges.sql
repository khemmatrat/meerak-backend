-- =================================================================================
-- 105: Maturity Rewards + Mutual Assurance Badges
-- =================================================================================
-- 1. maturity_rewards_vouchers — เก็บ voucher จาก Maturity Rewards (1,000 THB + no claim 90 days = 50 THB)
-- 2. users: maturity_rewards_claimed — จำนวนที่ใช้ไปแล้วสำหรับ voucher (ป้องกันซ้ำ)
-- =================================================================================

-- 1. maturity_rewards_vouchers
CREATE TABLE IF NOT EXISTS maturity_rewards_vouchers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_baht NUMERIC(12,2) NOT NULL DEFAULT 50,
  source_credit NUMERIC(12,2) NOT NULL DEFAULT 1000,
  remaining_baht NUMERIC(12,2) NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_for_job_id TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_maturity_vouchers_user ON maturity_rewards_vouchers(user_id);
CREATE INDEX IF NOT EXISTS idx_maturity_vouchers_created ON maturity_rewards_vouchers(created_at);

COMMENT ON TABLE maturity_rewards_vouchers IS 'Maturity Rewards: 1,000 THB insurance_credit + no claim 90 days = 50 THB discount voucher for service fee';
