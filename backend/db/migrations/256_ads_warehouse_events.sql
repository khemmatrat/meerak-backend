-- Local warehouse sink (fallback when ClickHouse unavailable)

CREATE TABLE IF NOT EXISTS ads_warehouse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  outbox_id UUID,
  sink VARCHAR(32) NOT NULL DEFAULT 'postgres',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ads_wh_events_name ON ads_warehouse_events(event_name, created_at DESC);
