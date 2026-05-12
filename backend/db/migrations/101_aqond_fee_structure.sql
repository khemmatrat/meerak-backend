-- 101: AQOND Fee Structure — Handling Fee 8%, Payment Markup 5%
-- เพิ่ม handling_fee_percent และ payment_markup_percent ใน fee_rates
UPDATE payout_config
SET value_json = jsonb_set(
  jsonb_set(
    COALESCE(value_json, '{}'::jsonb),
    '{handling_fee_percent}',
    '8'
  ),
  '{payment_markup_percent}',
  '5'
)
WHERE key = 'fee_rates';

-- ถ้าไม่มี fee_rates ให้ insert
INSERT INTO payout_config (key, value_json, updated_at)
SELECT 'fee_rates',
  '{"handling_fee_percent":8,"payment_markup_percent":5,"platform_fee":{"none":8,"silver":6,"gold":5,"platinum":4},"commission_match_board":{"none":24,"silver":18,"gold":15,"platinum":12},"commission_booking":{"none":32,"silver":18,"gold":15,"platinum":12}}'::jsonb,
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM payout_config WHERE key = 'fee_rates');

COMMENT ON COLUMN payout_config.value_json IS 'fee_rates: handling_fee_percent (8), payment_markup_percent (5), commission_match_board, commission_booking';
