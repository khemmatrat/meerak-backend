-- P46: Shard topology catalog + table classification + P54 residency + P55 read mirrors

CREATE TABLE IF NOT EXISTS commerce.shard_catalog (
  logical_shard INT PRIMARY KEY,
  physical_node TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  citus_group_id INT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draining', 'offline')),
  metadata JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.table_shard_class (
  schema_name TEXT NOT NULL DEFAULT 'commerce',
  table_name TEXT NOT NULL,
  shard_class TEXT NOT NULL CHECK (shard_class IN ('distributed', 'reference', 'local')),
  distribution_column TEXT,
  colocate_with TEXT,
  residency_tag TEXT NOT NULL DEFAULT 'regional',
  notes TEXT DEFAULT '',
  PRIMARY KEY (schema_name, table_name)
);

CREATE TABLE IF NOT EXISTS commerce.residency_audit (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  home_region TEXT NOT NULL,
  attempted_region TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_residency_audit_shard ON commerce.residency_audit (shard_key, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.region_read_mirrors (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  home_region TEXT NOT NULL,
  mirror_region TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id, mirror_region)
);

-- Seed logical shard map (dev-lite: 2 workers -> logical 0,1)
INSERT INTO commerce.shard_catalog (logical_shard, physical_node, region, citus_group_id, status)
VALUES
  (0, 'citus-worker-1', 'TH', 1, 'active'),
  (1, 'citus-worker-2', 'SEA', 2, 'active')
ON CONFLICT (logical_shard) DO NOTHING;

-- Table classification (P46)
INSERT INTO commerce.table_shard_class (table_name, shard_class, distribution_column, colocate_with, residency_tag, notes) VALUES
  ('merchants', 'distributed', 'shard_key', NULL, 'regional', 'root colocation group'),
  ('stores', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('products', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('product_variants', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('inventory', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('inventory_reservations', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('orders', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('order_items', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('wallets', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('wallet_ledger', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('outbox', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('hermes_episodic_memory', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('hermes_procedural_rules', 'distributed', 'shard_key', 'merchants', 'regional', NULL),
  ('media', 'distributed', 'shard_key', 'merchants', 'regional', 'P36 video ingest'),
  ('posts', 'distributed', 'shard_key', 'merchants', 'regional', 'P34 feed posts'),
  ('shard_catalog', 'reference', NULL, NULL, 'global', 'topology metadata'),
  ('table_shard_class', 'reference', NULL, NULL, 'global', 'classification metadata'),
  ('residency_audit', 'reference', NULL, NULL, 'global', 'compliance audit'),
  ('region_read_mirrors', 'reference', NULL, NULL, 'global', 'P55 cross-region reads'),
  ('user_interests', 'distributed', 'user_id', NULL, 'regional', 'buyer PII — pin by user home region'),
  ('feed_experiments', 'distributed', 'user_id', NULL, 'regional', NULL)
ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Add shard_key to posts if missing (Citus distribution)
ALTER TABLE commerce.posts ADD COLUMN IF NOT EXISTS shard_key TEXT;
ALTER TABLE commerce.posts ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'TH';
UPDATE commerce.posts SET shard_key = author_id WHERE shard_key IS NULL;
ALTER TABLE commerce.user_interests ADD COLUMN IF NOT EXISTS shard_key TEXT;
ALTER TABLE commerce.user_interests ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'TH';
UPDATE commerce.user_interests SET shard_key = user_id WHERE shard_key IS NULL;
ALTER TABLE commerce.feed_experiments ADD COLUMN IF NOT EXISTS shard_key TEXT;
ALTER TABLE commerce.feed_experiments ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'TH';
UPDATE commerce.feed_experiments SET shard_key = user_id WHERE shard_key IS NULL;

COMMENT ON TABLE commerce.shard_catalog IS 'P46 logical->physical shard map for Citus cluster';
