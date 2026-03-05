-- =================================================================================
-- 017: Insurance Vault — Liability (หนี้สิน), 60/40 Rule, Withdrawal Protection
-- =================================================================================
-- Insurance = Liability (ไม่ใช่ Revenue). Reserve 60% / Manageable 40%.
-- =================================================================================

-- Global insurance rate (e.g. 0.10 = 10%, 0.20 = 20%)
CREATE TABLE IF NOT EXISTS insurance_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

INSERT INTO insurance_settings (key, value, updated_at)
VALUES ('insurance_rate_percent', '10', NOW())
ON CONFLICT (key) DO NOTHING;

-- Insurance fund movements (append-style for audit)
-- liability_credit = เก็บเบี้ยประกันจากลูกค้า (เพิ่มหนี้สิน)
-- liability_debit = จ่ายเคลม (ลดหนี้สิน)
-- withdrawal_investment = ถอนส่วน 40% ไปบริหาร/ลงทุน
CREATE TABLE IF NOT EXISTS insurance_fund_movements (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('liability_credit', 'liability_debit', 'withdrawal_investment')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  job_id TEXT,
  reference_id TEXT,
  note TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_insurance_movements_type ON insurance_fund_movements(type);
CREATE INDEX IF NOT EXISTS idx_insurance_movements_job_id ON insurance_fund_movements(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_movements_created_at ON insurance_fund_movements(created_at);

-- Allow new event types in payment_ledger_audit for insurance leg (เฉพาะเมื่อตารางมีอยู่แล้ว — สร้างจาก migration 006)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_ledger_audit') THEN
    ALTER TABLE payment_ledger_audit DROP CONSTRAINT IF EXISTS payment_ledger_audit_event_type_check;
    ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_event_type_check
      CHECK (event_type IN (
        'payment_created', 'payment_completed', 'payment_failed',
        'payment_expired', 'payment_refunded', 'escrow_held', 'escrow_released', 'escrow_refunded',
        'insurance_liability_credit', 'insurance_withdrawal'
      ));
  END IF;
END $$;

COMMENT ON TABLE insurance_fund_movements IS 'Append-only movements for insurance vault. TIC = sum(liability_credit), TIPO = sum(liability_debit), CIB = TIC - TIPO. Withdrawals = sum(withdrawal_investment).';
