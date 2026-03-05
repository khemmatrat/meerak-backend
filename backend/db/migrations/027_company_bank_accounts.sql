-- =================================================================================
-- 027: สมุดบัญชีธนาคารบริษัท (Company Bank Accounts)
-- =================================================================================
-- ให้แอดมินบันทึกเลขบัญชีบริษัทที่ใช้รับเงิน (Commission, VIP, Post Job ฯลฯ)
-- =================================================================================

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_active ON company_bank_accounts(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE company_bank_accounts IS 'บัญชีธนาคารบริษัทสำหรับรับเงิน (แอดมินจัดการใน Financial Dashboard)';
