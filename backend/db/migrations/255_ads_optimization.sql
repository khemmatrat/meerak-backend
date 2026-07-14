-- Phase F: Optimization engine — alerts log + A/B creative variant schema

CREATE TABLE IF NOT EXISTS ad_campaign_optimization_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL,
  action VARCHAR(32) NOT NULL,
  reason TEXT,
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_opt_log_campaign
  ON ad_campaign_optimization_log(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ad_campaign_creative_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL,
  creative_id TEXT NOT NULL,
  variant_key VARCHAR(8) NOT NULL DEFAULT 'A',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  quality_score INT,
  impressions INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  outcomes INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, variant_key)
);

CREATE INDEX IF NOT EXISTS idx_ad_creative_variants_campaign
  ON ad_campaign_creative_variants(campaign_id);
