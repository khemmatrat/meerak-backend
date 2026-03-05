-- =================================================================================
-- 040: Region ใน financial_expenses + ตารางอัตราแลกเปลี่ยน
-- =================================================================================
-- Burn rate แยกตามประเทศ, รวมยอดข้ามประเทศด้วย exchange rate
-- =================================================================================

-- เพิ่ม region ใน financial_expenses (TH, ID, VN, MY, LA)
ALTER TABLE financial_expenses
  ADD COLUMN IF NOT EXISTS region VARCHAR(5) DEFAULT 'TH'
  CHECK (region IN ('TH', 'ID', 'VN', 'MY', 'LA'));

-- อัปเดตข้อมูลเดิมให้เป็น TH
UPDATE financial_expenses SET region = 'TH' WHERE region IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_expenses_region ON financial_expenses(region);

-- ตารางอัตราแลกเปลี่ยน (เทียบกับ THB เป็น base) — 1 unit of from_currency = rate THB
CREATE TABLE IF NOT EXISTS exchange_rates (
  from_currency VARCHAR(3) PRIMARY KEY,
  to_currency VARCHAR(3) NOT NULL DEFAULT 'THB',
  rate NUMERIC(18,6) NOT NULL CHECK (rate > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE exchange_rates IS 'อัตราแลกเปลี่ยนสำหรับรวมยอดข้ามประเทศ (1 from_currency = rate THB)';

-- ค่าเริ่มต้น: อัตราโดยประมาณสำหรับเอเชีย (อัปเดตได้จาก Admin)
INSERT INTO exchange_rates (from_currency, to_currency, rate, updated_at)
VALUES
  ('THB', 'THB', 1, NOW()),
  ('IDR', 'THB', 0.0022, NOW()),
  ('VND', 'THB', 0.0014, NOW()),
  ('MYR', 'THB', 7.5, NOW()),
  ('LAK', 'THB', 0.002, NOW())
ON CONFLICT (from_currency) DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW();
