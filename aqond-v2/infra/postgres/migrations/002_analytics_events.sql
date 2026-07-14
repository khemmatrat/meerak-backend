-- Lightweight analytics store (P7 alternative to full PostHog self-host)
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.stream_events (
  id BIGSERIAL PRIMARY KEY,
  stream_id TEXT NOT NULL,
  merchant_id TEXT,
  product_id TEXT,
  event_type TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stream_events_stream ON analytics.stream_events (stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_events_type ON analytics.stream_events (event_type, created_at DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.stream_conversion_summary AS
SELECT
  stream_id,
  COUNT(*) FILTER (WHERE event_type = 'impression') AS impressions,
  COUNT(*) FILTER (WHERE event_type = 'click') AS clicks,
  COUNT(*) FILTER (WHERE event_type = 'purchase') AS purchases,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'impression') > 0
    THEN ROUND(
      100.0 * COUNT(*) FILTER (WHERE event_type = 'purchase')::numeric
      / COUNT(*) FILTER (WHERE event_type = 'impression'), 4)
    ELSE 0 END AS conversion_rate_pct
FROM analytics.stream_events
GROUP BY stream_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_conversion_summary_stream
  ON analytics.stream_conversion_summary (stream_id);
