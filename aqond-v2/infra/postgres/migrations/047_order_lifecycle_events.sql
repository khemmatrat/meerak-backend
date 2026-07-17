-- Sprint S16 — order lifecycle events (PG backbone)
CREATE TABLE IF NOT EXISTS commerce.order_lifecycle_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  actor TEXT,
  phase TEXT,
  job_id TEXT,
  merchant_id TEXT,
  rider_id TEXT,
  payload JSONB DEFAULT '{}',
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_lifecycle_events_order
  ON commerce.order_lifecycle_events (order_id, at DESC);
