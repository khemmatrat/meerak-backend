-- =================================================================================
-- 081: Platform Revenue + Ledger Fee Columns (Fee Realization & Reconcile)
-- =================================================================================
-- 1. platform_revenues — เก็บกำไรจากค่าธรรมเนียม (withdrawal fee margin, deposit margin)
-- 2. payment_ledger_audit — คอลัมน์ gateway_fee_amount, platform_margin_amount, net_amount
-- 3. reconcile_alerts — แจ้งเตือนเมื่อ platform_balance กับ Omise ไม่ตรง
-- =================================================================================

-- 1. Platform Revenues (processing income, withdrawal fee margin)
CREATE TABLE IF NOT EXISTS platform_revenues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'withdrawal_fee_margin',
    'deposit_margin_promptpay',
    'deposit_margin_truemoney',
    'deposit_margin_card'
  )),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  gross_amount NUMERIC(18,2),
  gateway_fee_amount NUMERIC(18,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_revenues_created ON platform_revenues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_revenues_source ON platform_revenues(source_type);
COMMENT ON TABLE platform_revenues IS 'กำไรจากค่าธรรมเนียม (withdrawal margin, deposit margin) สำหรับ Admin Revenue Insights';

-- 2. Ledger fee columns (nullable for backward compatibility)
ALTER TABLE payment_ledger_audit ADD COLUMN IF NOT EXISTS gateway_fee_amount NUMERIC(18,2);
ALTER TABLE payment_ledger_audit ADD COLUMN IF NOT EXISTS platform_margin_amount NUMERIC(18,2);
ALTER TABLE payment_ledger_audit ADD COLUMN IF NOT EXISTS net_amount NUMERIC(18,2);
COMMENT ON COLUMN payment_ledger_audit.gateway_fee_amount IS 'ค่าธรรมเนียม Omise ที่หักจากรายการ';
COMMENT ON COLUMN payment_ledger_audit.platform_margin_amount IS 'กำไรส่วนต่างของแพลตฟอร์ม';
COMMENT ON COLUMN payment_ledger_audit.net_amount IS 'ยอดสุทธิที่ได้รับ/โอนจริง';

-- 3. Reconcile Alerts (สำหรับ Background Job ตี 3)
CREATE TABLE IF NOT EXISTS reconcile_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  omise_balance_thb NUMERIC(18,2) NOT NULL,
  platform_balance_thb NUMERIC(18,2) NOT NULL,
  diff_thb NUMERIC(18,2) NOT NULL,
  threshold_thb NUMERIC(18,2) DEFAULT 1,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reconcile_alerts_created ON reconcile_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconcile_alerts_resolved ON reconcile_alerts(resolved) WHERE resolved = FALSE;
COMMENT ON TABLE reconcile_alerts IS 'แจ้งเตือนเมื่อ platform_balance กับ Omise ไม่ตรงเกิน threshold';

-- 5. wallet_deposit_charges: เก็บ source_type สำหรับคำนวณ fee
ALTER TABLE wallet_deposit_charges ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'promptpay';

-- 4. Allow withdrawal_fee_income in ledger (optional, for audit trail)
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
        'withdrawal_fee_income'
      ));
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL; -- constraint might include more types from other migrations
END $$;
