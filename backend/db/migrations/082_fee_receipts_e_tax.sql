-- =================================================================================
-- 082: Fee Receipts / E-Tax — ใบเสร็จรับเงินค่าบริการจัดการแพลตฟอร์ม
-- =================================================================================
-- สำหรับค่าธรรมเนียมที่ลูกค้าจ่าย (35/50 ถอน, 2.85%/3.95% เติม)
-- ลูกค้าอาจขอใบกำกับภาษีสำหรับ "ค่าบริการ" ตามกฎหมายไทย
-- =================================================================================

CREATE TABLE IF NOT EXISTS fee_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'withdrawal_fee',
    'deposit_fee_truemoney',
    'deposit_fee_card'
  )),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  related_ledger_id TEXT,
  related_payout_id TEXT,
  related_charge_id TEXT,
  tax_ref_id TEXT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'void')),
  pdf_path TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fee_receipts_user ON fee_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_fee_receipts_issued ON fee_receipts(issued_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_receipts_tax_ref ON fee_receipts(tax_ref_id) WHERE tax_ref_id IS NOT NULL;
COMMENT ON TABLE fee_receipts IS 'ใบเสร็จรับเงิน/ใบกำกับภาษีสำหรับค่าธรรมเนียมที่ลูกค้าจ่าย (ถอน, เติม TrueMoney/Card)';
