-- =================================================================================
-- 028: Payout Requests — คำขอถอนเงินของ Talent
-- =================================================================================
-- Talent ส่งคำขอถอน → Admin อนุมัติ/ปฏิเสธ → อนุมัติแล้วหัก wallet + บันทึก ledger
-- =================================================================================

CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  bank_details JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_notes TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ,
  processed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user_id ON payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_created_at ON payout_requests(created_at DESC);

COMMENT ON TABLE payout_requests IS 'คำขอถอนเงินจาก Wallet ของ Talent; Admin อนุมัติแล้วหัก wallet + บันทึก payment_ledger_audit';

-- Allow event_type 'user_payout_withdrawal' in payment_ledger_audit (รวม types ที่ใช้ในระบบอยู่แล้ว)
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
        'user_payout_withdrawal'
      ));
  END IF;
END $$;
