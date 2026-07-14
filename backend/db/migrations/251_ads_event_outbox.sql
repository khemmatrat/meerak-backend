-- Phase 10: durable ads event outbox for analytics pipeline (Kafka/ClickHouse later)

CREATE TABLE IF NOT EXISTS ads_event_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_name VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  CONSTRAINT ads_event_outbox_status_check CHECK (status IN ('pending', 'dispatched', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_event_outbox_idem
  ON ads_event_outbox (event_name, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_ads_event_outbox_pending
  ON ads_event_outbox (created_at)
  WHERE status = 'pending';

COMMENT ON TABLE ads_event_outbox IS 'Immutable ads delivery/billing events for future stream consumers; Postgres is SSOT until Kafka/ClickHouse.';
