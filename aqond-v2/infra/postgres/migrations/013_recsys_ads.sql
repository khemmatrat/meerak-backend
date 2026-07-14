-- P99-P104: Recsys/Ads — feature definitions, model registry, ad campaigns/creatives,
-- affiliate links. Online features live in Redis; this stores definitions + offline state.

-- P99: feature definitions + offline feature snapshots
CREATE TABLE IF NOT EXISTS commerce.feature_definitions (
  name TEXT PRIMARY KEY,
  entity TEXT NOT NULL CHECK (entity IN ('user', 'item', 'context')),
  dtype TEXT NOT NULL DEFAULT 'float',
  freshness_sla_sec INT NOT NULL DEFAULT 300,
  source TEXT NOT NULL DEFAULT 'stream',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P100/P101: model registry (retrieval + ranker), with safe-rollback pointer
CREATE TABLE IF NOT EXISTS commerce.model_registry (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('retrieval', 'ranker', 'moderation', 'fraud')),
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow', 'active', 'rollback', 'retired')),
  metrics JSONB NOT NULL DEFAULT '{}',
  artifact_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, version)
);

-- P100: item embeddings for ANN candidate recall (dev-lite: small vectors as JSON)
CREATE TABLE IF NOT EXISTS commerce.item_embeddings (
  item_id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL DEFAULT 'video',
  dim INT NOT NULL DEFAULT 8,
  vector JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P103: ad campaigns + creatives + budget pacing
CREATE TABLE IF NOT EXISTS commerce.ad_campaigns (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT 'conversions',
  bid_micro BIGINT NOT NULL DEFAULT 0,
  daily_budget_micro BIGINT NOT NULL DEFAULT 0,
  spent_micro BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'depleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON commerce.ad_campaigns (status, merchant_id);

CREATE TABLE IF NOT EXISTS commerce.ad_creatives (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  product_id TEXT,
  headline TEXT NOT NULL DEFAULT '',
  est_ctr DOUBLE PRECISION NOT NULL DEFAULT 0.02,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON commerce.ad_creatives (campaign_id, status);

-- P104: affiliate / creator-product links (commission aware)
CREATE TABLE IF NOT EXISTS commerce.affiliate_links (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  commission_bps INT NOT NULL DEFAULT 500,
  brand_safe BOOLEAN NOT NULL DEFAULT TRUE,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_creator ON commerce.affiliate_links (creator_id, status);

COMMENT ON TABLE commerce.model_registry IS 'P101 model registry with shadow/active/rollback states';
