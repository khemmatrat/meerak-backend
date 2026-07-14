-- 228: User commerce intelligence — event stream, daily rollup, consent, partner API

CREATE TABLE IF NOT EXISTS user_commerce_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  category TEXT,
  amount NUMERIC(18, 2),
  job_id TEXT,
  source_table TEXT,
  source_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_commerce_events_source
  ON user_commerce_events (source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_commerce_events_user_time
  ON user_commerce_events (user_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_commerce_events_type_time
  ON user_commerce_events (event_type, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_commerce_events_job
  ON user_commerce_events (job_id)
  WHERE job_id IS NOT NULL;

COMMENT ON TABLE user_commerce_events IS 'Append-only commerce/job/financial event stream per user (no ledger backfill in hot path)';

CREATE TABLE IF NOT EXISTS user_commerce_daily (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  spend_in NUMERIC(18, 2) NOT NULL DEFAULT 0,
  spend_out NUMERIC(18, 2) NOT NULL DEFAULT 0,
  jobs_posted INTEGER NOT NULL DEFAULT 0,
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  jobs_disputed INTEGER NOT NULL DEFAULT 0,
  deposits_count INTEGER NOT NULL DEFAULT 0,
  withdrawals_count INTEGER NOT NULL DEFAULT 0,
  escrow_held NUMERIC(18, 2) NOT NULL DEFAULT 0,
  escrow_released NUMERIC(18, 2) NOT NULL DEFAULT 0,
  category_spend JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day_date)
);

CREATE INDEX IF NOT EXISTS idx_user_commerce_daily_day
  ON user_commerce_daily (day_date DESC);

CREATE TABLE IF NOT EXISTS commerce_sync_state (
  key TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO commerce_sync_state (key, last_synced_at)
VALUES ('ledger_sync', NOW() - INTERVAL '90 days')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS data_sharing_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

COMMENT ON COLUMN users.data_sharing_consent IS 'PDPA: user opted in to anonymized data sharing with partners';
COMMENT ON COLUMN users.consent_at IS 'When data_sharing_consent was last set true';

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['trust:read'],
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS partner_api_audit_log (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES partner_api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT,
  status_code INTEGER,
  ip_address TEXT,
  request_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_api_audit_key_time
  ON partner_api_audit_log (api_key_id, created_at DESC);
