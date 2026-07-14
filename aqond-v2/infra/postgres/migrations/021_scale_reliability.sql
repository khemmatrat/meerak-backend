-- P171-P200: scale, SLO, capacity, load tests, chaos, readiness, ops maturity.

-- P171: SLO definitions + error budget snapshots
CREATE TABLE IF NOT EXISTS commerce.slo_definitions (
  id TEXT PRIMARY KEY,
  journey TEXT NOT NULL,              -- checkout | flash_buy | feed | search | payment | live
  sli TEXT NOT NULL,                  -- availability | latency_p99 | success_rate
  target NUMERIC(8,6) NOT NULL,       -- e.g. 0.999000 for 99.9%
  window_days INT NOT NULL DEFAULT 30,
  burn_alert_bps INT NOT NULL DEFAULT 200,  -- alert when 2% budget burned in 1h
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO commerce.slo_definitions (id, journey, sli, target, burn_alert_bps) VALUES
  ('slo-checkout-avail','checkout','availability',0.999500,200),
  ('slo-flash-avail','flash_buy','availability',0.999000,150),
  ('slo-flash-latency','flash_buy','latency_p99',0.990000,200),
  ('slo-feed-avail','feed','availability',0.995000,300),
  ('slo-search-avail','search','availability',0.999000,200),
  ('slo-payment-avail','payment','availability',0.999900,100),
  ('slo-live-avail','live','availability',0.995000,300)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS commerce.slo_snapshots (
  id BIGSERIAL PRIMARY KEY,
  slo_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '*',
  observed NUMERIC(10,6) NOT NULL,
  budget_remaining_bps INT NOT NULL DEFAULT 10000,
  burn_rate_bps INT NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slo_snap_slo ON commerce.slo_snapshots (slo_id, captured_at DESC);

-- P172: capacity model rows (100M / 500M / 1B tiers)
CREATE TABLE IF NOT EXISTS commerce.capacity_models (
  id TEXT PRIMARY KEY,
  scale_tier TEXT NOT NULL,           -- 100M | 500M | 1B
  service TEXT NOT NULL,
  peak_rps INT NOT NULL DEFAULT 0,
  cpu_cores INT NOT NULL DEFAULT 0,
  memory_gb INT NOT NULL DEFAULT 0,
  db_connections INT NOT NULL DEFAULT 0,
  kafka_partitions INT NOT NULL DEFAULT 0,
  redis_shards INT NOT NULL DEFAULT 0,
  cost_usd_monthly INT NOT NULL DEFAULT 0,
  headroom_pct INT NOT NULL DEFAULT 30,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scale_tier, service)
);

-- P173-P176,P198: load test run registry
CREATE TABLE IF NOT EXISTS commerce.load_test_runs (
  id TEXT PRIMARY KEY,
  scenario TEXT NOT NULL,             -- mixed | flash_1b | feed_fanout | soak | full_rehearsal
  scale_tier TEXT NOT NULL DEFAULT 'dev-lite',
  vus INT NOT NULL DEFAULT 0,
  duration_sec INT NOT NULL DEFAULT 0,
  p95_ms DOUBLE PRECISION,
  p99_ms DOUBLE PRECISION,
  error_rate DOUBLE PRECISION,
  rps DOUBLE PRECISION,
  oversell_count INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  metrics JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_load_runs_scenario ON commerce.load_test_runs (scenario, started_at DESC);

-- P177-P179: data-tier health snapshots
CREATE TABLE IF NOT EXISTS commerce.tier_health (
  id BIGSERIAL PRIMARY KEY,
  tier TEXT NOT NULL,                 -- postgres | citus | redis | kafka | scylla
  region TEXT NOT NULL DEFAULT '*',
  status TEXT NOT NULL DEFAULT 'healthy',
  hot_shards INT NOT NULL DEFAULT 0,
  consumer_lag_max BIGINT NOT NULL DEFAULT 0,
  pool_utilization_bps INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P180: tail latency samples
CREATE TABLE IF NOT EXISTS commerce.tail_latency_samples (
  id BIGSERIAL PRIMARY KEY,
  service TEXT NOT NULL,
  route TEXT NOT NULL DEFAULT '',
  p99_ms DOUBLE PRECISION NOT NULL,
  p999_ms DOUBLE PRECISION NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P181-P182: region failover events
CREATE TABLE IF NOT EXISTS commerce.region_failover_events (
  id TEXT PRIMARY KEY,
  from_region TEXT NOT NULL,
  to_region TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  rto_sec INT,
  rpo_sec INT,
  status TEXT NOT NULL DEFAULT 'simulated'
    CHECK (status IN ('simulated','executed','verified','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P183: chaos game-day scorecards
CREATE TABLE IF NOT EXISTS commerce.chaos_gameday_scores (
  id TEXT PRIMARY KEY,
  scenario TEXT NOT NULL,             -- zone_loss | broker_loss | shard_loss | brownout
  blast_radius TEXT NOT NULL DEFAULT 'staging',
  slo_impact_bps INT NOT NULL DEFAULT 0,
  recovered BOOLEAN NOT NULL DEFAULT FALSE,
  score INT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  notes TEXT NOT NULL DEFAULT '',
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P184: degradation / load shedding state
CREATE TABLE IF NOT EXISTS commerce.degradation_state (
  id TEXT PRIMARY KEY DEFAULT 'global',
  level TEXT NOT NULL DEFAULT 'normal'
    CHECK (level IN ('normal','elevated','brownout','critical')),
  checkout_priority INT NOT NULL DEFAULT 100,
  browse_shed_bps INT NOT NULL DEFAULT 0,
  feed_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  ranker_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO commerce.degradation_state (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

-- P185: cost metrics snapshots
CREATE TABLE IF NOT EXISTS commerce.cost_metrics (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,               -- 2026-Q2
  cost_per_order_micro INT NOT NULL DEFAULT 0,
  cost_per_dau_micro INT NOT NULL DEFAULT 0,
  infra_usd INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P186: data lifecycle tiering jobs
CREATE TABLE IF NOT EXISTS commerce.lifecycle_jobs (
  id TEXT PRIMARY KEY,
  data_class TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('archive','purge','compact')),
  rows_affected BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P187: CDC / warehouse pipeline status
CREATE TABLE IF NOT EXISTS commerce.cdc_pipeline_status (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  sink TEXT NOT NULL,
  lag_sec INT NOT NULL DEFAULT 0,
  rows_per_sec INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P188: ML platform health
CREATE TABLE IF NOT EXISTS commerce.ml_platform_health (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  version TEXT NOT NULL,
  freshness_sec INT NOT NULL DEFAULT 0,
  skew_bps INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'healthy',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P189: security posture register
CREATE TABLE IF NOT EXISTS commerce.security_posture (
  id TEXT PRIMARY KEY,
  control TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pass' CHECK (status IN ('pass','fail','review')),
  last_audit TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence_uri TEXT NOT NULL DEFAULT ''
);

-- P190: compliance audit runs at scale
CREATE TABLE IF NOT EXISTS commerce.compliance_audit_runs (
  id TEXT PRIMARY KEY,
  framework TEXT NOT NULL DEFAULT 'SOC2',
  volume_tier TEXT NOT NULL DEFAULT '100M',
  controls_passed INT NOT NULL DEFAULT 0,
  controls_failed INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P192: incident runbooks
CREATE TABLE IF NOT EXISTS commerce.incident_runbooks (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'sev2',
  title TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO commerce.incident_runbooks (id, service, severity, title, steps) VALUES
  ('rb-flash','order-svc','sev1','Flash sale oversell','1. Enable waiting room 2. Check inventory-svc 3. Pause checkout-svc'),
  ('rb-payment','payment-svc','sev1','Payment PSP outage','1. Failover provider 2. Enable COD-only 3. Notify merchants'),
  ('rb-feed','feed-svc','sev2','Feed latency spike','1. Enable cached feed 2. Shed browse 3. Scale feed-svc')
ON CONFLICT (id) DO NOTHING;

-- P195: vendor SLO tracking
CREATE TABLE IF NOT EXISTS commerce.vendor_slo (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- psp | carrier | ai
  target_availability NUMERIC(8,6) NOT NULL DEFAULT 0.999,
  observed_availability NUMERIC(8,6) NOT NULL DEFAULT 1.0,
  circuit_open BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO commerce.vendor_slo (id, vendor, kind, target_availability) VALUES
  ('v-stub-card','stub-card','psp',0.999),
  ('v-dhl','dhl-xb','carrier',0.995),
  ('v-ai-core','ai-core','ai',0.990)
ON CONFLICT (id) DO NOTHING;

-- P199: readiness review scorecards
CREATE TABLE IF NOT EXISTS commerce.readiness_reviews (
  id TEXT PRIMARY KEY,
  review_type TEXT NOT NULL DEFAULT '100M-1B',
  scale_tier TEXT NOT NULL DEFAULT '100M',
  score INT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  go_no_go TEXT NOT NULL DEFAULT 'pending'
    CHECK (go_no_go IN ('go','no_go','pending','conditional')),
  gaps JSONB NOT NULL DEFAULT '[]',
  signoffs JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P200: continuous scale program cadence
CREATE TABLE IF NOT EXISTS commerce.scale_program_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,           -- load_test | chaos | dr_drill | slo_review | capacity_forecast
  scheduled_for DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  outcome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE commerce.slo_definitions IS 'P171 SLO + error budget definitions';
