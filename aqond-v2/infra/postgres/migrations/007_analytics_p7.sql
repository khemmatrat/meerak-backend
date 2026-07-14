-- P7: Product + live directory analytics for CrewAI re-rank
-- Run against `analytics` database

ALTER TABLE analytics.stream_events
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'live';

CREATE INDEX IF NOT EXISTS idx_stream_events_product
  ON analytics.stream_events (product_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_events_merchant
  ON analytics.stream_events (merchant_id, created_at DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.product_conversion_summary AS
SELECT
  COALESCE(product_id, 'unknown') AS product_id,
  COUNT(*) FILTER (WHERE event_type = 'impression') AS impressions,
  COUNT(*) FILTER (WHERE event_type = 'click') AS clicks,
  COUNT(*) FILTER (WHERE event_type = 'f_code_view') AS f_code_views,
  COUNT(*) FILTER (WHERE event_type = 'purchase') AS purchases,
  CASE WHEN COUNT(*) FILTER (WHERE event_type IN ('impression', 'f_code_view')) > 0
    THEN ROUND(
      100.0 * COUNT(*) FILTER (WHERE event_type = 'purchase')::numeric
      / NULLIF(COUNT(*) FILTER (WHERE event_type IN ('impression', 'f_code_view')), 0), 4)
    ELSE 0 END AS conversion_rate_pct,
  MAX(created_at) AS last_event_at
FROM analytics.stream_events
WHERE product_id IS NOT NULL
GROUP BY product_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_conversion_product
  ON analytics.product_conversion_summary (product_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.live_directory_summary AS
SELECT
  stream_id,
  MAX(merchant_id) AS merchant_id,
  COUNT(*) FILTER (WHERE event_type = 'live_join') AS live_joins,
  COUNT(*) FILTER (WHERE event_type = 'impression') AS impressions,
  COUNT(*) FILTER (WHERE event_type = 'purchase') AS purchases,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'live_join') > 0
    THEN ROUND(
      100.0 * COUNT(*) FILTER (WHERE event_type = 'purchase')::numeric
      / COUNT(*) FILTER (WHERE event_type = 'live_join'), 4)
    ELSE 0 END AS conversion_rate_pct,
  MAX(created_at) AS last_active_at
FROM analytics.stream_events
WHERE stream_id LIKE 'live-%'
GROUP BY stream_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_directory_stream
  ON analytics.live_directory_summary (stream_id);

COMMENT ON MATERIALIZED VIEW analytics.product_conversion_summary IS 'P7: catalog re-rank input for CrewAI agent';
COMMENT ON MATERIALIZED VIEW analytics.live_directory_summary IS 'P7: live stream directory ranking';
