-- ClickHouse ads warehouse table (run once on prod cluster)
-- Example: clickhouse-client --host CH_HOST --query "$(cat clickhouse-ads-setup.sql)"
-- Or HTTP: curl "http://CH:8123/" --data-binary @clickhouse-ads-setup.sql

CREATE TABLE IF NOT EXISTS ads_events
(
    event_name LowCardinality(String),
    idempotency_key String,
    payload String,
    created_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (event_name, created_at, idempotency_key)
SETTINGS index_granularity = 8192;
