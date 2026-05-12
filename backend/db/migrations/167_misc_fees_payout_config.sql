-- 167: Misc fees (ไม่ใช่ payout threshold) — ใบรับรองรายได้, ช่วง min–max, sync กับ mobile/admin
INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'misc_fees',
  '{
    "certified_statement_fee_thb": 50,
    "certified_statement_fee_min_thb": 25,
    "certified_statement_fee_max_thb": 100
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
