-- P105-P110: Trust & Safety + Reviews — moderation cases, copyright fingerprints,
-- fraud/account integrity, reviews integrity, reports, enforcement actions.

-- P108: ratings & reviews (verified-purchase aware) + helpful votes
CREATE TABLE IF NOT EXISTS commerce.reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  author_id TEXT NOT NULL,
  order_id TEXT,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  media JSONB NOT NULL DEFAULT '[]',
  verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  spam_score INT NOT NULL DEFAULT 0,
  helpful_count BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'pending', 'rejected', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, author_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON commerce.reviews (product_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.review_votes (
  review_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  helpful BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, voter_id)
);

-- P105: moderation cases across surfaces (media/posts/reviews/text)
CREATE TABLE IF NOT EXISTS commerce.moderation_cases (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL CHECK (surface IN ('media', 'post', 'review', 'profile', 'message', 'product')),
  entity_id TEXT NOT NULL,
  shard_key TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'TH',
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'rejected', 'needs_human')),
  categories JSONB NOT NULL DEFAULT '[]',
  model_version TEXT,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  human_required BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (surface, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_moderation_queue ON commerce.moderation_cases (decision, severity, created_at)
  WHERE decision IN ('pending', 'needs_human');

-- P106: copyright fingerprints / rights registry
CREATE TABLE IF NOT EXISTS commerce.copyright_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'audio' CHECK (kind IN ('audio', 'video', 'image')),
  fingerprint TEXT NOT NULL,
  rights_holder TEXT NOT NULL DEFAULT '',
  policy TEXT NOT NULL DEFAULT 'block' CHECK (policy IN ('block', 'allow', 'monetize', 'mute')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, fingerprint)
);

CREATE TABLE IF NOT EXISTS commerce.copyright_matches (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  similarity DOUBLE PRECISION NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT 'block',
  status TEXT NOT NULL DEFAULT 'matched' CHECK (status IN ('matched', 'disputed', 'cleared')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_copyright_matches_media ON commerce.copyright_matches (media_id);

-- P107: fraud / account-integrity signals (anti-bot, sybil, coordinated abuse)
CREATE TABLE IF NOT EXISTS commerce.account_integrity (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  signal TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  device_fingerprint TEXT,
  ip TEXT,
  decision TEXT NOT NULL DEFAULT 'monitor' CHECK (decision IN ('monitor', 'challenge', 'restrict', 'ban')),
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_integrity_account ON commerce.account_integrity (account_id, created_at DESC);

-- P109: user reports + appeals + enforcement actions (audit trail, policy versioned)
CREATE TABLE IF NOT EXISTS commerce.reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'actioned', 'dismissed')),
  case_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON commerce.reports (status, created_at);

CREATE TABLE IF NOT EXISTS commerce.enforcement_actions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('account', 'content', 'merchant')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('warn', 'limit', 'takedown', 'ban', 'reinstate')),
  reason TEXT NOT NULL DEFAULT '',
  policy_version TEXT NOT NULL DEFAULT 'v1',
  case_id TEXT,
  appeal_status TEXT NOT NULL DEFAULT 'none' CHECK (appeal_status IN ('none', 'requested', 'upheld', 'overturned')),
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enforcement_target ON commerce.enforcement_actions (target_type, target_id, created_at DESC);

COMMENT ON TABLE commerce.moderation_cases IS 'P105 scalable moderation across surfaces with human-review queue';
