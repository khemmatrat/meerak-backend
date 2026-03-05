-- =================================================================================
-- 035: Staff table for Admin Dashboard Staff & Access Control
-- =================================================================================

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'moderator', 'support')),
  department VARCHAR(100) DEFAULT 'General',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login TIMESTAMPTZ,
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email);

COMMENT ON TABLE staff IS 'Admin staff for Staff & Access Control dashboard';

-- Seed admin@nexus.com เมื่อ staff ว่าง (รักษา ID นี้ไว้ — ใช้ร่วมกับ set-admin-password.js)
INSERT INTO staff (full_name, email, role, department, status)
SELECT 'Nexus Admin', 'admin@nexus.com', 'super_admin', 'General', 'active'
WHERE NOT EXISTS (SELECT 1 FROM staff LIMIT 1);
