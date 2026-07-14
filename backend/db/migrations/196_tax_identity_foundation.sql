-- =============================================================================
-- 196: Tax identity foundation (VAT-registered platform)
-- =============================================================================
-- Adds company tax settings, user tax profiles, and audit trail for tax-profile
-- changes. This migration is additive only and does not mutate ledger balances,
-- payment statuses, PaySo reconciliation, or payout behavior.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tax_company_settings (
  id TEXT PRIMARY KEY DEFAULT 'aqond',
  legal_name TEXT NOT NULL DEFAULT 'AQOND Technology Co., Ltd.',
  registered_address TEXT,
  tax_id TEXT,
  branch_code TEXT NOT NULL DEFAULT '00000',
  branch_name TEXT NOT NULL DEFAULT 'สำนักงานใหญ่',
  vat_registered BOOLEAN NOT NULL DEFAULT TRUE,
  vat_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 7,
  wht_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 3,
  support_email TEXT,
  support_line TEXT,
  help_center_url TEXT,
  phone_optional TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tax_company_settings_singleton CHECK (id = 'aqond')
);

INSERT INTO tax_company_settings (id)
VALUES ('aqond')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE tax_company_settings IS 'Official company tax identity used for Tax Invoice / Receipt snapshots. No secrets.';
COMMENT ON COLUMN tax_company_settings.phone_optional IS 'Optional real office/contact phone. Leave NULL if no official phone exists.';

CREATE TABLE IF NOT EXISTS tax_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  legal_name TEXT,
  tax_id TEXT,
  tax_entity_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (tax_entity_type IN ('unknown', 'individual', 'company', 'foreign')),
  registered_address TEXT,
  branch_code TEXT,
  branch_name TEXT,
  country TEXT NOT NULL DEFAULT 'TH',
  email TEXT,
  phone_optional TEXT,
  verified_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verified_status IN ('unverified', 'pending_review', 'verified', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_user_profiles_status ON tax_user_profiles (verified_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_user_profiles_tax_id ON tax_user_profiles (tax_id) WHERE tax_id IS NOT NULL;

COMMENT ON TABLE tax_user_profiles IS 'User/employer/provider tax profile. Optional during normal app usage, required for tax document issuance/download.';
COMMENT ON COLUMN tax_user_profiles.phone_optional IS 'Optional real contact phone. Do not store placeholder values.';

CREATE TABLE IF NOT EXISTS tax_profile_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  actor_id TEXT,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  before_json JSONB,
  after_json JSONB,
  source_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_profile_audit_target ON tax_profile_audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_profile_audit_actor ON tax_profile_audit_log (actor_type, actor_id, created_at DESC);

COMMENT ON TABLE tax_profile_audit_log IS 'Immutable audit trail for company/user tax profile changes.';
