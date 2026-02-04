-- 010: Schema for admin login (Render / production DB)
-- Run this on Render's PostgreSQL so POST /api/auth/admin-login works.

-- 1. users table: ensure password_hash column exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 2. user_roles table (RBAC for admin dashboard)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('USER', 'ADMIN', 'AUDITOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Optional: create admin user if not exists (replace with your admin email)
-- INSERT INTO users (firebase_uid, email, full_name, password_hash)
-- VALUES ('admin-render', 'admin@nexus.com', 'Admin', NULL)
-- ON CONFLICT (email) DO NOTHING;
-- Then run: node scripts/set-admin-password.js (point DB_* to Render DB) to set password to admin123
