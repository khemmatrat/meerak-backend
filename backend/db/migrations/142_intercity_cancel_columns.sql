-- Intercity: milestones + employer cancel audit
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancel_fee_applied NUMERIC(14, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancel_fee_breakdown JSONB;

COMMENT ON COLUMN jobs.started_at IS 'Intercity: คนขับกดเริ่มเดินทาง';
COMMENT ON COLUMN jobs.arrived_at IS 'Intercity: ถึงจุดรับของ';
COMMENT ON COLUMN jobs.cancel_fee_breakdown IS 'รายละเอียดค่าธรรมเนียมยกเลิก (tier, driver, platform)';
