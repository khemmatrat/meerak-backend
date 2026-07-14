-- Sprint 30a — AQOND Experience Engine (extension tables only)
-- FTX + Intent + Lifecycle + Analytics foundation

CREATE TABLE IF NOT EXISTS commerce.user_experience_profiles (
  user_id TEXT PRIMARY KEY,
  guest_id TEXT,
  lifecycle_stage TEXT NOT NULL DEFAULT 'visitor'
    CHECK (lifecycle_stage IN (
      'visitor', 'new_user', 'activated', 'power_user',
      'merchant', 'partner', 'vip', 'enterprise'
    )),
  primary_intent TEXT,
  secondary_intents JSONB NOT NULL DEFAULT '[]',
  hidden_intents JSONB NOT NULL DEFAULT '[]',
  intent_graph JSONB NOT NULL DEFAULT '{}',
  birth_date DATE,
  email TEXT,
  referral_code TEXT,
  country TEXT,
  language TEXT,
  referral_source TEXT,
  wizard_completed_at TIMESTAMPTZ,
  tour_completed_at TIMESTAMPTZ,
  tour_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  first_launch_at TIMESTAMPTZ,
  context_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_experience_guest
  ON commerce.user_experience_profiles (guest_id)
  WHERE guest_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commerce.experience_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  guest_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experience_events_type_time
  ON commerce.experience_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_experience_events_user
  ON commerce.experience_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE commerce.user_experience_profiles IS 'Sprint 30 — Experience Engine: FTX, intent, lifecycle';
COMMENT ON TABLE commerce.experience_events IS 'Sprint 30 — Experience analytics (no third-party)';
