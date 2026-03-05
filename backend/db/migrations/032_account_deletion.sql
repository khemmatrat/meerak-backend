-- Migration 032: Account Deletion System (App Store Compliance)
-- สร้างระบบลบบัญชีตาม GDPR และข้อกำหนด App Store/Play Store

-- 1. ตาราง account_deletion_requests เก็บคำขอลบบัญชี
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES users(id),
  admin_notes TEXT,
  data_retention_period_days INT DEFAULT 30, -- เก็บข้อมูลไว้ 30 วันก่อนลบจริง
  scheduled_deletion_date TIMESTAMPTZ,
  ip_address VARCHAR(100),
  user_agent TEXT
);

-- Index สำหรับ Query ที่ใช้บ่อย
CREATE INDEX IF NOT EXISTS idx_account_deletion_user_id ON account_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletion_status ON account_deletion_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_deletion_scheduled ON account_deletion_requests(scheduled_deletion_date) WHERE status = 'approved';

-- 2. เพิ่มคอลัมน์ใน users table สำหรับ Soft Delete
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'pending_deletion', 'deleted'));

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. Function สำหรับ Anonymize User Data (GDPR Compliance)
CREATE OR REPLACE FUNCTION anonymize_user_data(target_user_id UUID) RETURNS VOID AS $$
BEGIN
  -- Anonymize PII (Personal Identifiable Information)
  UPDATE users SET
    email = CONCAT('deleted_', target_user_id, '@akonda.deleted'),
    phone = NULL,
    phone_number = NULL,
    full_name = 'Deleted User',
    profile_pic = NULL,
    id_card_number = NULL,
    kyc_selfie_url = NULL,
    kyc_id_card_url = NULL,
    address = NULL,
    emergency_contact = NULL,
    bank_account_number = NULL,
    account_status = 'deleted',
    deleted_at = NOW(),
    deletion_reason = 'User requested account deletion'
  WHERE id = target_user_id;
  
  -- Anonymize related data in other tables
  UPDATE reviews SET reviewer_name = 'Deleted User' WHERE reviewer_id = target_user_id;
  UPDATE messages SET content = '[Message deleted]' WHERE sender_id = target_user_id;
  
  -- Log anonymization
  RAISE NOTICE 'User % data anonymized successfully', target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function สำหรับ Process Account Deletion (Scheduled Job)
CREATE OR REPLACE FUNCTION process_scheduled_deletions() RETURNS INT AS $$
DECLARE
  deleted_count INT := 0;
  req RECORD;
BEGIN
  FOR req IN 
    SELECT id, user_id FROM account_deletion_requests 
    WHERE status = 'approved' 
      AND scheduled_deletion_date <= NOW()
      AND scheduled_deletion_date IS NOT NULL
  LOOP
    -- Anonymize user data
    PERFORM anonymize_user_data(req.user_id);
    
    -- Update deletion request status
    UPDATE account_deletion_requests 
    SET status = 'completed', processed_at = NOW() 
    WHERE id = req.id;
    
    deleted_count := deleted_count + 1;
  END LOOP;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE account_deletion_requests IS 'Account deletion requests for GDPR and App Store compliance';
COMMENT ON FUNCTION anonymize_user_data IS 'Anonymize user PII for GDPR right to erasure';
COMMENT ON FUNCTION process_scheduled_deletions IS 'Batch process approved account deletions (run daily via cron)';
