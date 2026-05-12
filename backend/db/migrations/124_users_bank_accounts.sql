-- 124: Add bank_accounts to users (ช่องทางรับเงิน — ผู้ใช้ตั้งไว้ใน Settings)
-- สำหรับเก็บบัญชีธนาคาร/TrueMoney ที่ผู้ใช้ใช้รับเงินจาก Platform

ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_accounts JSONB DEFAULT '[]';

COMMENT ON COLUMN users.bank_accounts IS 'รายการช่องทางรับเงิน (ธนาคาร/TrueMoney) — ผู้ใช้ตั้งใน Settings → ช่องทางรับเงิน';
