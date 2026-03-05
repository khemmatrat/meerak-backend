-- =================================================================================
-- 015: KYC Re-Verify (verified_at, next_reverify_at)
-- =================================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'kyc_verified_at'
  ) THEN
    ALTER TABLE users ADD COLUMN kyc_verified_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'kyc_next_reverify_at'
  ) THEN
    ALTER TABLE users ADD COLUMN kyc_next_reverify_at TIMESTAMPTZ;
  END IF;
END $$;

COMMENT ON COLUMN users.kyc_verified_at IS 'Last time KYC was approved';
COMMENT ON COLUMN users.kyc_next_reverify_at IS 'Next required re-verify (e.g. 1 year after verified_at)';
