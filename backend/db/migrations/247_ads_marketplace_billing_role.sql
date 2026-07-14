-- Ads campaign billing + ADS_MANAGER admin role
-- payment_ledger_audit already supports arbitrary event_type strings

-- Extend user_roles CHECK to allow ADS_MANAGER (per-user RBAC — not a role catalog)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
      CHECK (role IN (
        'USER', 'ADMIN', 'AUDITOR',
        'SUPER_ADMIN', 'ACCOUNTANT', 'SUPPORT', 'DEVELOPER',
        'STAFF_KYC',
        'ADS_MANAGER'
      ));
    COMMENT ON TABLE user_roles IS 'RBAC: includes ADS_MANAGER for marketplace ads admin (route 2)';
  END IF;
END $$;

-- Local mapping for ad creative uploads (optional audit trail)
CREATE TABLE IF NOT EXISTS ads_creative_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  content_kind VARCHAR(40) NOT NULL DEFAULT 'IMAGE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ads_creative_uploads_user_idx ON ads_creative_uploads (user_id, created_at DESC);
