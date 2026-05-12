-- =================================================================================
-- 135: Brand Adviser — enrollment, reputation, audit, admin config (payout_config)
-- =================================================================================
-- Platform commission waiver (matching / job board / booking) uses is_brand_adviser
-- + adviser_status = 'active' in application logic — not DB-generated.
-- Referral cash skipped for active BA → reputation points (see lib/brandAdviser.js).
-- =================================================================================

-- 1) users: Brand Adviser columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_brand_adviser BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS adviser_status VARCHAR(20)
  CHECK (adviser_status IS NULL OR adviser_status IN ('active', 'suspended'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS adviser_reputation_score NUMERIC(14,2) NOT NULL DEFAULT 0
  CHECK (adviser_reputation_score >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS adviser_public_slug VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS adviser_public_profile_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS adviser_granted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS adviser_suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS adviser_suspended_reason TEXT;

COMMENT ON COLUMN users.is_brand_adviser IS 'Enrolled in Brand Adviser program (badge/history); fee waiver only when adviser_status = active';
COMMENT ON COLUMN users.adviser_status IS 'active = platform commission waived; suspended = paused; NULL when not enrolled';
COMMENT ON COLUMN users.adviser_reputation_score IS 'BA reputation points (e.g. substitute for cash referral when active BA)';
COMMENT ON COLUMN users.adviser_public_slug IS 'Optional public landing slug (unique when set)';
COMMENT ON COLUMN users.adviser_public_profile_enabled IS 'User opts in to public BA profile on landing';

-- Enrolled BA must have a status; non-enrolled must not carry a status
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_brand_adviser_status_consistency;
ALTER TABLE users ADD CONSTRAINT users_brand_adviser_status_consistency CHECK (
  (is_brand_adviser = FALSE AND adviser_status IS NULL)
  OR (is_brand_adviser = TRUE AND adviser_status IN ('active', 'suspended'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_adviser_public_slug_unique
  ON users (LOWER(adviser_public_slug))
  WHERE adviser_public_slug IS NOT NULL AND TRIM(adviser_public_slug) <> '';

CREATE INDEX IF NOT EXISTS idx_users_brand_adviser_active
  ON users (id)
  WHERE is_brand_adviser = TRUE AND adviser_status = 'active';

-- 2) BA-specific audit (separate from generic audit_log for structured admin queries)
CREATE TABLE IF NOT EXISTS brand_adviser_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL DEFAULT 'system',
  actor_role VARCHAR(20) NOT NULL DEFAULT 'System'
    CHECK (actor_role IN ('Admin', 'System', 'Cron')),
  action VARCHAR(80) NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_adviser_audit_user ON brand_adviser_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brand_adviser_audit_action ON brand_adviser_audit_log (action, created_at DESC);

COMMENT ON TABLE brand_adviser_audit_log IS 'Grant/suspend/revoke BA and system evaluations — append-only';

-- 3) Reputation ledger (non-cash substitute for referral etc.)
CREATE TABLE IF NOT EXISTS brand_adviser_reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  points_delta NUMERIC(14,2) NOT NULL,
  referee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  job_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ba_reputation_user ON brand_adviser_reputation_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ba_reputation_job ON brand_adviser_reputation_events (job_id)
  WHERE job_id IS NOT NULL;

COMMENT ON TABLE brand_adviser_reputation_events IS 'BA reputation points — e.g. referral_cash_substitute when active BA skips referral_bonus';

-- 4) Admin-tunable rules + global kill switch (does not alter fee_rates)
INSERT INTO payout_config (key, value_json, updated_at) VALUES (
  'brand_adviser_rules',
  '{
    "program_enabled": false,
    "inactivity_days": 30,
    "warn_days_before_suspend": 3,
    "admin_alert_days_before_suspend": 5,
    "activity_requires_closed_job": true,
    "referral_reputation_multiplier": 1
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN payout_config.value_json IS 'Includes brand_adviser_rules: program_enabled, inactivity_days, warn_days_before_suspend, admin_alert_days_before_suspend, activity_requires_closed_job, referral_reputation_multiplier';
