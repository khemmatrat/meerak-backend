-- =================================================================================
-- 010: Admin login (password_hash ใน users + user_roles สำหรับ ADMIN/AUDITOR)
-- =================================================================================
-- ใช้สำหรับ /api/auth/admin-login และ user login ที่ใช้ password_hash
-- =================================================================================

-- เพิ่ม password_hash ถ้ายังไม่มี (เก็บ bcrypt hash)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
  END IF;
END $$;

-- column password (plain) สำหรับ dev - ถ้ายังไม่มี
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'password'
  ) THEN
    ALTER TABLE users ADD COLUMN password VARCHAR(255);
  END IF;
END $$;

-- last_login ถ้ายังไม่มี
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_login'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;
  END IF;
END $$;

-- user_roles อยู่แล้วใน 009; ไม่ต้องสร้างซ้ำ
