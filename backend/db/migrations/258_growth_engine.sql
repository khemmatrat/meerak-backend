-- Growth Engine — viral milestones, entitlements, intent, pass, subscriptions (Phase 0 foundation)

CREATE TABLE IF NOT EXISTS growth_entitlements (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ai_video_credits INT NOT NULL DEFAULT 0,
  ai_video_credits_used INT NOT NULL DEFAULT 0,
  mystery_voucher_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  mystery_voucher_claimed_at TIMESTAMPTZ,
  incubation_started_at TIMESTAMPTZ,
  incubation_week INT NOT NULL DEFAULT 0,
  wallet_activated_at TIMESTAMPTZ,
  aqond_pass_phase INT NOT NULL DEFAULT 0,
  aqond_pass_started_at TIMESTAMPTZ,
  locked_subsidy_category VARCHAR(64),
  pass_expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_growth_entitlements_incubation
  ON growth_entitlements (incubation_started_at) WHERE incubation_started_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS growth_referral_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign VARCHAR(64) NOT NULL,
  target_count INT NOT NULL DEFAULT 10,
  qualified_count INT NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ,
  reward_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, campaign)
);

CREATE INDEX IF NOT EXISTS idx_growth_referral_milestones_user
  ON growth_referral_milestones (user_id);

CREATE TABLE IF NOT EXISTS growth_referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign VARCHAR(64) NOT NULL,
  referral_code VARCHAR(32),
  qualified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referrer_id, referee_id, campaign)
);

CREATE INDEX IF NOT EXISTS idx_growth_referral_events_referrer
  ON growth_referral_events (referrer_id, campaign);

CREATE TABLE IF NOT EXISTS growth_incubation_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_no INT NOT NULL,
  brief_text TEXT,
  brief_generated_at TIMESTAMPTZ,
  raw_upload_url TEXT,
  composed_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_no)
);

CREATE TABLE IF NOT EXISTS user_intent_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  dwell_ms INT NOT NULL,
  surface VARCHAR(64),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_intent_events_user_time
  ON user_intent_events (user_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS user_temporal_patterns (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,
  hour_bucket SMALLINT NOT NULL,
  open_count INT NOT NULL DEFAULT 0,
  dominant_intent VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day_of_week, hour_bucket)
);

CREATE TABLE IF NOT EXISTS merchant_top10_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  rank SMALLINT NOT NULL,
  shop_id VARCHAR(128) NOT NULL,
  merchant_name VARCHAR(255),
  score NUMERIC(12, 4) NOT NULL DEFAULT 0,
  promo_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_start, rank)
);

CREATE INDEX IF NOT EXISTS idx_merchant_top10_week
  ON merchant_top10_snapshots (week_start DESC);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(64) PRIMARY KEY,
  name_th VARCHAR(255) NOT NULL,
  price_thb NUMERIC(10, 2) NOT NULL,
  billing_interval VARCHAR(16) NOT NULL DEFAULT 'month',
  plan_type VARCHAR(32) NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (id, name_th, price_thb, plan_type, features)
VALUES
  (
    'talent_pro_799',
    'Talent Pro — AI Director + Video Resume',
    799,
    'talent',
    '["ai_director","unlimited_overlay_clips","analytics"]'::jsonb
  ),
  (
    'merchant_marketing_799',
    'Merchant Marketing — AI Promo Generator',
    799,
    'merchant',
    '["weekly_ai_promo","top10_eligibility","analytics"]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR(64) NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(32) NOT NULL DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user
  ON user_subscriptions (user_id, status);

CREATE TABLE IF NOT EXISTS talent_video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  script_text TEXT,
  avatar_url TEXT,
  output_url TEXT,
  error_message TEXT,
  credits_consumed INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_talent_video_jobs_user
  ON talent_video_jobs (user_id, created_at DESC);

COMMENT ON TABLE growth_entitlements IS 'Marketing viral entitlements — AI credits, mystery box, incubation, AQOND Pass';
COMMENT ON TABLE growth_referral_milestones IS 'Gamified 10/10 referral progress per campaign (talent_ai, mystery_box)';
