-- PaySo payment indexes + provider seed (Tier 1b)

CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_ref
  ON commerce.payment_intents (provider_ref)
  WHERE provider_ref IS NOT NULL AND provider_ref <> '';

CREATE INDEX IF NOT EXISTS idx_payment_intents_payso_ref
  ON commerce.payment_intents ((metadata->>'payso_reference_id'))
  WHERE metadata->>'payso_reference_id' IS NOT NULL;

INSERT INTO commerce.payment_method_availability (id, region, method, provider, currency, priority)
VALUES ('pm-th-payso', 'TH', 'promptpay', 'payso-th', 'THB', 5)
ON CONFLICT (region, method, provider) DO UPDATE SET priority = EXCLUDED.priority;

UPDATE commerce.payment_method_availability SET priority = 15 WHERE id = 'pm-th-pp';
