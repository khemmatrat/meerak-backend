-- =================================================================================
-- 012: KYC rejection reason on users (for admin user detail)
-- =================================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'kyc_rejection_reason'
  ) THEN
    ALTER TABLE users ADD COLUMN kyc_rejection_reason TEXT;
  END IF;
END $$;
