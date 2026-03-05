-- =================================================================================
-- 036: Ensure all columns for GET /api/admin/users/:id exist
-- =================================================================================
-- Fixes 500 when admin fetches user detail (missing columns)
-- =================================================================================

-- last_login (010 adds it; ensure it exists for GET /api/admin/users/:id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
    ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
      UPDATE users SET last_login = last_login_at WHERE last_login_at IS NOT NULL;
    END IF;
  END IF;
END $$;

-- name
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
UPDATE users SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;

-- role
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- kyc_rejection_reason
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;

-- provider_status, provider_verified_at, provider_test_attempts, provider_test_next_retry_at
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_status VARCHAR(50) DEFAULT 'UNVERIFIED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_next_retry_at TIMESTAMP;

-- banned_until, ban_reason, is_vip
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;

-- avatar_url
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
