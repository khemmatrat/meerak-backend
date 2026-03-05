-- =================================================================================
-- 060: Provider Advance Features + Coach-Trainee Connection System
-- =================================================================================
-- 1. Provider: availability switch, residential address, location pin
-- 2. Connection: UID:Key, coach-trainee, dual confirm
-- 3. Referral: แนะนำเพื่อน (ไม่เกี่ยวกับโค้ช)
-- 4. Coach training fee: 3% จากรายได้คงเหลือ (หลัง commission)
-- =================================================================================

-- ── 1. Provider Availability & Location ─────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_available BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_available_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_pinned_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS residential_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS residential_address_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_availability_verified_at TIMESTAMP;
COMMENT ON COLUMN users.provider_available IS 'Provider availability switch: true=open, false=closed';
COMMENT ON COLUMN users.residential_address IS 'Current residence for emergency/legal tracking';

-- ── 2. Connection Key (UID:Key) — แต่ละคนมี key ของตนเอง ───────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS connection_key VARCHAR(32) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_connection_key ON users(connection_key) WHERE connection_key IS NOT NULL;

-- connection_key จะ generate ผ่าน API เมื่อผู้ใช้เข้าแท็บ Connection ครั้งแรก

-- ── 3. Referral (แนะนำเพื่อน — ไม่เกี่ยวกับโค้ช) ────────────────────────────
CREATE TABLE IF NOT EXISTS provider_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code VARCHAR(20) NOT NULL,
  referred_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(referrer_id, referred_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_referrals_referrer ON provider_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_provider_referrals_referred ON provider_referrals(referred_id);
COMMENT ON TABLE provider_referrals IS 'Refer friends signup (not coach system)';

-- ── 4. Coach-Trainee Connection (อาจารย์-ศิษย์) ───────────────────────────────
-- ต้องทั้งสองฝ่ายกดยืนยัน โค้ชกรอก key ของศิษย์ สถานะรอยืนยัน ทั้งคู่กดยืนยัน
CREATE TABLE IF NOT EXISTS coach_trainee_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_category VARCHAR(100),
  coach_confirmed BOOLEAN DEFAULT FALSE,
  trainee_confirmed BOOLEAN DEFAULT FALSE,
  connected_at TIMESTAMP,
  first_job_completed_at TIMESTAMP,
  training_end_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'graduated', 'disqualified', 'ended')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(coach_id, trainee_id)
);
CREATE INDEX IF NOT EXISTS idx_coach_trainee_coach ON coach_trainee_connections(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_trainee_trainee ON coach_trainee_connections(trainee_id);
CREATE INDEX IF NOT EXISTS idx_coach_trainee_status ON coach_trainee_connections(status);
COMMENT ON TABLE coach_trainee_connections IS 'Coach-trainee connection, dual confirm, 3% to coach until graduated or 3 months';

-- ── 5. Coach Training Payouts (หัก 3% จากรายได้คงเหลือ → โค้ช) ──────────────
CREATE TABLE IF NOT EXISTS referral_training_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES coach_trainee_connections(id) ON DELETE CASCADE,
  job_id VARCHAR(100) NOT NULL,
  trainee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gross_after_commission NUMERIC(18,2) NOT NULL,
  training_fee_percent NUMERIC(5,2) DEFAULT 3.00,
  training_fee_amount NUMERIC(18,2) NOT NULL,
  trainee_net NUMERIC(18,2) NOT NULL,
  paid_to_coach_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_payouts_connection ON referral_training_payouts(connection_id);
CREATE INDEX IF NOT EXISTS idx_training_payouts_job ON referral_training_payouts(job_id);
CREATE INDEX IF NOT EXISTS idx_training_payouts_trainee ON referral_training_payouts(trainee_id);
CREATE INDEX IF NOT EXISTS idx_training_payouts_coach ON referral_training_payouts(coach_id);

-- Allow new event types in payment_ledger_audit (include all existing from 042)
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
        'coach_training_fee', 'trainee_net_income'
      ));
  END IF;
END $$;
