-- Brand Adviser Grand Prize — campaign config (qualifying user milestones)
INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'brand_adviser_campaign',
  '{
    "enabled": true,
    "campaign_name": "Brand Adviser Grand Prize",
    "start_at": "2026-06-06T00:00:00+07:00",
    "end_at": "2026-12-30T23:59:59+07:00",
    "min_purchase_thb": 100,
    "milestones": [
      {
        "target": 70000,
        "label": "รางวัลที่ 3",
        "prize": "Honda PCX 160 Roadsync 2025 + เงินสด 20,000 บาท"
      },
      {
        "target": 200000,
        "label": "รางวัลที่ 2",
        "prize": "Mercedes-Benz GLA 200 AMG Dynamic + เงินสด 100,000 บาท"
      },
      {
        "target": 500000,
        "label": "รางวัลที่ 1",
        "prize": "BMW X1 sDrive20i M Sport 2026 + เงินสด 500,000 บาท"
      }
    ]
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
