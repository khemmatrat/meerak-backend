-- 120: Dynamic Fee Structure (ตามที่เจ้านายสั่งเด็ดขาด)
-- Sourcing: N/S=8%, G/P=6% | Booking: N=32%, S=28%, G=24%, P=20% | Bidding: N/S=9.3%, G=8.3%, P=6.3%
UPDATE payout_config
SET value_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(value_json, '{}'::jsonb),
      '{sourcing_fee}',
      '{"none":8,"silver":8,"gold":6,"platinum":6}'::jsonb
    ),
    '{booking_fee}',
    '{"none":32,"silver":28,"gold":24,"platinum":20}'::jsonb
  ),
  '{bidding_fee}',
  '{"none":9.3,"silver":9.3,"gold":8.3,"platinum":6.3}'::jsonb
)
WHERE key = 'fee_rates';

INSERT INTO payout_config (key, value_json, updated_at)
SELECT 'fee_rates',
  '{"handling_fee_percent":8,"payment_markup_percent":5,"sourcing_fee":{"none":8,"silver":8,"gold":6,"platinum":6},"booking_fee":{"none":32,"silver":28,"gold":24,"platinum":20},"bidding_fee":{"none":9.3,"silver":9.3,"gold":8.3,"platinum":6.3}}'::jsonb,
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM payout_config WHERE key = 'fee_rates');
