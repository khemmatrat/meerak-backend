-- Schema for Render / production (migrate script)
-- Ensures admin login works: users.password_hash, user_roles table

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('USER', 'ADMIN', 'AUDITOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
