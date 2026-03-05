-- =================================================================================
-- 011: User account_status (active / suspended / banned) for admin control
-- =================================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'account_status'
  ) THEN
    ALTER TABLE users ADD COLUMN account_status VARCHAR(20) DEFAULT 'active'
      CHECK (account_status IN ('active', 'suspended', 'banned'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
