-- =================================================================================
-- 079: Referral System — แนะนำเพื่อน 1.5% (ยั่งยืน + บริษัทไม่เข้าเนื้อ)
-- =================================================================================
-- 1.5% จาก Gross Job Value จ่ายจาก Platform Revenue เมื่อบิล Completed
-- ช่วง 7 วันนับจากวันที่เพื่อนรับงานครั้งแรก
-- =================================================================================

-- referral_code บน users (unique, สำหรับสร้างลิงก์ aqond.com/ref/XXX)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;

-- first_job_at บน provider_referrals (เมื่อ referee รับงานครั้งแรกเสร็จ)
ALTER TABLE provider_referrals ADD COLUMN IF NOT EXISTS first_job_at TIMESTAMPTZ;

-- referral_earnings: เก็บ 1.5% ที่จ่ายให้ referrer ต่อแต่ละบิล
CREATE TABLE IF NOT EXISTS referral_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL,
  gross_amount NUMERIC(18,2) NOT NULL CHECK (gross_amount > 0),
  commission_amount NUMERIC(18,2) NOT NULL CHECK (commission_amount >= 0),
  ledger_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, referrer_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON referral_earnings(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referee ON referral_earnings(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_created ON referral_earnings(created_at DESC);

COMMENT ON TABLE referral_earnings IS '1.5% referral commission — paid when referee job completed within 7 days of first job';

-- Allow referral_bonus in payment_ledger_audit
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
        'coach_training_fee', 'trainee_net_income',
        'no_show_refund', 'no_show_fine',
        'referral_bonus'
      ));
  END IF;
END $$;
