-- Brand Adviser Grand Prize — incremental purchase tracking + leaderboard snapshots

CREATE TABLE IF NOT EXISTS brand_adviser_purchase_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(32) NOT NULL,
  source_id TEXT NOT NULL,
  gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  done_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_type, source_id)
);

CREATE TABLE IF NOT EXISTS brand_adviser_qualified_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualified_at TIMESTAMPTZ NOT NULL,
  qualify_reason VARCHAR(32) NOT NULL,
  source_type VARCHAR(32),
  source_id TEXT,
  gross_trigger NUMERIC(18,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_id, referred_id)
);

CREATE TABLE IF NOT EXISTS brand_adviser_referrer_snapshots (
  referrer_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  qualifying_count INT NOT NULL DEFAULT 0,
  week_new_count INT NOT NULL DEFAULT 0,
  prev_week_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brand_adviser_campaign_fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referred_id UUID REFERENCES users(id) ON DELETE SET NULL,
  flag_type VARCHAR(64) NOT NULL,
  detail JSONB,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ba_purchase_referrer
  ON brand_adviser_purchase_events(referrer_id, referred_id);
CREATE INDEX IF NOT EXISTS idx_ba_purchase_done
  ON brand_adviser_purchase_events(done_at DESC);
CREATE INDEX IF NOT EXISTS idx_ba_qualified_referrer
  ON brand_adviser_qualified_users(referrer_id);
CREATE INDEX IF NOT EXISTS idx_ba_qualified_at
  ON brand_adviser_qualified_users(qualified_at DESC);
CREATE INDEX IF NOT EXISTS idx_ba_snapshots_count
  ON brand_adviser_referrer_snapshots(qualifying_count DESC);
CREATE INDEX IF NOT EXISTS idx_ba_snapshots_week
  ON brand_adviser_referrer_snapshots(week_new_count DESC);
CREATE INDEX IF NOT EXISTS idx_ba_fraud_unresolved
  ON brand_adviser_campaign_fraud_flags(created_at DESC)
  WHERE resolved = FALSE;

COMMENT ON TABLE brand_adviser_purchase_events IS 'Buyer purchases from referred users — feeds campaign qualification';
COMMENT ON TABLE brand_adviser_qualified_users IS 'One row per referred user who met min_purchase or repeat_hire during campaign';
COMMENT ON TABLE brand_adviser_referrer_snapshots IS 'Denormalized leaderboard counters per referrer';
