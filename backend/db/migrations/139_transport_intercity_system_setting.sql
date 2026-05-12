-- Transport Hub: feature flag readable from system_settings (default off)
-- Safe to run multiple times: keeps existing value if key already present

INSERT INTO system_settings (key, value, updated_at)
VALUES ('TRANSPORT_INTERCITY_PRICING_ENABLED', 'false', NOW())
ON CONFLICT (key) DO NOTHING;
