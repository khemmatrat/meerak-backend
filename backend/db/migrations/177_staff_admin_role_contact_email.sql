-- =================================================================================
-- 177: staff — บทบาท admin แยกจาก super_admin + อีเมลติดต่อ (optional)
-- =================================================================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

COMMENT ON COLUMN staff.contact_email IS 'อีเมลติดต่อ/แจ้งเตือน — ถ้าว่างให้ใช้ email (ล็อกอิน)';

-- ชื่อ constraint เดิมจาก CREATE TABLE 035 มักเป็น staff_role_check
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;

ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('super_admin', 'admin', 'moderator', 'support'));
