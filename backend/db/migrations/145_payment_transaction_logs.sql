-- บันทึกยอดเต็ม / MDR / ประมาณกำไรหลังหักค่าธรรมเนียมโปรเซสเซอร์ (สำหรับ Admin + audit)

CREATE TABLE IF NOT EXISTS payment_transaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_id TEXT,
  user_id UUID,
  external_id TEXT,
  gateway TEXT NOT NULL DEFAULT 'unknown',
  payment_channel TEXT NOT NULL DEFAULT 'promptpay',
  gross_amount_thb NUMERIC(18, 2),
  mdr_rate_decimal NUMERIC(18, 8),
  mdr_fee_thb NUMERIC(18, 2),
  fixed_fee_thb NUMERIC(18, 2),
  net_after_processor_thb NUMERIC(18, 2),
  platform_markup_thb NUMERIC(18, 2),
  net_profit_estimate_thb NUMERIC(18, 2),
  event_type TEXT,
  status TEXT DEFAULT 'recorded',
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_payment_transaction_logs_created ON payment_transaction_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transaction_logs_job ON payment_transaction_logs (job_id);
CREATE INDEX IF NOT EXISTS idx_payment_transaction_logs_gateway ON payment_transaction_logs (gateway);

COMMENT ON TABLE payment_transaction_logs IS 'Gateway charge / webhook audit — gross, MDR, net after processor, optional platform profit estimate';
COMMENT ON COLUMN payment_transaction_logs.net_profit_estimate_thb IS 'ประมาณกำไรสุทธิ = platform markup − processor fee (ถ้ามีตัวเลข markup)';
