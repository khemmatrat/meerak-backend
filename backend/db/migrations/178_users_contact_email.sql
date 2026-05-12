-- =================================================================================
-- 178: users.contact_email — อีเมลติดต่อ/แจ้งเตือน (แยกจาก email บัญชีถ้าต้องการ)
-- =================================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

COMMENT ON COLUMN users.contact_email IS 'อีเมลติดต่อ — ถ้าว่างให้ใช้ email หลัก; ใช้แอดมินส่งข่าว/แจ้งเตือน';

CREATE INDEX IF NOT EXISTS idx_users_contact_email_lower ON users (lower(trim(contact_email)))
  WHERE contact_email IS NOT NULL AND trim(contact_email) <> '';
