-- 165: เลขอ้างอิงธนาคาร/สลิป — กันอนุมัติซ้ำด้วย reference เดียวกัน (strict integrity)

ALTER TABLE manual_deposits ADD COLUMN IF NOT EXISTS bank_ref_id TEXT;

COMMENT ON COLUMN manual_deposits.bank_ref_id IS 'เลขอ้างอิงจากธนาคาร/สลิปที่แอดมินกรอกตอนอนุมัติ — ห้ามซ้ำกับรายการที่ approved แล้ว';

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_deposits_bank_ref_approved_unique
  ON manual_deposits (lower(trim(bank_ref_id)))
  WHERE status = 'approved' AND bank_ref_id IS NOT NULL AND trim(bank_ref_id) <> '';
