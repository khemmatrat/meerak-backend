-- =================================================================================
-- 080: Referral Budget Management & Admin Control Tower
-- =================================================================================
-- marketing_budgets: ถังแยกสำหรับเติมเงินใช้จ่ายค่าแนะนำเพื่อน
-- Circuit Breaker: ไม่จ่ายถ้างบไม่พอ
-- Campaign Settings: ปรับ % และ ON/OFF ได้จาก Admin
-- =================================================================================

-- 1. marketing_budgets — ถังงบการตลาดสำหรับ Referral
CREATE TABLE IF NOT EXISTS marketing_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name VARCHAR(100) NOT NULL DEFAULT 'Referral Program',
  total_allocated NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_allocated >= 0),
  total_spent NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_spent >= 0),
  commission_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 1.5 CHECK (commission_rate_pct >= 0 AND commission_rate_pct <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_budgets_active ON marketing_budgets(is_active) WHERE is_active = true;
COMMENT ON TABLE marketing_budgets IS 'งบการตลาดสำหรับจ่ายค่าแนะนำเพื่อน — เติมผ่าน Admin Top-Up';

-- 2. referral_earnings: เพิ่ม budget_id สำหรับ audit
ALTER TABLE referral_earnings ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES marketing_budgets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_referral_earnings_budget ON referral_earnings(budget_id) WHERE budget_id IS NOT NULL;

-- 3. referral_pending_payouts — คิวจ่ายเมื่องบหมด (Circuit Breaker)
CREATE TABLE IF NOT EXISTS referral_pending_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL,
  gross_amount NUMERIC(18,2) NOT NULL CHECK (gross_amount > 0),
  commission_amount NUMERIC(18,2) NOT NULL CHECK (commission_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(job_id, referrer_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_pending_status ON referral_pending_payouts(status) WHERE status = 'pending';
COMMENT ON TABLE referral_pending_payouts IS 'คิวจ่ายเมื่องบหมด — Admin เติมงบแล้ว Process ได้';

-- 4. event_type: referral_budget_exhausted
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_ledger_audit') THEN
    ALTER TABLE payment_ledger_audit DROP CONSTRAINT IF EXISTS payment_ledger_audit_event_type_check;
    ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_event_type_check
      CHECK (event_type IN (
        'payment_created', 'payment_completed', 'payment_failed',
        'payment_expired', 'payment_refunded', 'escrow_held', 'escrow_released', 'escrow_refunded',
        'insurance_liability_credit', 'insurance_withdrawal',
        'booking_refund', 'booking_fee', 'talent_booking_payout',
        'vip_subscription', 'post_job_fee', 'branding_package_payout',
        'user_payout_withdrawal', 'wallet_deposit', 'wallet_tip',
        'coach_training_fee', 'trainee_net_income', 'certified_statement_fee',
        'no_show_refund', 'no_show_fine',
        'referral_bonus', 'referral_budget_exhausted'
      ));
  END IF;
END $$;

-- 5. marketing_budget_topups — บันทึกการเติมงบ (audit trail)
CREATE TABLE IF NOT EXISTS marketing_budget_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES marketing_budgets(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  admin_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_budget_topups_budget ON marketing_budget_topups(budget_id);

-- 6. Seed default campaign ถ้ายังไม่มี
INSERT INTO marketing_budgets (campaign_name, total_allocated, total_spent, commission_rate_pct, is_active)
SELECT 'Referral Program', 0, 0, 1.5, true
WHERE NOT EXISTS (SELECT 1 FROM marketing_budgets LIMIT 1);
