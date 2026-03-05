-- =================================================================================
-- 029: Wallet Deposit (Omise) + Ledger event_type
-- =================================================================================
-- รองรับ event_type 'wallet_deposit' ใน payment_ledger_audit
-- ตาราง wallet_deposit_charges เก็บ charge_id + user_id สำหรับ idempotency ใน webhook
-- =================================================================================

-- Idempotency: ไม่ credit ซ้ำเมื่อ webhook ถูกเรียกมากกว่า 1 ครั้ง
CREATE TABLE IF NOT EXISTS wallet_deposit_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  charge_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'expired')),
  ledger_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_charges_charge_id ON wallet_deposit_charges(charge_id);
CREATE INDEX IF NOT EXISTS idx_wallet_deposit_charges_user_id ON wallet_deposit_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_deposit_charges_status ON wallet_deposit_charges(status);

COMMENT ON TABLE wallet_deposit_charges IS 'Omise charge สำหรับเติมเงิน; webhook อัปเดต status และ credit wallet ครั้งเดียว (idempotent)';

-- Allow event_type 'wallet_deposit' in payment_ledger_audit
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
        'user_payout_withdrawal', 'wallet_deposit'
      ));
  END IF;
END $$;
