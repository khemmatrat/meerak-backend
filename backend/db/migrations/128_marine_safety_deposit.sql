-- 128: Marine Safety Deposit & Cancellation Policy
-- Mandatory 30-50% deposit for Charter & Activity
-- Escrow: release to Captain only after Check-in + Trip Completed

-- Jobs: marine deposit columns
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS safety_deposit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS safety_deposit_status VARCHAR(30) DEFAULT 'none';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS safety_deposit_percent INT DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_refund_percent INT;

COMMENT ON COLUMN jobs.safety_deposit_amount IS 'มัดจำความปลอดภัย (บาท) — 30-50% สำหรับเหมาลำ/กิจกรรม';
COMMENT ON COLUMN jobs.safety_deposit_status IS 'none|pending|held|released|refunded|compensated';
COMMENT ON COLUMN jobs.cancellation_refund_percent IS 'เปอร์เซ็นต์ที่คืนเมื่อยกเลิก (90/50/0)';

-- Ledger event types for marine
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
        'referral_bonus', 'referral_budget_exhausted',
        'withdrawal_fee_income',
        'admin_credit', 'admin_debit',
        'insurance_replacement_payout', 'platform_stability_reserve', 'reroute_replacement_payout',
        'marine_deposit_held', 'marine_deposit_released', 'marine_deposit_refund', 'marine_compensation_captain'
      ));
  END IF;
END $$;
