-- =============================================================================
-- 215: Gold Lotto — prize fulfillment (delivery address, status, PDPA consent)
-- =============================================================================

ALTER TABLE aqond_gold_lotto_winners
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(32) NOT NULL DEFAULT 'pending_delivery';

ALTER TABLE aqond_gold_lotto_winners
  DROP CONSTRAINT IF EXISTS aqond_gold_lotto_winners_delivery_status_check;

ALTER TABLE aqond_gold_lotto_winners
  ADD CONSTRAINT aqond_gold_lotto_winners_delivery_status_check
  CHECK (delivery_status IN (
    'pending_delivery',
    'awaiting_address',
    'address_submitted',
    'delivered',
    'confirmed',
    'declined'
  ));

ALTER TABLE aqond_gold_lotto_winners
  ADD COLUMN IF NOT EXISTS delivery_address_json JSONB;

ALTER TABLE aqond_gold_lotto_winners
  ADD COLUMN IF NOT EXISTS delivery_consent_at TIMESTAMPTZ;

ALTER TABLE aqond_gold_lotto_winners
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

ALTER TABLE aqond_gold_lotto_winners
  ADD COLUMN IF NOT EXISTS delivery_delivered_at TIMESTAMPTZ;

ALTER TABLE aqond_gold_lotto_winners
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gold_lotto_winners_delivery_status
  ON aqond_gold_lotto_winners (campaign_id, delivery_status);

-- เปิด require KYC สำหรับผู้ชนะ (admin ปิดได้ใน config)
UPDATE payout_config
SET value_json = jsonb_set(
  COALESCE(value_json, '{}'::jsonb),
  '{require_kyc_for_winner}',
  'true'::jsonb,
  true
),
updated_at = NOW()
WHERE key = 'gold_lotto_campaign';

COMMENT ON COLUMN aqond_gold_lotto_winners.delivery_status IS
  'pending_delivery → awaiting_address (publish) → address_submitted → delivered → confirmed';
