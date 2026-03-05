-- =================================================================================
-- 075: Tax, Accounting & Compliance Pillar
-- =================================================================================
-- Smart Tax ID (alias): AQ-[JM/JB/BK]-YYYYMMDD-XXXX for external documents
-- Internal Buffer: hidden field for net profit / tax optimization
-- Certified Statements: PDF requests with fee deduction
-- =================================================================================

-- 1. tax_ref_id: alias for Revenue Dept / external docs (does NOT replace id)
ALTER TABLE payment_ledger_audit ADD COLUMN IF NOT EXISTS tax_ref_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_ledger_tax_ref_id ON payment_ledger_audit(tax_ref_id) WHERE tax_ref_id IS NOT NULL;
COMMENT ON COLUMN payment_ledger_audit.tax_ref_id IS 'AQ-JM/JB/BK-YYYYMMDD-XXXX for tax invoices, alias only';

-- 2. internal_buffer: JSONB for Board/internal net profit (hidden from official exports)
ALTER TABLE payment_ledger_audit ADD COLUMN IF NOT EXISTS internal_buffer JSONB DEFAULT '{}';
COMMENT ON COLUMN payment_ledger_audit.internal_buffer IS 'Internal net profit, tax optimization, Board only';

-- 3. certified_statements: PDF requests (Partner pays fee 25-100 THB)
CREATE TABLE IF NOT EXISTS certified_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  fee_amount NUMERIC(10,2) NOT NULL DEFAULT 50,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'failed')),
  pdf_path TEXT,
  qr_verification_code TEXT UNIQUE,
  ledger_audit_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_certified_statements_user ON certified_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_certified_statements_period ON certified_statements(period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_certified_statements_qr ON certified_statements(qr_verification_code) WHERE qr_verification_code IS NOT NULL;
COMMENT ON TABLE certified_statements IS 'Partner requests certified PDF, fee deducted from wallet';

-- 4. config: statement fee (25-100 THB)
CREATE TABLE IF NOT EXISTS tax_config (
  key VARCHAR(100) PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO tax_config (key, value_json) VALUES
  ('certified_statement_fee_thb', '{"value": 50}'),
  ('vat_rate_percent', '{"value": 7}'),
  ('wht_rate_percent', '{"value": 3}')
ON CONFLICT (key) DO NOTHING;

-- Allow certified_statement_fee in payment_ledger_audit
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
        'coach_training_fee', 'trainee_net_income', 'certified_statement_fee'
      ));
  END IF;
END $$;
