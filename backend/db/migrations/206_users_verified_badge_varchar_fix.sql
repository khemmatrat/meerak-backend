-- 206: Verified Skills Badge (Portfolio) must store string labels (e.g. "Master Tailor").
-- Migration 033 used BOOLEAN DEFAULT FALSE; string PATCHes then failed with invalid boolean syntax.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'verified_badge'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE users ALTER COLUMN verified_badge DROP DEFAULT;
    ALTER TABLE users
      ALTER COLUMN verified_badge TYPE VARCHAR(120)
      USING (
        CASE
          WHEN verified_badge IS TRUE THEN 'Verified'
          ELSE NULL
        END
      );
  END IF;
END $$;
