-- Sprint S16 — dead letter queue for failed projections
CREATE TABLE IF NOT EXISTS commerce.event_dlq (
  id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  last_error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_dlq_order ON commerce.event_dlq (order_id, failed_at DESC);
