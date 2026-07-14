-- 202: Structured withdrawal_fee_policy JSON in payout_config (optional; fallback to withdrawal_fee_* legacy keys via app merge).
INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'withdrawal_fee_policy',
  '{
    "bank_transfer": { "mode": "flat", "fee_thb": 25, "eta_label_th": "รอบโอนถัดไป" },
    "promptpay": { "mode": "flat", "fee_thb": 25, "eta_label_th": "รอบโอนถัดไป" },
    "truemoney": { "mode": "percent", "percent": 3.6, "min_fee_thb": 0, "max_fee_thb": null, "eta_label_th": "ตามรอบ TrueMoney" },
    "provider_batch": { "mode": "flat", "fee_thb": 35, "eta_label_th": "รอบโอนมาตรฐาน" },
    "provider_instant": { "mode": "flat", "fee_thb": 50, "eta_label_th": "ถอนด่วน" },
    "processor_cost_estimate_thb": 30
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
